import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Body = {
  uploadedFileId: string;
  kbTitle?: string;
};

// chunker
function chunkText(text: string, chunkSize = 1000, overlap = 200) {
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

async function extractTextFromBuffer(
  buffer: Buffer,
  filename = "",
  mimeType?: string,
) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  // PDF - Dynamic import
  if (ext === "pdf" || mimeType === "application/pdf") {
    try {
      const PdfParse = (await import("pdf-parse")).default;
      const parsed = await PdfParse(buffer);
      return (parsed.text || "").replace(/\s+/g, " ").trim();
    } catch (err) {
      console.error("pdf-parse error:", err);
    }
  }

  // DOCX - Dynamic import
  if (ext === "docx" || (mimeType && mimeType.includes("word"))) {
    try {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ buffer });
      return (res.value || "").replace(/\s+/g, " ").trim();
    } catch (err) {
      console.error("mammoth error:", err);
    }
  }

  // fallback to utf-8
  try {
    return buffer.toString("utf-8").replace(/\s+/g, " ").trim();
  } catch (err) {
    console.error("fallback decode error:", err);
    return "";
  }
}

// OpenAI embeddings helper (batches)
async function createEmbeddingsForTexts(
  texts: string[],
  model = "text-embedding-3-small",
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI embeddings error: ${res.status} - ${text}`);
  }

  const body = await res.json();
  return body.data.map((d: { embedding: number[] }) => d.embedding as number[]);
}

export async function POST(request: Request) {
  try {
    const json = (await request.json()) as Body;
    if (!json?.uploadedFileId) {
      return NextResponse.json(
        { error: "uploadedFileId required" },
        { status: 400 },
      );
    }

    const uploadedFileId = json.uploadedFileId;

    // Load uploadedFile
    const uploadedFile = await prisma.uploadedFile.findUnique({
      where: { id: uploadedFileId },
    });
    if (!uploadedFile) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const prevMeta =
      (uploadedFile.meta as object & { ingestStatus: string }) ?? {};

    // Idempotent check: if already processing or done, return early
    if (
      prevMeta.ingestStatus === "processing" ||
      prevMeta.ingestStatus === "done"
    ) {
      return NextResponse.json({
        ok: true,
        message: `Already ${prevMeta.ingestStatus}`,
      });
    }

    // Mark as processing
    const processingMeta = {
      ...prevMeta,
      ingestStatus: "processing",
      processingStartedAt: new Date(),
    };
    await prisma.uploadedFile.update({
      where: { id: uploadedFile.id },
      data: { meta: processingMeta },
    });

    // Download file buffer
    const fileUrl = uploadedFile.url;
    const fetchResp = await fetch(fileUrl);
    if (!fetchResp.ok) {
      const errText = `Failed to download file: ${fetchResp.status}`;
      await prisma.uploadedFile.update({
        where: { id: uploadedFile.id },
        data: {
          meta: {
            ...processingMeta,
            ingestStatus: "failed",
            ingestError: errText,
          },
        },
      });
      return NextResponse.json({ error: errText }, { status: 502 });
    }
    const arrayBuffer = await fetchResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text
    const text = await extractTextFromBuffer(
      buffer,
      uploadedFile.filename,
      uploadedFile.fileType ?? undefined,
    );
    if (!text || text.length < 10) {
      const errText = "No textual content extracted from file";
      await prisma.uploadedFile.update({
        where: { id: uploadedFile.id },
        data: {
          meta: {
            ...processingMeta,
            ingestStatus: "failed",
            ingestError: errText,
          },
        },
      });
      return NextResponse.json({ error: errText }, { status: 422 });
    }

    // Create KnowledgeBase
    const kbTitle =
      json.kbTitle ?? uploadedFile.filename ?? `Upload ${uploadedFile.id}`;
    const kb = await prisma.knowledgeBase.create({
      data: {
        userId: uploadedFile.userId,
        title: kbTitle,
        source: "upload",
        description: `Ingested from uploaded file ${uploadedFile.filename}`,
        metadata: { uploadedFileId: uploadedFile.id },
      },
    });

    // Chunk text
    const chunks = chunkText(text, 1200, 200);

    // Batch embeddings
    const batchSize = 16;
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchEmbeddings = await createEmbeddingsForTexts(batch);
      embeddings.push(...batchEmbeddings);
    }

    // Persist Documents + Embeddings in series (could be parallelized carefully)
    for (let i = 0; i < chunks.length; i++) {
      const chunkTextStr = chunks[i];

      await prisma.document.create({
        data: {
          kbId: kb.id,
          filename: uploadedFile.filename,
          mimeType: uploadedFile.fileType ?? null,
          size: uploadedFile.size ?? null,
          content: chunkTextStr,
          metadata: { chunkIndex: i },
        },
      });

      const vector = embeddings[i] ?? [];
      await prisma.embedding.create({
        data: {
          kbId: kb.id,
          vector: vector,
          text: chunkTextStr.slice(0, 1000),
          meta: { uploadedFileId: uploadedFile.id, chunkIndex: i },
        },
      });
    }

    // Mark uploadedFile as done
    const doneMeta = {
      ...processingMeta,
      ingestStatus: "done",
      ingestedAt: new Date(),
      kbId: kb.id,
      chunkCount: chunks.length,
    };
    await prisma.uploadedFile.update({
      where: { id: uploadedFile.id },
      data: {
        meta: doneMeta,
      },
    });

    return NextResponse.json({
      success: true,
      kbId: kb.id,
      chunks: chunks.length,
    });
  } catch (error) {
    console.error("Error ingesting file:", error);
    // Try to update uploadedFile meta to failed (if we can parse id)
    try {
      const body = (await request.clone().json()) as Body;
      if (body?.uploadedFileId) {
        const prev =
          (
            await prisma.uploadedFile.findUnique({
              where: { id: body.uploadedFileId },
            })
          )?.meta ?? {};
        await prisma.uploadedFile.update({
          where: { id: body.uploadedFileId },
          data: {
            meta: {
              ...(prev as object),
              ingestStatus: "failed",
              ingestError: String((error as Error)?.message ?? error),
            },
          },
        });
      }
    } catch {
      // ignore
    }
    return NextResponse.json(
      { error: (error as Error)?.message ?? String(error) },
      { status: 500 },
    );
  }
}
