// src/app/api/realtime/search/route.ts
import { createEmbeddings } from "@/lib/embedding-service";
import { prisma } from "@/lib/prisma";
import upstashVector from "@/lib/upstash-vector";
import { upstashSearchSimilar } from "@/search/upstash-search";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEMO_KB_ID = process.env.DEMO_KB_ID ?? null;
const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 8;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const searchCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000;

type ChunkMetadata = {
  documentId?: string;
  filename?: string;
  sourceUrl?: string;
  chunkIndex?: number;
  totalChunks?: number;
  startOffset?: number;
  endOffset?: number;
};

// Demo fallback content for when no results found or KB doesn't exist
const DEMO_FALLBACK_CONTENT = {
  en: [
    {
      text: "Our platform is an AI-powered solution that helps businesses create intelligent chatbots and voice assistants. We provide comprehensive tools for document processing, knowledge base management, and conversational AI deployment.",
      label: "Platform Overview",
      similarity: 0.85,
    },
    {
      text: "Key features include: document upload and processing, vector search and retrieval, customizable chat widgets, voice conversation support, real-time WebRTC integration, multi-language support, analytics and usage tracking, and comprehensive API access for developers.",
      label: "Core Features",
      similarity: 0.82,
    },
    {
      text: "Getting started is simple: 1) Sign up for an account, 2) Create a knowledge base, 3) Upload your documents or content, 4) Customize your assistant's personality and appearance, 5) Deploy via widget embed code or API integration. Our platform supports various file formats and provides real-time processing.",
      label: "Getting Started Guide",
      similarity: 0.8,
    },
    {
      text: "We offer flexible pricing plans: Free tier with 100 messages per month for testing, Starter plan at $29/month with 10,000 messages, Professional plan at $99/month with 50,000 messages and advanced features, Enterprise plans with custom limits and dedicated support. All plans include core AI capabilities.",
      label: "Pricing Information",
      similarity: 0.78,
    },
    {
      text: "Our platform is perfect for various use cases: Customer support automation, Internal knowledge sharing, Educational content delivery, Product documentation assistance, FAQ automation, Lead qualification, Interactive content experiences, and Training and onboarding processes.",
      label: "Use Cases",
      similarity: 0.76,
    },
  ],
};

function getDemoResults(query: string, topK: number) {
  // Simple keyword matching for demo
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(/\s+/);

  const scoredResults = DEMO_FALLBACK_CONTENT.en.map((item) => {
    let score = item.similarity;

    // Boost score based on keyword matches
    keywords.forEach((keyword) => {
      if (item.text.toLowerCase().includes(keyword)) {
        score += 0.1;
      }
    });

    return {
      text: item.text,
      similarity: Math.min(score, 1.0),
      metadata: {
        filename: item.label,
        documentId: `demo-${item.label.toLowerCase().replace(/\s+/g, "-")}`,
        chunkIndex: 0,
        totalChunks: 1,
      } as ChunkMetadata,
    };
  });

  // Sort by similarity and return top results
  return scoredResults
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { kbId, query, topK = DEFAULT_TOP_K, isDemo = false } = body;

    if (!kbId || !query?.trim()) {
      return NextResponse.json(
        { error: "Missing kbId or query" },
        { status: 400 },
      );
    }

    const searchTopK = Math.max(1, Math.min(MAX_TOP_K, Number(topK)));

    const isDemoKb = DEMO_KB_ID !== null && kbId === DEMO_KB_ID;

    if (isDemo || isDemoKb) {
      console.log("Performing demo KB search:", { query, topK: searchTopK });

      const demoResults = getDemoResults(query, searchTopK);

      const sources = demoResults.map((r, i) => {
        const srcMeta = r.metadata ?? {};
        const label = srcMeta.filename || `demo-source-${i + 1}`;
        return {
          index: i + 1,
          label,
          text: r.text,
          similarity: r.similarity,
          metadata: srcMeta,
        };
      });

      const contextText = sources.length
        ? sources
            .map(
              (s, i) =>
                `SOURCE ${i + 1} (${s.label}, relevance: ${(s.similarity * 100).toFixed(1)}%):\n${s.text}`,
            )
            .join("\n\n---\n\n")
        : "Demo fallback content.";

      return NextResponse.json({
        success: true,
        query,
        kbId: DEMO_KB_ID,
        sources,
        contextText,
        totalResults: demoResults.length,
        isDemo: true,
      });
    }

    const cacheKey = `${kbId}:${query}:${searchTopK}`;
    const cached = searchCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log("Cache hit for:", cacheKey);
      return NextResponse.json(cached.data);
    }

    // Regular KB handling (non-demo)
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

    const responseData = {
      success: true,
      query,
      kbId,
      sources,
      contextText,
      totalResults: retrieved.length,
      isDemo: false,
    };

    // Cache the response
    searchCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return NextResponse.json(responseData);
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
