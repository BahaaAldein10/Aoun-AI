import { Readability } from "@mozilla/readability";
import { Job, QueueEvents, Worker } from "bullmq";
import * as cheerio from "cheerio";
import "dotenv/config";
import IORedis from "ioredis";
import { JSDOM } from "jsdom";
import mammoth from "mammoth";
import pLimit from "p-limit";
import PdfParse from "pdf-parse";
import { prisma } from "../lib/prisma";

const connection = new IORedis(process.env.REDIS_URL!);
const queueName = "ingest";

(async () => {
  // Distributed event handling
  const queueEvents = new QueueEvents(queueName, { connection });
  await queueEvents.waitUntilReady();

  queueEvents.on("completed", ({ jobId }) => {
    console.log(`Job ${jobId} completed`);
  });

  queueEvents.on("failed", ({ jobId, failedReason }) => {
    console.error(`Job ${jobId} failed: ${failedReason}`);
  });

  // small helper chunker
  function chunkText(text: string, chunkSize = 1200, overlap = 200) {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      start = end - overlap;
      if (start < 0) start = 0;
      if (start >= text.length) break;
    }
    return chunks;
  }

  async function createEmbeddingsForTexts(
    texts: string[],
    model = "text-embedding-3-small",
  ) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`OpenAI embeddings error: ${res.status} - ${txt}`);
    }
    const body = await res.json();
    return body.data.map(
      (d: { embedding: number[] }) => d.embedding as number[],
    );
  }

  async function extractTextFromBuffer(
    buffer: Buffer,
    filename = "",
    mimeType?: string,
  ) {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf" || mimeType === "application/pdf") {
      try {
        const parsed = await PdfParse(buffer);
        return (parsed.text || "").replace(/\s+/g, " ").trim();
      } catch (err) {
        console.error("pdf-parse error:", err);
      }
    }
    if (ext === "docx" || (mimeType && mimeType.includes("word"))) {
      try {
        const res = await mammoth.extractRawText({ buffer });
        return (res.value || "").replace(/\s+/g, " ").trim();
      } catch (err) {
        console.error("mammoth error:", err);
      }
    }
    try {
      return buffer.toString("utf-8").replace(/\s+/g, " ").trim();
    } catch (err) {
      console.error("fallback decode error:", err);
      return "";
    }
  }

  async function fetchHtml(url: string) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.text();
  }

  function extractMainTextFromHtml(html: string, url: string) {
    try {
      const dom = new JSDOM(html, { url });
      const doc = new Readability(dom.window.document).parse();
      if (doc && doc.textContent && doc.textContent.trim().length > 20) {
        return (doc.textContent || "").replace(/\s+/g, " ").trim();
      }
    } catch {}
    const $ = cheerio.load(html);
    const paragraphs: string[] = [];
    $("p").each((i, el) => {
      const txt = $(el).text().trim();
      if (txt.length > 20) paragraphs.push(txt);
    });
    return paragraphs.join("\n\n").replace(/\s+/g, " ").trim();
  }

  // limit concurrency for DB writes if needed
  const limit = pLimit(2);

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      const { kbId, uploadedFileId, url, userId } = job.data;

      // Retrieve KB
      const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } });
      if (!kb) throw new Error("KB not found for job");

      const existingStatus =
        (kb.metadata as { ingestStatus: string })?.ingestStatus ?? null;
      if (existingStatus === "processing" || existingStatus === "done") {
        console.log(`KB ${kbId} already ${existingStatus}, skipping job.`);
        return { ok: true, message: "Already processed" };
      }
      // Update KB metadata to processing + mark uploaded file if exists
      await prisma.knowledgeBase.update({
        where: { id: kbId },
        data: {
          metadata: {
            ...((kb.metadata as object) ?? {}),
            ingestStatus: "processing",
            startedAt: new Date().toISOString(),
          },
        },
      });

      if (uploadedFileId) {
        await prisma.uploadedFile.update({
          where: { id: uploadedFileId },
          data: {
            meta: {
              ...(((
                await prisma.uploadedFile.findUnique({
                  where: { id: uploadedFileId },
                })
              )?.meta as object) ?? {}),
              ingestStatus: "processing",
              kbId,
              startedAt: new Date().toISOString(),
            },
          },
        });
      }

      try {
        // Two modes: URL crawl OR file ingest
        const pages: { url?: string; text: string }[] = [];

        if (url) {
          const html = await fetchHtml(url);
          const text = extractMainTextFromHtml(html, url);
          if (text && text.length > 50) pages.push({ url, text });
          if (pages.length === 0) {
            throw new Error("No textual content found at URL");
          }
        } else if (uploadedFileId) {
          const uploaded = await prisma.uploadedFile.findUnique({
            where: { id: uploadedFileId },
          });
          if (!uploaded) throw new Error("Uploaded file not found");
          const fileUrl = uploaded.url;
          const resp = await fetch(fileUrl);
          if (!resp.ok) throw new Error("Failed to download uploaded file");
          const buf = Buffer.from(await resp.arrayBuffer());
          const text = await extractTextFromBuffer(
            buf,
            uploaded.filename,
            uploaded.fileType ?? undefined,
          );
          if (!text || text.length < 10)
            throw new Error("No text extracted from file");
          pages.push({ url: fileUrl, text });
        } else {
          throw new Error("job missing url and uploadedFileId");
        }

        // process pages sequentially, chunk, embed in small batches, persist immediately
        const BATCH_SIZE = 12;
        let totalChunks = 0;
        let pagesProcessed = 0;

        for (const page of pages) {
          const chunks = chunkText(page.text, 1200, 200);
          for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const embeddings = await createEmbeddingsForTexts(batch);

            for (let j = 0; j < batch.length; j++) {
              const chunkText = batch[j];
              const vector = embeddings[j] ?? [];

              await limit(async () => {
                const doc = await prisma.document.create({
                  data: {
                    kbId,
                    filename: null,
                    mimeType: url ? "text/html" : undefined,
                    size: chunkText.length,
                    content: chunkText,
                    metadata: {
                      pageUrl: page.url,
                      chunkIndex: totalChunks + i + j,
                    },
                  },
                });

                await prisma.embedding.create({
                  data: {
                    kbId,
                    vector,
                    text: chunkText.slice(0, 1000),
                    meta: {
                      pageUrl: page.url,
                      chunkIndex: totalChunks + i + j,
                    },
                  },
                });
              });
            }
          }
          totalChunks += chunks.length;
          pagesProcessed++;
          page.text = "";
          job.updateProgress(
            Math.min(100, Math.floor((pagesProcessed / pages.length) * 100)),
          );
        }

        await prisma.knowledgeBase.update({
          where: { id: kbId },
          data: {
            metadata: {
              ...((kb.metadata as object) ?? {}),
              ingestStatus: "done",
              ingestedAt: new Date().toISOString(),
              pages: pagesProcessed,
              chunks: totalChunks,
            },
          },
        });

        if (uploadedFileId) {
          await prisma.uploadedFile.update({
            where: { id: uploadedFileId },
            data: {
              meta: {
                ...(((
                  await prisma.uploadedFile.findUnique({
                    where: { id: uploadedFileId },
                  })
                )?.meta as object) ?? {}),
                ingestStatus: "done",
                kbId,
                ingestedAt: new Date().toISOString(),
              },
            },
          });
        }

        return {
          success: true,
          kbId,
          pages: pagesProcessed,
          chunks: totalChunks,
        };
      } catch (err) {
        console.error("Worker job error:", err);

        await prisma.knowledgeBase.update({
          where: { id: kbId },
          data: {
            metadata: {
              ...((kb.metadata as object) ?? {}),
              ingestStatus: "failed",
              ingestError: (err as Error).message || String(err),
            },
          },
        });

        if (uploadedFileId) {
          await prisma.uploadedFile.update({
            where: { id: uploadedFileId },
            data: {
              meta: {
                ...(((
                  await prisma.uploadedFile.findUnique({
                    where: { id: uploadedFileId },
                  })
                )?.meta as object) ?? {}),
                ingestStatus: "failed",
                ingestError: (err as Error).message || String(err),
              },
            },
          });
        }

        throw err;
      }
    },
    {
      connection,
      concurrency: 1,
    },
  );

  console.log("Ingest worker started and ready to process jobs...");
})().catch(console.error);
