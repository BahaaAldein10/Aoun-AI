/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";

import { logInteraction } from "@/lib/analytics/logInteraction";
import {
  recordInvocationMetrics,
  startInvocation,
} from "@/lib/monitoring/vercelMetrics";
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

// Demo configuration
const DEMO_KB_ID = process.env.DEMO_KB_ID!;
const DEMO_RATE_LIMIT_PER_IP = 20; // Max demo messages per IP per day

// ---------- Helpers ----------
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
  isDemo?: boolean; // Added for demo support
};

// Demo utility functions
function enhanceDemoResponse(
  response: string,
  usage: number,
  limit: number,
): string {
  const remaining = limit - usage;

  if (remaining <= 3 && remaining > 0) {
    const conversionPrompt = `\n\n💡 ${remaining} demo messages remaining. Sign up for unlimited access!`;
    return response + conversionPrompt;
  } else if (remaining === 0) {
    const conversionPrompt =
      "\n\n🚀 Demo limit reached! Sign up now for unlimited conversations and access to all features.";
    return response + conversionPrompt;
  }

  return response;
}

async function trackDemoUsage(
  clientIP: string,
  cache: any,
): Promise<{ usage: number; allowed: boolean }> {
  const today = new Date().toDateString();
  const demoKey = `demo_usage:${clientIP}:${today}`;

  const usage = (await cache.get(demoKey)) || 0;
  const newUsage = usage + 1;

  if (newUsage > DEMO_RATE_LIMIT_PER_IP) {
    return { usage: newUsage, allowed: false };
  }

  await cache.set(demoKey, newUsage, 86400); // 24 hours TTL
  return { usage: newUsage, allowed: true };
}

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

  const requestPath = new URL(req.url).pathname;
  const invCtx = startInvocation();
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
      isDemo = false,
    } = body || {};

    if (!kbId || !message?.trim()) {
      return NextResponse.json(
        { error: "Missing kbId or message" },
        { status: 400 },
      );
    }

    // Demo-specific handling
    let demoUsageData: { usage: number; allowed: boolean } | null = null;

    if (isDemo || kbId === DEMO_KB_ID) {
      const clientIP =
        req.headers.get("x-forwarded-for")?.split(",")[0] ||
        req.headers.get("x-real-ip") ||
        "unknown";

      demoUsageData = await trackDemoUsage(clientIP, cache);

      if (!demoUsageData.allowed) {
        return NextResponse.json(
          {
            error: "Demo limit reached",
            message:
              "You've reached the daily demo limit. Please sign up for unlimited access.",
            limit: DEMO_RATE_LIMIT_PER_IP,
            usage: demoUsageData.usage,
          },
          { status: 429 },
        );
      }
    }

    // Widget JWT verification (skip for demo)
    const authHeader = (req.headers.get("authorization") || "").replace(
      /^Bearer\s+/,
      "",
    );
    let widgetPayload: { kbId?: string; origin?: string } | null = null;

    if (authHeader && !isDemo && kbId !== DEMO_KB_ID) {
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

    // Rate limiting (use demo tracking or regular rate limiting)
    let rateLimit;
    if (isDemo || kbId === DEMO_KB_ID) {
      // For demo, we use our custom tracking above
      rateLimit = {
        success: true,
        remaining: Math.max(
          0,
          DEMO_RATE_LIMIT_PER_IP - (demoUsageData?.usage || 0),
        ),
        reset: new Date(Date.now() + 86400000), // 24 hours from now
      };
    } else {
      const userIdentifier = getUserIdentifier(req, widgetPayload) ?? null;
      rateLimit = await checkRateLimit(userIdentifier, "chat");

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
    }

    // Load KB
    const targetKbId = isDemo || kbId === DEMO_KB_ID ? DEMO_KB_ID : kbId;
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: targetKbId },
      select: {
        id: true,
        title: true,
        metadata: true,
        userId: true,
        bot: {
          select: { id: true },
        },
      },
    });

    if (!kb) {
      return NextResponse.json(
        {
          error: isDemo
            ? "Demo service unavailable"
            : "Knowledge base not found",
        },
        { status: 404 },
      );
    }

    const kbData = {
      id: kb.id,
      title: kb.title,
      userId: kb.userId,
      botId: kb.bot?.id,
      metadata: (kb.metadata as Record<string, any>) ?? {},
    };

    const metadata = kbData.metadata ?? {};

    // Widget origin check (skip for demo)
    if (widgetPayload && !isDemo) {
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

    // API key protection (skip for demo)
    if (!widgetPayload && !isDemo && kbId !== DEMO_KB_ID) {
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
    const cacheKey = `${targetKbId}:${messageHash}`;
    const cachedResponse = await cache.getChatResponse(targetKbId, messageHash);

    if (cachedResponse) {
      const minutes = estimateMinutesFromText(message);
      const eventId = crypto.randomUUID();

      // Heuristic correctness detection
      const fallbackRegex =
        /\b(i (do not|don't) know|cannot find|no information|sorry,|unable to)/i;
      const isFallback =
        !cachedResponse.sources?.length ||
        fallbackRegex.test(cachedResponse.text);
      const isCorrect =
        (cachedResponse.sources?.length ?? 0) > 0 &&
        cachedResponse.text.length > 20 &&
        !isFallback;
      const isNegative = !isCorrect;

      // Enhanced response for demo
      let responseText = cachedResponse.text;
      if (isDemo || kbId === DEMO_KB_ID) {
        responseText = enhanceDemoResponse(
          responseText,
          demoUsageData?.usage || 0,
          DEMO_RATE_LIMIT_PER_IP,
        );
      }

      // Log interaction for non-demo or demo analytics
      try {
        await logInteraction({
          userId: kbData.userId,
          botId: kbData.botId!,
          channel: "website",
          interactions: 1,
          minutes,
          isCorrect,
          isNegative,
          isFallback,
          eventId,
          meta: {
            requestPath,
            userIdentifier: isDemo
              ? "demo-user"
              : getUserIdentifier(req, widgetPayload),
            promptSize: message.length,
            retrievedCount: cachedResponse.sources?.length ?? 0,
            cached: true,
            isDemo: isDemo || kbId === DEMO_KB_ID,
          },
        });
      } catch (err) {
        console.warn("logInteraction failed (cached path):", err);
      }

      // Upsert usage row
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
              kbId: targetKbId,
              conversationId: conversationId ?? null,
              cached: true,
              promptSize: message.length,
              retrievedCount: cachedResponse.sources?.length ?? 0,
              requestPath,
              userIdentifier: isDemo
                ? "demo-user"
                : getUserIdentifier(req, widgetPayload),
              isDemo: isDemo || kbId === DEMO_KB_ID,
              createdAt: new Date().toISOString(),
            },
          },
          update: {
            date: new Date(),
            meta: {
              set: {
                kbId: targetKbId,
                conversationId: conversationId ?? null,
                cached: true,
                promptSize: message.length,
                retrievedCount: cachedResponse.sources?.length ?? 0,
                requestPath,
                userIdentifier: isDemo
                  ? "demo-user"
                  : getUserIdentifier(req, widgetPayload),
                isDemo: isDemo || kbId === DEMO_KB_ID,
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
        text: responseText,
        conversationId: conversationId ?? null,
        sources: cachedResponse.sources,
        rateLimit: { remaining: rateLimit.remaining },
        cached: true,
        isDemo: isDemo || kbId === DEMO_KB_ID,
        demoUsage: isDemo ? demoUsageData?.usage : undefined,
        demoLimit: isDemo ? DEMO_RATE_LIMIT_PER_IP : undefined,
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
          filter: `kbId = '${targetKbId.replace(/'/g, "\\'")}'`,
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
        retrieved = await upstashSearchSimilar(targetKbId, message, topK);
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

    // Build prompt with demo-specific personality
    const demoPersonality =
      isDemo || kbId === DEMO_KB_ID
        ? "You are a helpful and enthusiastic AI assistant showcasing our platform's capabilities. Be conversational, informative, and occasionally mention the benefits of signing up for the full service. Keep responses concise but informative."
        : "";

    const personality =
      demoPersonality || (metadata?.personality as string) || "";
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

    let llmMs = 0;

    if (!assistantText) {
      try {
        const llmStart = Date.now();
        const resp: any = await openai.responses.create({
          model: OPENAI_MODEL,
          input: prompt,
          max_output_tokens: isDemo ? 400 : 800, // Shorter responses for demo
          temperature: 0.1,
        });
        llmMs = Date.now() - llmStart;

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

    // Enhanced response for demo
    if (isDemo || kbId === DEMO_KB_ID) {
      assistantText = enhanceDemoResponse(
        assistantText || "",
        demoUsageData?.usage || 0,
        DEMO_RATE_LIMIT_PER_IP,
      );
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

    await cache.setChatResponse(targetKbId, messageHash, responseData);

    // Usage logging
    const chatMinutes = estimateMinutesFromText(prompt, 200);
    const eventId = crypto.randomUUID();

    // Heuristic correctness detection
    const fallbackRegex =
      /\b(i (do not|don't) know|cannot find|no information|sorry,|unable to)/i;
    const isFallback = !retrieved.length || fallbackRegex.test(assistantText);
    const isCorrect =
      retrieved.length > 0 && assistantText.length > 20 && !isFallback;
    const isNegative = !isCorrect;

    try {
      await logInteraction({
        userId: kbData.userId,
        botId: kbData.botId!,
        channel: "website",
        interactions: 1,
        minutes: chatMinutes,
        isCorrect,
        isNegative,
        isFallback,
        eventId,
        meta: {
          responseTimeMs: llmMs,
          requestPath,
          userIdentifier: isDemo
            ? "demo-user"
            : getUserIdentifier(req, widgetPayload),
          promptSize: prompt.length,
          retrievedCount: retrieved.length,
          isDemo: isDemo || kbId === DEMO_KB_ID,
        },
      });
    } catch (err) {
      console.warn("logInteraction failed (llm path):", err);
    }

    // Upsert usage row
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
            kbId: targetKbId,
            conversationId: conversationId ?? null,
            cached: false,
            promptSize: prompt.length,
            retrievedCount: retrieved.length,
            responseTimeMs: llmMs,
            requestPath,
            userIdentifier: isDemo
              ? "demo-user"
              : getUserIdentifier(req, widgetPayload),
            isDemo: isDemo || kbId === DEMO_KB_ID,
            createdAt: new Date().toISOString(),
          },
        },
        update: {
          date: new Date(),
          meta: {
            set: {
              kbId: targetKbId,
              conversationId: conversationId ?? null,
              cached: false,
              promptSize: prompt.length,
              retrievedCount: retrieved.length,
              responseTimeMs: llmMs,
              requestPath,
              userIdentifier: isDemo
                ? "demo-user"
                : getUserIdentifier(req, widgetPayload),
              isDemo: isDemo || kbId === DEMO_KB_ID,
              lastSeenAt: new Date().toISOString(),
            },
          },
        },
      });
    } catch (err) {
      console.warn("usage upsert failed (llm path):", err);
    }

    // Record metrics for monitoring
    void recordInvocationMetrics(await invCtx, {
      llmResponseMs: llmMs,
      userId: kbData.userId,
      botId: kbData.botId,
      tag: "chat",
    });

    // Return response
    return NextResponse.json({
      success: true,
      text: assistantText,
      conversationId: conversationId ?? null,
      sources: responseData.sources,
      rateLimit: { remaining: rateLimit.remaining },
      cached: false,
      isDemo: isDemo || kbId === DEMO_KB_ID,
      demoUsage: isDemo ? demoUsageData?.usage : undefined,
      demoLimit: isDemo ? DEMO_RATE_LIMIT_PER_IP : undefined,
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
