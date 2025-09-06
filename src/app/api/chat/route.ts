// src/app/api/chat/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";

import type { ChunkMetadata } from "@/lib/embedding-service";
import { prisma } from "@/lib/prisma";
import {
  CacheService,
  checkRateLimit,
  createHash,
  getUserIdentifier,
} from "@/lib/upstash";
import { upstashSearchSimilar } from "@/search/upstash-search";
import crypto from "crypto";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import OpenAI from "openai";

// ---------- Config ----------
const OPENAI_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";
const DEFAULT_TOP_K = Number(process.env.CHAT_DEFAULT_TOP_K ?? 5);
const MAX_TOP_K = Number(process.env.CHAT_MAX_TOP_K ?? 8);
const MAX_PROMPT_TOKENS = Number(process.env.CHAT_MAX_CONTEXT_TOKENS ?? 3000);
const JWT_SECRET = process.env.WIDGET_JWT_SECRET!;

if (!JWT_SECRET) throw new Error("WIDGET_JWT_SECRET not defined");

// ---------- OpenAI ----------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cache instance
const cache = CacheService.getInstance();

// ---------- Types ----------
type ChatRequestBody = {
  kbId?: string;
  message?: string;
  conversationId?: string | null;
  history?: Array<{ role?: "user" | "assistant" | string; text?: string }>;
  userId?: string;
  topK?: number;
};

// ---------- Helpers ----------
function sanitizeText(s: string) {
  return (s || "").toString().trim();
}

