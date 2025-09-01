/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";

import type { ChunkMetadata } from "@/lib/embedding-service";
import { prisma } from "@/lib/prisma";
import { upstashSearchSimilar } from "@/search/upstash-search";
import { Redis } from "@upstash/redis";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import OpenAI from "openai";

// ---------- Config ----------
const OPENAI_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";
const DEFAULT_TOP_K = Number(process.env.CHAT_DEFAULT_TOP_K ?? 5);
const MAX_TOP_K = Number(process.env.CHAT_MAX_TOP_K ?? 8);
const MAX_PROMPT_TOKENS = Number(process.env.CHAT_MAX_CONTEXT_TOKENS ?? 3000);
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_PER_WINDOW = 60; // per IP / API key / widget token
const JWT_SECRET = process.env.WIDGET_JWT_SECRET!;

if (!JWT_SECRET) throw new Error("WIDGET_JWT_SECRET not defined");

// ---------- OpenAI ----------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- Upstash Redis ----------
let upstashRedis: Redis | null = null;
try {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    upstashRedis = Redis.fromEnv();
  }
} catch (err) {
  console.warn("Upstash init failed:", err);
}

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

async function rateLimit(key: string) {
  try {
    if (upstashRedis) {
      const count = await upstashRedis.incr(key);
      if (count === 1)
        await upstashRedis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
      const remaining = Math.max(0, RATE_LIMIT_MAX_PER_WINDOW - count);
      return { ok: count <= RATE_LIMIT_MAX_PER_WINDOW, remaining, count };
    } else {
      // fallback local dev
      (global as any).__chat_rate_map =
        (global as any).__chat_rate_map || new Map();
      const map = (global as any).__chat_rate_map as Map<
        string,
        { count: number; expiresAt: number }
      >;
      const now = Date.now();
      const entry = map.get(key);
      if (!entry || entry.expiresAt < now) {
        map.set(key, {
          count: 1,
          expiresAt: now + RATE_LIMIT_WINDOW_SECONDS * 1000,
        });
        return { ok: true, remaining: RATE_LIMIT_MAX_PER_WINDOW - 1, count: 1 };
      } else {
        entry.count++;
        map.set(key, entry);
        return {
          ok: entry.count <= RATE_LIMIT_MAX_PER_WINDOW,
          remaining: Math.max(0, RATE_LIMIT_MAX_PER_WINDOW - entry.count),
          count: entry.count,
        };
      }
    }
  } catch (err) {
    console.warn("Rate limit check failed — allowing request:", err);
    return { ok: true, remaining: RATE_LIMIT_MAX_PER_WINDOW, count: 0 };
  }
}

// ---------- POST Handler ----------
export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const body = (await req.json().catch(() => ({}))) as ChatRequestBody;
    const {
      kbId,
      message,
      conversationId,
      history = [],
      userId: incomingUserId,
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

    // --- Rate limiting ---
    const apiKeyHeader = authHeader || "";
    const rateKey = widgetPayload
      ? `chat_rate_widget_${widgetPayload.kbId}`
      : apiKeyHeader
        ? `chat_rate_api_${apiKeyHeader}`
        : `chat_rate_ip_${ip}`;
    const rl = await rateLimit(rateKey);
    if (!rl.ok)
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 },
      );

    // --- Load KB ---
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: { id: true, title: true, metadata: true, userId: true },
    });
    if (!kb)
      return NextResponse.json(
        { error: "Knowledge base not found" },
        { status: 404 },
      );

    const metadata: Record<string, any> =
      (kb.metadata as Record<string, any>) ?? {};
    const kbApiKey = metadata?.apiKey as string | undefined;

    // --- API key protection for private KBs ---
    if (kbApiKey && !widgetPayload) {
      if (!apiKeyHeader || apiKeyHeader !== kbApiKey) {
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

    // --- Retrieval ---
    let retrieved: Array<{
      text: string;
      similarity: number;
      metadata: ChunkMetadata;
    }> = [];
    try {
      retrieved = await upstashSearchSimilar(kbId, message, topK);
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

    // --- OpenAI response ---
    let assistantText = "";
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
    } catch (err) {
      console.error("LLM call failed:", err);
      return NextResponse.json(
        { error: "LLM call failed", details: String(err) },
        { status: 500 },
      );
    }

    // --- Usage logging ---
    try {
      await prisma.usage.create({
        data: {
          userId: incomingUserId ?? kb.userId,
          botId: null,
          date: new Date(),
          interactions: 1,
          minutes: 0,
          meta: {
            kbId,
            conversationId: conversationId ?? null,
            promptSize: prompt.length,
            retrievedCount: retrieved.length,
          },
        },
      });
    } catch (err) {
      console.warn("Failed to write usage log:", err);
    }

    // --- Return reply ---
    return NextResponse.json({
      success: true,
      text: assistantText,
      conversationId: conversationId ?? null,
      sources: retrieved.map((r, i) => ({
        index: i + 1,
        similarity: r.similarity,
        meta: r.metadata,
      })),
      rateLimit: { remaining: rl.remaining ?? null },
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
