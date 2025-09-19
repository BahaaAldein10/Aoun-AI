import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import OpenAI from "openai";
import upstashVector, { createVector, Vector } from "./upstash-vector";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Configuration
const EMBEDDING_CONFIG = {
  model: "text-embedding-3-small",
  maxTokensPerChunk: 8000,
  chunkOverlap: 200,
  minChunkSize: 100,
} as const;

const PRISMA_BATCH_SIZE = 500;
const UPSTASH_BATCH_SIZE = 500;
const EXPECTED_DIMENSION = 1536;

export interface ChunkMetadata {
  documentId: string;
  chunkIndex: number;
  totalChunks: number;
  startOffset: number;
  endOffset: number;
  sourceUrl?: string;
  filename?: string;
}

/**
 * Split text into chunks for embedding
 */
function chunkText(
  text: string,
  maxTokens: number = EMBEDDING_CONFIG.maxTokensPerChunk,
): string[] {
  if (!text || text.trim().length === 0) return [];

  const estimatedTokensPerChar = 0.25;
  const maxCharsPerChunk = Math.floor(maxTokens / estimatedTokensPerChar);

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);

  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;

    if (currentChunk.length + trimmedParagraph.length > maxCharsPerChunk) {
      if (currentChunk.trim().length > EMBEDDING_CONFIG.minChunkSize) {
        chunks.push(currentChunk.trim());
      }

      const words = currentChunk.trim().split(/\s+/);
      const overlapWords = Math.min(
        words.length,
        Math.floor(EMBEDDING_CONFIG.chunkOverlap / 5),
      );
      const overlap = words.slice(-overlapWords).join(" ");

      currentChunk = overlap
        ? `${overlap} ${trimmedParagraph}`
        : trimmedParagraph;
    } else {
      currentChunk = currentChunk
        ? `${currentChunk}\n\n${trimmedParagraph}`
        : trimmedParagraph;
    }
  }

  if (currentChunk.trim().length > EMBEDDING_CONFIG.minChunkSize) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Create embeddings for text chunks using OpenAI
 */
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    console.log(
      `Creating embeddings for ${texts.length} chunks using ${EMBEDDING_CONFIG.model}`,
    );

    const response = await openai.embeddings.create({
      model: EMBEDDING_CONFIG.model,
      input: texts,
      encoding_format: "float",
    });

    return response.data.map((item) => item.embedding);
  } catch (error) {
    console.error("OpenAI embedding creation failed:", error);
    throw new Error(
      `Failed to create embeddings: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Save embeddings to database
 */
async function batchCreateEmbeddingsToPrisma(
  embeddingData: {
    kbId: string;
    documentId: string;
    vector: number[];
    text: string;
    meta: ChunkMetadata;
  }[],
) {
  for (let i = 0; i < embeddingData.length; i += PRISMA_BATCH_SIZE) {
    const slice = embeddingData.slice(i, i + PRISMA_BATCH_SIZE);

    const prismaData = slice.map((item) => ({
      kbId: item.kbId,
      documentId: item.documentId, // Fix: Always include documentId
      vector: item.vector,
      text: item.text,
      meta: item.meta as unknown as Prisma.JsonValue,
    }));

    await prisma.embedding.createMany({
      data: prismaData,
    });
  }
}

async function saveEmbeddings(
  kbId: string,
  documentId: string, // Fix: Make documentId required
  chunks: string[],
  embeddings: number[][],
  metadata: Omit<
    ChunkMetadata,
    "chunkIndex" | "totalChunks" | "startOffset" | "endOffset"
  >,
) {
  if (chunks.length !== embeddings.length) {
    throw new Error("Chunks and embeddings length mismatch");
  }

  const embeddingData = chunks.map((chunk, index) => {
    let startOffset = 0;
    let endOffset = chunk.length;
    if (index > 0) {
      startOffset = chunks
        .slice(0, index)
        .reduce((sum, c) => sum + c.length, 0);
      endOffset = startOffset + chunk.length;
    }

    const chunkMetadata: ChunkMetadata = {
      ...metadata,
      chunkIndex: index,
      totalChunks: chunks.length,
      startOffset,
      endOffset,
    };

    return {
      kbId,
      documentId, // Fix: Always include documentId
      vector: embeddings[index],
      text: chunk,
      meta: chunkMetadata,
    };
  });

  // Prisma insertion in batches
  try {
    await batchCreateEmbeddingsToPrisma(embeddingData);
    console.log(
      `Saved ${embeddingData.length} embeddings to Prisma for doc ${documentId}`,
    );
  } catch (err) {
    console.error("Failed to save embeddings to database:", err);
    throw err;
  }

  // Upstash upsert using the new client
  try {
    const upstashVectors: Vector[] = embeddingData
      .map((e, index) => {
        if (
          !Array.isArray(e.vector) ||
          (EXPECTED_DIMENSION && e.vector.length !== EXPECTED_DIMENSION)
        ) {
          console.warn(
            `Vector dimension mismatch for ${documentId}::${index}: expected ${EXPECTED_DIMENSION}, got ${Array.isArray(e.vector) ? e.vector.length : typeof e.vector}`,
          );
          return null;
        }

        return createVector(`${documentId}::${index}`, e.vector, {
          documentId: documentId,
          chunkIndex: index,
          filename: metadata.filename,
          sourceUrl: metadata.sourceUrl,
          kbId,
          text: chunks[index],
        });
      })
      .filter((vector): vector is Vector => vector !== null);

    if (upstashVectors.length > 0) {
      for (let i = 0; i < upstashVectors.length; i += UPSTASH_BATCH_SIZE) {
        const batch = upstashVectors.slice(i, i + UPSTASH_BATCH_SIZE);
        await upstashVector.upsert(batch);
      }

      console.log(
        `Upserted ${upstashVectors.length} vectors to Upstash Vector for doc ${documentId}`,
      );
    } else {
      console.warn("No valid vectors to upsert to Upstash Vector");
    }
  } catch (err) {
    console.error("Failed to upsert vectors to Upstash Vector:", err);
  }
}

/**
 * Process a single document for embeddings
 * Fix: Proper document-specific embedding check
 */
export async function processDocumentEmbeddings(
  documentId: string,
): Promise<void> {
  try {
    // Fetch document from database
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { kb: { select: { id: true } } },
    });

    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }

    if (!document.content || document.content.trim().length === 0) {
      console.warn(
        `Document ${documentId} has no content, skipping embeddings`,
      );
      return;
    }

    console.log(
      `Processing embeddings for document: ${document.filename || document.sourceUrl || documentId}`,
    );

    // Fix: Check if embeddings exist for THIS specific document
    const existingEmbeddings = await prisma.embedding.findFirst({
      where: {
        kbId: document.kbId,
        documentId: documentId, // Fix: Check for this specific document
      },
      select: { id: true },
    });

    if (existingEmbeddings) {
      console.log(
        `Embeddings already exist for document ${documentId}, skipping...`,
      );
      return;
    }

    // Split content into chunks
    const chunks = chunkText(document.content);

    if (chunks.length === 0) {
      console.warn(`No valid chunks created for document ${documentId}`);
      return;
    }

    console.log(`Created ${chunks.length} chunks for document ${documentId}`);

    // Create embeddings
    const embeddings = await createEmbeddings(chunks);

    // Save to database - Fix: Pass documentId explicitly
    await saveEmbeddings(document.kbId, document.id, chunks, embeddings, {
      documentId: document.id,
      sourceUrl: document.sourceUrl ?? "",
      filename: document.filename ?? "",
    });

    console.log(`Successfully processed embeddings for document ${documentId}`);
  } catch (error) {
    console.error(
      `Failed to process embeddings for document ${documentId}:`,
      error,
    );
    throw error;
  }
}

/**
 * Process embeddings for all documents in a knowledge base
 * Fix: Proper document filtering
 */
export async function processKnowledgeBaseEmbeddings(
  kbId: string,
): Promise<void> {
  try {
    console.log(`Starting embedding processing for knowledge base ${kbId}`);

    // Fix: Get documents that don't have embeddings yet
    const documentsWithoutEmbeddings = await prisma.document.findMany({
      where: {
        kbId,
        content: { not: null },
        // Fix: Use a subquery to exclude documents that already have embeddings
        NOT: {
          embedding: {
            some: {},
          },
        },
      },
      select: {
        id: true,
        filename: true,
        sourceUrl: true,
        content: true,
      },
    });

    if (documentsWithoutEmbeddings.length === 0) {
      console.log(
        `No documents need embedding processing for knowledge base ${kbId}`,
      );
      return;
    }

    console.log(
      `Found ${documentsWithoutEmbeddings.length} documents to process for embeddings`,
    );

    // Process documents sequentially to avoid rate limits
    for (const document of documentsWithoutEmbeddings) {
      try {
        await processDocumentEmbeddings(document.id);

        // Small delay to be respectful to OpenAI API rate limits
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(
          `Failed to process embeddings for document ${document.id}:`,
          error,
        );
        // Continue with other documents instead of failing completely
      }
    }

    console.log(`Completed embedding processing for knowledge base ${kbId}`);
  } catch (error) {
    console.error(
      `Failed to process embeddings for knowledge base ${kbId}:`,
      error,
    );
    throw error;
  }
}

/**
 * Search for similar content using cosine similarity
 */
export async function searchSimilarContent(
  kbId: string,
  queryText: string,
  limit: number = 5,
  similarityThreshold: number = 0.7,
): Promise<
  Array<{
    text: string;
    similarity: number;
    metadata: ChunkMetadata;
  }>
> {
  try {
    // Create embedding for query
    const queryEmbeddings = await createEmbeddings([queryText]);
    const queryVector = queryEmbeddings[0];

    // Get all embeddings for this knowledge base
    const embeddings = await prisma.embedding.findMany({
      where: { kbId },
      select: {
        text: true,
        vector: true,
        meta: true,
      },
    });

    // Calculate similarities and sort
    const similarities = embeddings.map((embedding) => {
      const vector = embedding.vector as number[];
      const similarity = cosineSimilarity(queryVector, vector);

      return {
        text: embedding.text || "",
        similarity,
        metadata: embedding.meta as unknown as ChunkMetadata,
      };
    });

    // Filter by threshold and sort by similarity
    return similarities
      .filter((item) => item.similarity >= similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  } catch (error) {
    console.error("Failed to search similar content:", error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
