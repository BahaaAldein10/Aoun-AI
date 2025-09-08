/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";

import { logInteraction } from "@/lib/analytics/logInteraction";
import crypto from "crypto";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

// ---------- Config ----------
const OPENAI_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";
const DEFAULT_TOP_K = Number(process.env.CHAT_DEFAULT_TOP_K ?? 5);
const MAX_TOP_K = Number(process.env.CHAT_MAX_TOP_K ?? 8);
const MAX_PROMPT_TOKENS = Number(process.env.CHAT_MAX_CONTEXT_TOKENS ?? 3000);
const JWT_SECRET = process.env.WIDGET_JWT_SECRET!;
if (!JWT_SECRET) throw new Error("WIDGET_JWT_SECRET not defined");

// ---------- Helpers reused from your original file ----------
function sanitizeText(s: string) {
  return (s || "").toString().trim();
}
function estimateMinutesFromText(text?: string | null, wpm = 200) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(1, Math.ceil(words / wpm));
}

// ---------- Types ----------
type ChunkMetadata = {
  documentId?: string;
  filename?: string;
  sourceUrl?: string;
  chunkIndex?: number;
  totalChunks?: number;
  startOffset?: number;
  endOffset?: number;
};

type ChatRequestBody = {
  kbId?: string;
  message?: string;
  conversationId?: string | null;
  history?: Array<{ role?: "user" | "assistant" | string; text?: string }>;
  userId?: string;
  topK?: number;
};

