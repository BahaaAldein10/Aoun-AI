// src/lib/search/upstash-search.ts
import type { ChunkMetadata } from "@/lib/embedding-service";
import { createEmbeddings } from "@/lib/embedding-service";
import upstashVector from "@/lib/upstash-vector";

type NormalizedHit = {
  text: string;
  similarity: number;
  metadata: ChunkMetadata;
};

// --- helpers to safely read unknown metadata ---
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getString(obj: unknown, key: string, fallback = ""): string {
  if (!isObject(obj)) return fallback;
  const val = obj[key];
  return typeof val === "string" ? val : fallback;
}

function getNumber(obj: unknown, key: string, fallback = 0): number {
  if (!isObject(obj)) return fallback;
  const val = obj[key];
  // Accept numeric strings too
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (
    typeof val === "string" &&
    val.trim() !== "" &&
    !Number.isNaN(Number(val))
  ) {
    return Number(val);
  }
  return fallback;
}

// ---------- functions ----------
export async function upstashSearchSimilar(
  kbId: string,
  queryText: string,
  topK = 5,
): Promise<NormalizedHit[]> {
  try {
    // 1) Create query embedding
    const [queryVec] = await createEmbeddings([queryText]);
    if (!queryVec) {
      console.warn("Failed to create query embedding");
      return [];
    }

    // 2) Query Upstash Vector with knowledge base filter
    const results = await upstashVector.query(queryVec, {
      topK,
      includeMetadata: true,
      includeVectors: false,
      filter: `kbId = '${kbId}'`,
    });

    // 3) Transform results to normalized format
    return results.map((result) => {
      const md = result.metadata as Record<string, unknown> | undefined;

      const text = getString(md, "text", "");

      const metadata: ChunkMetadata = {
        documentId: getString(md, "documentId", ""),
        filename: getString(md, "filename", ""),
        sourceUrl: getString(md, "sourceUrl", ""),
        chunkIndex: getNumber(md, "chunkIndex", 0),
        totalChunks: getNumber(md, "totalChunks", 1),
        startOffset: getNumber(md, "startOffset", 0),
        endOffset: getNumber(md, "endOffset", 0),
      };

      return {
        text,
        similarity: result.score ?? 0,
        metadata,
      };
    });
  } catch (error) {
    console.error("Error in upstashSearchSimilar:", error);
    return [];
  }
}

export async function upstashSearchSimilarGlobal(
  queryText: string,
  topK = 5,
): Promise<NormalizedHit[]> {
  try {
    const [queryVec] = await createEmbeddings([queryText]);
    if (!queryVec) {
      console.warn("Failed to create query embedding");
      return [];
    }

    const results = await upstashVector.query(queryVec, {
      topK,
      includeMetadata: true,
      includeVectors: false,
    });

    return results.map((result) => {
      const md = result.metadata as Record<string, unknown> | undefined;
      const text = getString(md, "text", "");

      const metadata: ChunkMetadata = {
        documentId: getString(md, "documentId", ""),
        filename: getString(md, "filename", ""),
        sourceUrl: getString(md, "sourceUrl", ""),
        chunkIndex: getNumber(md, "chunkIndex", 0),
        totalChunks: getNumber(md, "totalChunks", 1),
        startOffset: getNumber(md, "startOffset", 0),
        endOffset: getNumber(md, "endOffset", 0),
      };

      return {
        text,
        similarity: result.score ?? 0,
        metadata,
      };
    });
  } catch (error) {
    console.error("Error in upstashSearchSimilarGlobal:", error);
    return [];
  }
}

export async function upstashSearchByDocument(
  kbId: string,
  documentId: string,
  queryText: string,
  topK = 5,
): Promise<NormalizedHit[]> {
  try {
    const [queryVec] = await createEmbeddings([queryText]);
    if (!queryVec) {
      console.warn("Failed to create query embedding");
      return [];
    }

    const results = await upstashVector.query(queryVec, {
      topK,
      includeMetadata: true,
      includeVectors: false,
      filter: `kbId = '${kbId}' AND documentId = '${documentId}'`,
    });

    return results.map((result) => {
      const md = result.metadata as Record<string, unknown> | undefined;
      const text = getString(md, "text", "");

      const metadata: ChunkMetadata = {
        documentId: getString(md, "documentId", ""),
        filename: getString(md, "filename", ""),
        sourceUrl: getString(md, "sourceUrl", ""),
        chunkIndex: getNumber(md, "chunkIndex", 0),
        totalChunks: getNumber(md, "totalChunks", 1),
        startOffset: getNumber(md, "startOffset", 0),
        endOffset: getNumber(md, "endOffset", 0),
      };

      return {
        text,
        similarity: result.score ?? 0,
        metadata,
      };
    });
  } catch (error) {
    console.error("Error in upstashSearchByDocument:", error);
    return [];
  }
}

export async function getChunkById(
  chunkId: string,
): Promise<NormalizedHit | null> {
  try {
    const results = await upstashVector.fetch([chunkId], false);

    if (!results || results.length === 0) return null;

    const result = results[0];
    const md = result.metadata as Record<string, unknown> | undefined;
    const text = getString(md, "text", "");

    const metadata: ChunkMetadata = {
      documentId: getString(md, "documentId", ""),
      filename: getString(md, "filename", ""),
      sourceUrl: getString(md, "sourceUrl", ""),
      chunkIndex: getNumber(md, "chunkIndex", 0),
      totalChunks: getNumber(md, "totalChunks", 1),
      startOffset: getNumber(md, "startOffset", 0),
      endOffset: getNumber(md, "endOffset", 0),
    };

    return { text, similarity: 1.0, metadata };
  } catch (error) {
    console.error("Error in getChunkById:", error);
    return null;
  }
}

export async function upstashHybridSearch(
  kbId: string,
  queryText: string,
  filenameFilter?: string,
  topK = 5,
): Promise<NormalizedHit[]> {
  try {
    const [queryVec] = await createEmbeddings([queryText]);
    if (!queryVec) {
      console.warn("Failed to create query embedding");
      return [];
    }

    let filter = `kbId = '${kbId}'`;
    if (filenameFilter) filter += ` AND filename = '${filenameFilter}'`;

    const results = await upstashVector.query(queryVec, {
      topK,
      includeMetadata: true,
      includeVectors: false,
      filter,
    });

    return results.map((result) => {
      const md = result.metadata as Record<string, unknown> | undefined;
      const text = getString(md, "text", "");

      const metadata: ChunkMetadata = {
        documentId: getString(md, "documentId", ""),
        filename: getString(md, "filename", ""),
        sourceUrl: getString(md, "sourceUrl", ""),
        chunkIndex: getNumber(md, "chunkIndex", 0),
        totalChunks: getNumber(md, "totalChunks", 1),
        startOffset: getNumber(md, "startOffset", 0),
        endOffset: getNumber(md, "endOffset", 0),
      };

      return {
        text,
        similarity: result.score ?? 0,
        metadata,
      };
    });
  } catch (error) {
    console.error("Error in upstashHybridSearch:", error);
    return [];
  }
}
