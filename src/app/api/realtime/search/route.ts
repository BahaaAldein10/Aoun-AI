// src/app/api/realtime/search/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createEmbeddings } from "@/lib/embedding-service";
import upstashVector from "@/lib/upstash-vector";
import { upstashSearchSimilar } from "@/search/upstash-search";

export const runtime = "nodejs";

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 8;

type ChunkMetadata = {
  documentId?: string;
  filename?: string;
  sourceUrl?: string;
  chunkIndex?: number;
  totalChunks?: number;
  startOffset?: number;
  endOffset?: number;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { kbId, query, topK = DEFAULT_TOP_K } = body;

    if (!kbId || !query?.trim()) {
      return NextResponse.json(
        { error: "Missing kbId or query" },
        { status: 400 },
      );
    }

    // Validate KB exists
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: {
        id: true,
        title: true,
        metadata: true,
      },
    });

    if (!kb) {
      return NextResponse.json(
        { error: "Knowledge base not found" },
        { status: 404 },
      );
    }

    const searchTopK = Math.max(1, Math.min(MAX_TOP_K, Number(topK)));

    // Perform retrieval
    let retrieved: Array<{
      text: string;
      similarity: number;
      metadata: ChunkMetadata;
    }> = [];

    try {
      // First try vector search
      const embeddings = await createEmbeddings([query]);
      const queryVec = embeddings[0];

      if (queryVec) {
        const results = await upstashVector.query(queryVec, {
          topK: searchTopK,
          includeMetadata: true,
          includeVectors: false,
          filter: `kbId = '${kbId.replace(/'/g, "\\'")}'`,
        });

        retrieved = (results ?? []).map((result) => {
          const md = result.metadata as Record<string, unknown> | undefined;
          const text = (md?.text as string) ?? "";
          const metadata: ChunkMetadata = {
            documentId: (md?.documentId as string) ?? "",
            filename: (md?.filename as string) ?? "",
            sourceUrl: (md?.sourceUrl as string) ?? "",
            chunkIndex: Number(md?.chunkIndex ?? 0),
            totalChunks: Number(md?.totalChunks ?? 1),
            startOffset: Number(md?.startOffset ?? 0),
            endOffset: Number(md?.endOffset ?? 0),
          };
          return {
            text,
            similarity: result.score ?? 0,
            metadata,
          };
        });
      } else {
        // Fallback to text search
        retrieved = await upstashSearchSimilar(kbId, query, searchTopK);
      }
    } catch (err) {
      console.error("KB search failed:", err);
      // Fallback to upstash search
      try {
        retrieved = await upstashSearchSimilar(kbId, query, searchTopK);
      } catch (fallbackErr) {
        console.error("Fallback search also failed:", fallbackErr);
        retrieved = [];
      }
    }

    // Format results for consumption
    const sources = retrieved.map((r, i) => {
      const srcMeta = r.metadata ?? {};
      const label = srcMeta.filename || srcMeta.sourceUrl || `source-${i + 1}`;
      return {
        index: i + 1,
        label,
        text: r.text,
        similarity: r.similarity,
        metadata: srcMeta,
      };
    });

    // Create a context string for the AI
    const contextText = sources.length
      ? sources
          .map(
            (s, i) =>
              `SOURCE ${i + 1} (${s.label}, relevance: ${(s.similarity * 100).toFixed(1)}%):\n${s.text}`,
          )
          .join("\n\n---\n\n")
      : "No relevant information found in the knowledge base for this query.";

    return NextResponse.json({
      success: true,
      query,
      kbId,
      sources,
      contextText,
      totalResults: retrieved.length,
    });
  } catch (err) {
    console.error("Realtime search error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
