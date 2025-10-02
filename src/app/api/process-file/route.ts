/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import {
  InputJsonValue,
  PrismaClientKnownRequestError,
} from "@prisma/client/runtime/library";
import { Client as QStashClient } from "@upstash/qstash";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import pRetry from "p-retry";

const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN! });

// File processing configuration
const FILE_CONFIG = {
  maxFileSizeBytes: 100 * 1024 * 1024, // 100MB
  supportedTypes: {
    pdf: ["application/pdf", ".pdf"],
    word: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      ".docx",
      ".doc",
    ],
  },
  timeoutMs: 60_000, // 1 minute timeout for processing
  retryAttempts: 3,
} as const;

interface FileMetadata {
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  processedAt: string;
  processingTimeMs?: number;
  wordCount?: number;
  pageCount?: number;
  extractionMethod: string;
  errors?: string[];
}

/** Determine file type from MIME type and filename */
function determineFileType(
  mimeType?: string,
  filename?: string,
): "pdf" | "word" | "unknown" {
  const mime = (mimeType || "").toLowerCase();
  const name = (filename || "").toLowerCase();

  // PDF
  if (
    FILE_CONFIG.supportedTypes.pdf.some(
      (t) => mime.includes(t) || name.endsWith(t),
    )
  ) {
    return "pdf";
  }

  // Word
  if (
    FILE_CONFIG.supportedTypes.word.some(
      (t) => mime.includes(t) || name.endsWith(t),
    )
  ) {
    return "word";
  }

  return "unknown";
}

/** Fetch file with retry and size validation */
async function fetchFileWithRetry(
  fileUrl: string,
  maxSizeBytes: number,
): Promise<Buffer> {
  return pRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        FILE_CONFIG.timeoutMs,
      );

      try {
        const res = await fetch(fileUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "file-processor/1.0" },
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        // Content-Length check
        const contentLength = res.headers.get("content-length");
        if (contentLength && Number(contentLength) > maxSizeBytes) {
          throw new Error(
            `File too large: ${contentLength} bytes exceeds limit ${maxSizeBytes}`,
          );
        }

        const ab = await res.arrayBuffer();
        if (ab.byteLength === 0) throw new Error("Empty file received");
        if (ab.byteLength > maxSizeBytes) {
          throw new Error(
            `File too large: ${ab.byteLength} bytes exceeds limit ${maxSizeBytes}`,
          );
        }

        return Buffer.from(ab);
      } finally {
        clearTimeout(timeoutId);
      }
    },
    {
      retries: FILE_CONFIG.retryAttempts,
      minTimeout: 1000,
      maxTimeout: 5000,
      factor: 2,
      onFailedAttempt: ({ attemptNumber, error }) => {
        console.warn(
          `File fetch attempt ${attemptNumber} failed for ${fileUrl}:`,
          error?.message ?? error,
        );
      },
    },
  );
}

// Extract text from PDF using pdfjs-dist
async function extractTextFromPDF(
  buffer: Buffer,
  opts?: { concurrency?: number },
): Promise<{ text: string; pageCount?: number; errors?: string[] }> {
  const concurrency = Math.max(1, opts?.concurrency ?? 4);

  try {
    const g = globalThis as any;
    if (!g.DOMMatrix)
      g.DOMMatrix = class DOMMatrix {
        constructor(..._args: any[]) {}
      };
    if (!g.ImageData) {
      g.ImageData = class ImageData {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        constructor(data: Uint8ClampedArray, width: number, height: number) {
          this.data = data;
          this.width = width;
          this.height = height;
        }
      };
    }
    if (!g.Path2D)
      g.Path2D = class Path2D {
        constructor(_d?: any) {}
      };

    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // Use GlobalWorkerOptions to avoid worker setup. Cast to any for non-typed flags.
    if (pdfjsLib?.GlobalWorkerOptions) {
      (pdfjsLib.GlobalWorkerOptions as any).workerSrc = "";
      // set the non-typed flag via cast
      (pdfjsLib.GlobalWorkerOptions as any).disableWorker = true;
    }

    // Remove disableWorker here to satisfy TypeScript types
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableAutoFetch: true,
    });

    const pdf = await loadingTask.promise;
    const numPages = pdf?.numPages ?? 0;

    async function extractPageText(pageNo: number) {
      const page = await pdf.getPage(pageNo);
      const textContent = await page.getTextContent();
      const pageText = (textContent.items ?? [])
        .map((it: unknown) => {
          if (!it || typeof it !== "object") return "";
          if ("str" in it && typeof (it as any).str === "string")
            return (it as any).str;
          if ("unicode" in it && typeof (it as any).unicode === "string")
            return (it as any).unicode;
          if ("text" in it && typeof (it as any).text === "string")
            return (it as any).text;
          return "";
        })
        .filter(Boolean)
        .join(" ");
      return pageText;
    }

    const results: string[] = [];
    for (let i = 1; i <= numPages; i += concurrency) {
      const batchCount = Math.min(concurrency, numPages - i + 1);
      const batchPromises: Promise<string>[] = new Array(batchCount)
        .fill(0)
        .map((_, k) => extractPageText(i + k));
      const batchTexts = await Promise.all(batchPromises);
      results.push(...batchTexts);
    }

    const fullText = results.join("\n");
    return {
      text: fullText,
      pageCount: numPages,
      errors: fullText ? undefined : ["No text content found in PDF"],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("PDF parsing failed (text-only):", err);
    return { text: "", errors: [`PDF parsing failed: ${msg}`] };
  }
}