// ---------- POST Handler ----------
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ChatRequestBody;
    const {
      kbId,
      message,
      conversationId,
      history = [],
      topK: requestedTopK,
    } = body || {};

    if (!kbId || !message?.trim())
      return NextResponse.json(
        { error: "Missing kbId or message" },
        { status: 400 },
      );

    // --- Widget JWT verification ---
    const authHeader = (req.headers.get("authorization") || "").replace(
      /^Bearer\s+/,
      "",
    );
    let widgetPayload: { kbId?: string; origin?: string } | null = null;
    if (authHeader) {
      try {
        const secretKey = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jwtVerify(authHeader, secretKey);

        widgetPayload = {
          kbId: payload.kbId as string | undefined,
          origin: payload.origin as string | undefined,
        };

        // require token's kbId to match requested kbId (keeps tight scoping)
        if (widgetPayload.kbId !== kbId) {
          return NextResponse.json(
            { error: "KB ID mismatch in widget token" },
            { status: 403 },
          );
        }
      } catch {
        widgetPayload = null;
      }
    }

    // --- Rate limiting with Upstash ---
    const userIdentifier = getUserIdentifier(req, widgetPayload);
    const rateLimit = await checkRateLimit(userIdentifier, "chat");

    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          limit: rateLimit.limit,
          remaining: rateLimit.remaining,
          reset: rateLimit.reset.toISOString(),
        },
        { status: 429 },
      );
    }

    // --- Load KB from cache first, then DB ---
    let kbData = await cache.getKbMetadata(kbId);
    if (!kbData) {
      const kb = await prisma.knowledgeBase.findUnique({
        where: { id: kbId },
        select: { id: true, title: true, metadata: true, userId: true },
      });

      if (!kb) {
        return NextResponse.json(
          { error: "Knowledge base not found" },
          { status: 404 },
        );
      }

      kbData = {
        id: kb.id,
        title: kb.title,
        userId: kb.userId,
        metadata: (kb.metadata as Record<string, any>) ?? {},
      };

      // Cache KB metadata
      await cache.setKbMetadata(kbId, kbData);
    }

    const metadata = kbData.metadata;

    // If the request used a widget token, ensure the token's parent origin
    // (the page that requested the token) is allowed for this KB.
    if (widgetPayload) {
      const allowedOrigins = Array.isArray(metadata.allowedOrigins)
        ? metadata.allowedOrigins.map((o: string) => new URL(o).origin)
        : [];

      if (widgetPayload.origin && allowedOrigins.length > 0) {
        if (!allowedOrigins.includes(widgetPayload.origin)) {
          return NextResponse.json(
            { error: "Origin not allowed for widget token" },
            { status: 403 },
          );
        }
      } else {
        // token has no origin — treat as invalid for widget usage
        return NextResponse.json(
          { error: "Invalid widget token (missing origin)" },
          { status: 403 },
        );
      }
    }

    // --- API key protection for private KBs ---
    if (!widgetPayload) {
      const storedHashHex =
        typeof metadata.apiKeyHash === "string"
          ? metadata.apiKeyHash
          : undefined;

      // Always-private: require an API key hash to be configured.
      if (!storedHashHex) {
        return NextResponse.json(
          { error: "Knowledge base is private; API key required" },
          { status: 401 },
        );
      }

      // Ensure there is an incoming header
      if (!authHeader) {
        return NextResponse.json(
          { error: "Unauthorized for this KB" },
          { status: 401 },
        );
      }

      // Normalize incoming token (trim) then hash and compare with stored hex using timingSafeEqual
      const incomingToken = authHeader.trim();
      const incomingHashBuf = crypto
        .createHash("sha256")
        .update(incomingToken, "utf8")
        .digest(); // Buffer
      const storedHashBuf = Buffer.from(storedHashHex, "hex");

      // timingSafeEqual requires buffers to have same length
      if (
        storedHashBuf.length !== incomingHashBuf.length ||
        !crypto.timingSafeEqual(storedHashBuf, incomingHashBuf)
      ) {
        return NextResponse.json(
          { error: "Unauthorized for this KB" },
          { status: 401 },
        );
      }
    }

    // --- Determine topK ---
    const topK = Math.max(
      1,
      Math.min(MAX_TOP_K, Number(requestedTopK ?? DEFAULT_TOP_K)),
    );

    // Check cache for this exact query first
    const messageHash = createHash(message);
    const cachedResponse = await cache.getChatResponse(kbId, messageHash);

    if (cachedResponse) {
      // Return cached response but still log usage
      (async () => {
        try {
          await prisma.usage.create({
            data: {
              userId: kbData.userId,
              botId: null,
              date: new Date(),
              interactions: 1,
              minutes: 0,
              meta: {
                kbId,
                conversationId: conversationId ?? null,
                cached: true,
                promptSize: 0, // cached response
                retrievedCount: cachedResponse.sources?.length ?? 0,
              },
            },
          });
        } catch (err) {
          console.warn("Failed to write usage log:", err);
        }
      })();

      return NextResponse.json({
        success: true,
        text: cachedResponse.text,
        conversationId: conversationId ?? null,
        sources: cachedResponse.sources,
        rateLimit: { remaining: rateLimit.remaining },
        cached: true,
      });
    }

    // --- Retrieval with caching ---
    let retrieved: Array<{
      text: string;
      similarity: number;
      metadata: ChunkMetadata;
    }> = [];

    try {
      // Check if we have cached embeddings for this message
      const embedding = await cache.getEmbedding(message);

      if (embedding) {
        // Use cached embedding for vector search
        // Note: This would require modifying upstashSearchSimilar to accept pre-computed embeddings
        // For now, we'll use the existing function which will compute embeddings internally
        retrieved = await upstashSearchSimilar(kbId, message, topK);
      } else {
        retrieved = await upstashSearchSimilar(kbId, message, topK);

        // Cache the embedding that was computed during retrieval
        // This would require exposing the embedding from upstashSearchSimilar
        // For now, we'll generate and cache it separately if needed
      }
    } catch (err) {
      console.error("Retrieval failed:", err);
    }

    const sourceBlocks = retrieved.map((r, i) => {
      const srcMeta = r.metadata ?? {};
      const label = srcMeta.filename || srcMeta.sourceUrl || `source-${i + 1}`;
      return `SOURCE ${i + 1} (${label}, score=${(r.similarity || 0).toFixed(3)}):\n${r.text}`;
    });

    // --- Build prompt ---
    const personality = (metadata?.personality as string) ?? "";
    const systemInstruction =
      `You are an assistant answering user questions using the provided sources. ${personality}`.trim();
    const retrievalText = sourceBlocks.length
      ? `Use the following retrieved snippets to ground your answer:\n\n${sourceBlocks.join("\n\n---\n\n")}\n\n`
      : "";
    const historyText = history.length
      ? history
          .map(
            (h) =>
              `${h.role === "assistant" ? "Assistant" : "User"}: ${sanitizeText(h.text ?? "")}`,
          )
          .join("\n") + "\n\n"
      : "";
    const userBlock = `User: ${sanitizeText(message)}\nAssistant:`;
    let prompt = `${systemInstruction}\n\n${retrievalText}${historyText}${userBlock}`;

    // --- Trim prompt if too long ---
    if (prompt.length > MAX_PROMPT_TOKENS * 4) {
      while (sourceBlocks.length && prompt.length > MAX_PROMPT_TOKENS * 4) {
        sourceBlocks.pop();
        const newRetrieval = sourceBlocks.length
          ? `Use the following retrieved snippets to ground your answer:\n\n${sourceBlocks.join("\n\n---\n\n")}\n\n`
          : "";
        prompt = `${systemInstruction}\n\n${newRetrieval}${historyText}${userBlock}`;
      }
    }

    // Check if we have a cached response for this exact prompt
    const promptHash = createHash(prompt);
    let assistantText = await cache.get<string>(`chat_llm:${promptHash}`);

    if (!assistantText) {
      // --- OpenAI response ---
      try {
        const resp: any = await openai.responses.create({
          model: OPENAI_MODEL,
          input: prompt,
          max_output_tokens: 800,
          temperature: 0.1,
        });

        if (resp?.output && Array.isArray(resp.output)) {
          assistantText = resp.output
            .map((o: any) =>
              (o?.content || [])
                .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
                .join(" "),
            )
            .join(" ")
            .trim();
        } else if (typeof resp?.output_text === "string") {
          assistantText = resp.output_text;
        } else {
          assistantText = String(resp?.output?.[0]?.content?.[0]?.text ?? "");
        }

        // Cache the LLM response for future identical prompts
        if (assistantText) {
          await cache.set(`chat_llm:${promptHash}`, assistantText, 1800); // 30 minutes
        }
      } catch (err) {
        console.error("LLM call failed:", err);
        return NextResponse.json(
          { error: "LLM call failed", details: String(err) },
          { status: 500 },
        );
      }
    }

    // Prepare response data
    const responseData = {
      text: assistantText ?? "",
      sources: retrieved.map((r, i) => ({
        index: i + 1,
        similarity: r.similarity,
        meta: r.metadata,
      })),
    };

    // Cache the complete response for this message
    await cache.setChatResponse(kbId, messageHash, responseData);

    // --- Usage logging ---
    (async () => {
      try {
        await prisma.usage.create({
          data: {
            userId: kbData.userId,
            botId: null,
            date: new Date(),
            interactions: 1,
            minutes: 0,
            meta: {
              kbId,
              conversationId: conversationId ?? null,
              promptSize: prompt.length,
              retrievedCount: retrieved.length,
              cached: false,
            },
          },
        });
      } catch (err) {
        console.warn("Failed to write usage log:", err);
      }
    })();

    // --- Return reply ---
    return NextResponse.json({
      success: true,
      text: assistantText,
      conversationId: conversationId ?? null,
      sources: responseData.sources,
      rateLimit: { remaining: rateLimit.remaining },
      cached: false,
    });
  } catch (err) {
    console.error("Chat handler error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