// ---------- POST ----------
export async function POST(req: Request) {
  // Lazy imports and initializations inside handler
  const [
    { createEmbeddings },
    { prisma },
    upstashModule,
    upstashVectorModule,
    upstashSearchModule,
  ] = await Promise.all([
    import("@/lib/embedding-service"),
    import("@/lib/prisma"),
    import("@/lib/upstash"),
    import("@/lib/upstash-vector"),
    import("@/search/upstash-search"),
  ]);

  const { CacheService, checkRateLimit, createHash, getUserIdentifier } =
    upstashModule as any;
  const upstashVector = (upstashVectorModule as any).default;
  const { upstashSearchSimilar } = upstashSearchModule as any;

  // Lazy-init OpenAI and cache
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const cache = CacheService.getInstance();

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

    // Widget JWT verification
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

    // Rate limiting
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

    // Load KB
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: {
        id: true,
        title: true,
        metadata: true,
        userId: true,
        botId: true,
      },
    });

    if (!kb)
      return NextResponse.json(
        { error: "Knowledge base not found" },
        { status: 404 },
      );

    const kbData = {
      id: kb.id,
      title: kb.title,
      userId: kb.userId,
      botId: kb.botId,
      metadata: (kb.metadata as Record<string, any>) ?? {},
    };

    const metadata = kbData.metadata ?? {};

    // Widget origin check if widget token used
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
        return NextResponse.json(
          { error: "Invalid widget token (missing origin)" },
          { status: 403 },
        );
      }
    }

    // API key protection for private KBs
    if (!widgetPayload) {
      const storedHashHex =
        typeof metadata.apiKeyHash === "string"
          ? metadata.apiKeyHash
          : undefined;
      if (!storedHashHex) {
        return NextResponse.json(
          { error: "Knowledge base is private; API key required" },
          { status: 401 },
        );
      }
      if (!authHeader) {
        return NextResponse.json(
          { error: "Unauthorized for this KB" },
          { status: 401 },
        );
      }

      const incomingToken = authHeader.trim();
      const incomingHashBuf = crypto
        .createHash("sha256")
        .update(incomingToken, "utf8")
        .digest();
      const storedHashBuf = Buffer.from(storedHashHex, "hex");

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

    // topK
    const topK = Math.max(
      1,
      Math.min(MAX_TOP_K, Number(requestedTopK ?? DEFAULT_TOP_K)),
    );

    // Check chat cache for exact message
    const messageHash = createHash(message);
    const cachedResponse = await cache.getChatResponse(kbId, messageHash);

    if (cachedResponse) {
      const minutes = estimateMinutesFromText(message);

      // create an eventId for this request
      const eventId = crypto.randomUUID();

      // 1) Log to aggregated analytics + create minimal usage row via your helper
      try {
        await logInteraction({
          userId: kbData.userId,
          botId: kbData.botId,
          channel: "website",
          interactions: 1,
          minutes,
          eventId,
        });
      } catch (err) {
        console.warn("logInteraction failed (cached path):", err);
      }

      // 2) Upsert the usage row to attach richer meta (promptSize, retrievedCount, cached flag, conversationId)
      try {
        await prisma.usage.upsert({
          where: { eventId },
          create: {
            eventId,
            userId: kbData.userId ?? null,
            botId: kbData.botId ?? null,
            date: new Date(),
            interactions: 1,
            minutes,
            meta: {
              kbId,
              conversationId: conversationId ?? null,
              cached: true,
              promptSize: message.length,
              retrievedCount: cachedResponse.sources?.length ?? 0,
              createdAt: new Date().toISOString(),
            },
          },
          update: {
            date: new Date(),
            meta: {
              set: {
                kbId,
                conversationId: conversationId ?? null,
                cached: true,
                promptSize: message.length,
                retrievedCount: cachedResponse.sources?.length ?? 0,
                lastSeenAt: new Date().toISOString(),
              },
            },
          },
        });
      } catch (err) {
        console.warn("usage upsert failed (cached path):", err);
      }

      return NextResponse.json({
        success: true,
        text: cachedResponse.text,
        conversationId: conversationId ?? null,
        sources: cachedResponse.sources,
        rateLimit: { remaining: rateLimit.remaining },
        cached: true,
      });
    }

    // Retrieval / embedding
    let retrieved: Array<{
      text: string;
      similarity: number;
      metadata: ChunkMetadata;
    }> = [];

    try {
      const cachedEmbedding = await cache.getEmbedding(message);
      let queryVec: number[] | undefined = undefined;

      if (Array.isArray(cachedEmbedding) && cachedEmbedding.length > 0) {
        queryVec = cachedEmbedding as number[];
      } else {
        const embeddings = await createEmbeddings([message]);
        queryVec = embeddings[0];
        if (queryVec) await cache.setEmbedding(message, queryVec);
      }

      if (queryVec) {
        const results = await upstashVector.query(queryVec, {
          topK,
          includeMetadata: true,
          includeVectors: false,
          filter: `kbId = '${kbId.replace(/'/g, "\\'")}'`,
        });

        retrieved = (results ?? []).map((result: any) => {
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
        retrieved = await upstashSearchSimilar(kbId, message, topK);
      }
    } catch (err) {
      console.error("Retrieval failed:", err);
      retrieved = [];
    }

    const sourceBlocks = retrieved.map((r, i) => {
      const srcMeta = r.metadata ?? {};
      const label = srcMeta.filename || srcMeta.sourceUrl || `source-${i + 1}`;
      return `SOURCE ${i + 1} (${label}, score=${(r.similarity || 0).toFixed(3)}):\n${r.text}`;
    });

    // Build prompt
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

    // Trim prompt if too long
    if (prompt.length > MAX_PROMPT_TOKENS * 4) {
      while (sourceBlocks.length && prompt.length > MAX_PROMPT_TOKENS * 4) {
        sourceBlocks.pop();
        const newRetrieval = sourceBlocks.length
          ? `Use the following retrieved snippets to ground your answer:\n\n${sourceBlocks.join("\n\n---\n\n")}\n\n`
          : "";
        prompt = `${systemInstruction}\n\n${newRetrieval}${historyText}${userBlock}`;
      }
    }

    // Check prompt-level LLM cache
    const promptHash = createHash(prompt);
    let assistantText = await cache.get(`chat_llm:${promptHash}`);

    if (!assistantText) {
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

        if (assistantText) {
          await cache.set(`chat_llm:${promptHash}`, assistantText, 1800);
        }
      } catch (err) {
        console.error("LLM call failed:", err);
        return NextResponse.json(
          { error: "LLM call failed", details: String(err) },
          { status: 500 },
        );
      }
    }

    // Prepare responseData and cache full response
    const responseData = {
      text: assistantText ?? "",
      sources: retrieved.map((r, i) => ({
        index: i + 1,
        similarity: r.similarity,
        meta: r.metadata,
      })),
    };

    await cache.setChatResponse(kbId, messageHash, responseData);

    // ---------------------------
    // Usage logging (new flow)
    // ---------------------------
    const chatMinutes = estimateMinutesFromText(prompt, 200);
    const eventId = crypto.randomUUID();

    // 1) call your analytics helper to update aggregatedUsage and create the minimal usage audit row
    try {
      await logInteraction({
        userId: kbData.userId,
        botId: kbData.botId,
        channel: "website",
        interactions: 1,
        minutes: chatMinutes,
        eventId,
      });
    } catch (err) {
      console.warn("logInteraction failed (llm path):", err);
    }

    // 2) upsert the usage row to ensure the richer meta is persisted
    try {
      await prisma.usage.upsert({
        where: { eventId },
        create: {
          eventId,
          userId: kbData.userId ?? null,
          botId: kbData.botId ?? null,
          date: new Date(),
          interactions: 1,
          minutes: chatMinutes,
          meta: {
            kbId,
            conversationId: conversationId ?? null,
            cached: false,
            promptSize: prompt.length,
            retrievedCount: retrieved.length,
            createdAt: new Date().toISOString(),
          },
        },
        update: {
          date: new Date(),
          meta: {
            set: {
              kbId,
              conversationId: conversationId ?? null,
              cached: false,
              promptSize: prompt.length,
              retrievedCount: retrieved.length,
              lastSeenAt: new Date().toISOString(),
            },
          },
        },
      });
    } catch (err) {
      console.warn("usage upsert failed (llm path):", err);
    }

    // Return
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