/** Extract text from Word (.docx) using mammoth */
async function extractTextFromWord(buffer: Buffer) {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.default.extractRawText({ buffer });
    return {
      text: result.value ?? "",
      errors: result.messages?.length
        ? result.messages.map((m) => `${m.type}: ${m.message}`)
        : undefined,
    };
  } catch (err) {
    console.error("Word parsing failed:", err);
    return {
      text: "",
      errors: [
        `Word parsing failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

/** Process file buffer and return text + metadata */
async function processFileContent(
  buffer: Buffer,
  fileType: "pdf" | "word",
  filename?: string,
) {
  const start = Date.now();
  let extractionMethod = "unknown";
  let extractionResult: {
    text: string;
    pageCount?: number;
    errors?: string[];
  } = { text: "" };

  if (fileType === "pdf") {
    extractionMethod = "pdfjs-dist";
    extractionResult = await extractTextFromPDF(buffer);
  } else if (fileType === "word") {
    extractionMethod = "mammoth";
    extractionResult = await extractTextFromWord(buffer);
  } else {
    throw new Error("Unsupported file type for processing");
  }

  const processingTimeMs = Date.now() - start;
  const wordCount = extractionResult.text
    ? extractionResult.text.split(/\s+/).filter(Boolean).length
    : 0;

  return {
    text: extractionResult.text,
    metadata: {
      originalFilename: filename || "Unknown",
      mimeType:
        fileType === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileSize: buffer.length,
      processedAt: new Date().toISOString(),
      processingTimeMs,
      wordCount,
      pageCount: extractionResult.pageCount,
      extractionMethod,
      errors: extractionResult.errors,
    } as FileMetadata,
  };
}

/** Save document deduped and race-safe (handles unique-race) */
async function saveDocumentIfNew(
  kbId: string,
  fileUrl: string,
  filename: string | undefined,
  mimeType: string | undefined,
  content: string,
  metadata: FileMetadata,
) {
  try {
    const existing = await prisma.document.findFirst({
      where: { kbId, sourceUrl: fileUrl },
      select: { id: true, content: true, filename: true, metadata: true },
    });

    if (existing) {
      const existingWordCount = existing.content
        ? existing.content.split(/\s+/).length
        : 0;
      const newWordCount = metadata.wordCount ?? 0;

      if (existingWordCount < newWordCount * 0.8) {
        await prisma.document.update({
          where: { id: existing.id },
          data: {
            content,
            filename: filename || existing.filename || "Untitled",
            mimeType,
            size: metadata.fileSize,
            metadata: {
              ...((existing.metadata as object) || {}),
              ...(metadata as object),
            } as InputJsonValue,
          },
        });
        console.log(`Updated existing document: ${fileUrl}`);
      }
      return existing;
    }

    try {
      const doc = await prisma.document.create({
        data: {
          kbId,
          sourceUrl: fileUrl,
          filename: filename || "Untitled",
          content,
          mimeType,
          size: metadata.fileSize,
          metadata: metadata as unknown as InputJsonValue,
        },
      });

      console.log(
        `Created new document: ${fileUrl} (${metadata.wordCount ?? "unknown"} words)`,
      );
      return doc;
    } catch (err) {
      // Handle race where another worker created the same document
      if (
        (err as PrismaClientKnownRequestError)?.code === "P2002" ||
        (err as PrismaClientKnownRequestError)?.message?.includes(
          "duplicate key",
        )
      ) {
        const doc = await prisma.document.findFirst({
          where: { kbId, sourceUrl: fileUrl },
        });
        if (doc) return doc;
      }
      throw err;
    }
  } catch (err) {
    console.error("Failed to save document:", fileUrl, err);
    throw err;
  }
}

/** Main handler */
async function handler(req: Request) {
  const payload = await req.json();
  const { kbId, userId, fileUrl, fileName, fileType, fileSize } = payload;

  if (!kbId || !userId || !fileUrl) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields: kbId, userId, or fileUrl",
      }),
      { status: 400 },
    );
  }

  console.log(
    `Processing file: ${fileName ?? fileUrl} (${fileType ?? "unknown"})`,
  );

  try {
    const detected = determineFileType(fileType, fileName);
    if (detected === "unknown") {
      console.warn(`Unsupported file type for ${fileName} (${fileType})`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "unsupported_file_type",
          supportedTypes: ["pdf", "word"],
        }),
        { status: 400 },
      );
    }

    // fetch buffer
    let buffer: Buffer;
    try {
      buffer = await fetchFileWithRetry(fileUrl, FILE_CONFIG.maxFileSizeBytes);
    } catch (err) {
      console.error("File fetch failed:", fileName, err);
      return new Response(
        JSON.stringify({
          success: false,
          error: "file_fetch_failed",
          details: err instanceof Error ? err.message : String(err),
        }),
        { status: 500 },
      );
    }

    // process file content
    let processed;
    try {
      processed = await processFileContent(buffer, detected, fileName);
    } catch (err) {
      console.error("File processing failed:", fileName, err);
      return new Response(
        JSON.stringify({
          success: false,
          error: "file_processing_failed",
          details: err instanceof Error ? err.message : String(err),
        }),
        { status: 500 },
      );
    }

    const { text, metadata: meta } = processed;

    if (!text || !text.trim() || text.trim().length < 10) {
      console.warn("No meaningful content extracted from file:", fileName);
      return new Response(
        JSON.stringify({
          success: false,
          error: "no_content_extracted",
          details: "File contains no readable text",
        }),
        { status: 200 },
      );
    }

    // ensure required fields are present and typed properly
    const completeMetadata: FileMetadata = {
      originalFilename: meta.originalFilename ?? fileName ?? "Unknown",
      mimeType: meta.mimeType ?? fileType ?? "application/octet-stream",
      fileSize: meta.fileSize ?? fileSize ?? buffer.length,
      processedAt: meta.processedAt ?? new Date().toISOString(),
      processingTimeMs: meta.processingTimeMs,
      wordCount: meta.wordCount,
      pageCount: meta.pageCount,
      extractionMethod: meta.extractionMethod ?? "unknown",
      errors: meta.errors,
    };

    // save document (race-safe)
    const savedDocument = await saveDocumentIfNew(
      kbId,
      fileUrl,
      fileName,
      fileType,
      text,
      completeMetadata,
    );

    // queue embeddings job (don't fail if this fails)
    try {
      if (savedDocument?.id) {
        await qstash.publishJSON({
          url: `${process.env.BASE_URL ?? process.env.BASE_URL}/api/process-embeddings`,
          body: { kbId, documentId: savedDocument.id, userId },
          delay: 10,
        });
        console.log(
          `Queued embedding processing for document ${savedDocument.id}`,
        );
      }
    } catch (err) {
      console.error("Failed to queue embedding processing:", err);
    }

    return new Response(
      JSON.stringify({
        success: true,
        filename: fileName,
        wordCount: completeMetadata.wordCount,
        processingTimeMs: completeMetadata.processingTimeMs,
        extractionMethod: completeMetadata.extractionMethod,
        pageCount: completeMetadata.pageCount,
        errors: completeMetadata.errors?.length
          ? completeMetadata.errors
          : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Handler error for file:", fileName, err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "internal_error",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const POST = verifySignatureAppRouter(handler);
