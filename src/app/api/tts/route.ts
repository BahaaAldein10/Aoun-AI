/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/tts/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { logInteraction } from "@/lib/analytics/logInteraction";
import {
  recordInvocationMetrics,
  startInvocation,
} from "@/lib/monitoring/vercelMetrics";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const DEMO_KB_ID = process.env.DEMO_KB_ID ?? null;

const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

/** helper to create sha256 buffer (timing-safe compare) */
function sha256Buffer(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest();
}

/** estimate minutes from text (used for billing/analytics) */
function estimateMinutesFromText(text?: string | null, wpm = 150) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(1, Math.ceil(words / wpm));
}

export async function POST(request: NextRequest) {
  // lazy/dynamic imports to avoid top-level evaluation
  const upstash = await import("@/lib/upstash");
  const requestPath = new URL(request.url).pathname;
  const invCtx = startInvocation();

  const { createHash } = upstash;
  const { CacheService, checkRateLimit, getUserIdentifier } = upstash;

  const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
  const JWT_SECRET = process.env.WIDGET_JWT_SECRET || "";

  // lazy-init cache
  const cache = CacheService.getInstance();

  try {
    const body = await request.json().catch(() => null);
    if (!body)
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const { text, voice = "alloy", speed = 1.0, kbId, isDemo = false } = body;

    // validate inputs
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required and must be a string" },
        { status: 400 },
      );
    }
    if (text.length > 4000) {
      return NextResponse.json(
        { error: "Text too long (max 4000 characters)" },
        { status: 400 },
      );
    }
    if (!VALID_VOICES.includes(voice)) {
      return NextResponse.json(
        { error: `Invalid voice. Must be one of: ${VALID_VOICES.join(", ")}` },
        { status: 400 },
      );
    }
    if (typeof speed !== "number" || speed < 0.25 || speed > 4.0) {
      return NextResponse.json(
        { error: "Speed must be a number between 0.25 and 4.0" },
        { status: 400 },
      );
    }

    // ensure OpenAI key exists
    if (!OPENAI_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return NextResponse.json(
        { error: "Service configuration error" },
        { status: 500 },
      );
    }

    const isDemoKb = DEMO_KB_ID !== null && kbId === DEMO_KB_ID;

    // parse auth header (may be widget jwt or API key)
    const authHeader = (request.headers.get("authorization") || "").replace(
      /^Bearer\s+/,
      "",
    );

    // try decode widget JWT if present (we attempt to decode when header present).
    // We'll still allow legacy demo KB calls without a token.
    let widgetPayload: { kbId?: string; origin?: string } | null = null;
    if (authHeader && JWT_SECRET) {
      try {
        const key = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jwtVerify(authHeader, key);
        widgetPayload = {
          kbId: payload.kbId as string | undefined,
          origin: payload.origin as string | undefined,
        };
      } catch {
        widgetPayload = null;
      }
    }

    // RATE LIMIT:
    // - For legacy demo KB we skip server-side rate-limiting so the old widget continues to work.
    // - For everything else we enforce the normal rate limiter.
    let rateLimit: { success: boolean; remaining: number; reset?: Date };
    if (isDemoKb) {
      rateLimit = { success: true, remaining: Number.MAX_SAFE_INTEGER };
    } else {
      const userIdentifier = getUserIdentifier(request, widgetPayload) ?? null;
      const rl = await checkRateLimit(userIdentifier, "api");
      if (!rl.success) {
        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            limit: rl.limit,
            remaining: rl.remaining,
            reset: rl.reset.toISOString(),
          },
          { status: 429 },
        );
      }
      rateLimit = rl;
    }

    const targetKbId = kbId;
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: targetKbId },
      select: {
        id: true,
        title: true,
        metadata: true,
        userId: true,
        bot: { select: { id: true } },
      },
    });

    if (!kb) {
      return NextResponse.json(
        { error: "Knowledge base not found" },
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

    const metadata = kbData.metadata;

    // Auth checks:
    // - If request targets legacy demo KB, allow missing API key / widget token (legacy widget)
    // - Otherwise enforce widget token origin check OR require API key hash to match
    if (!isDemoKb) {
      if (widgetPayload) {
        if (widgetPayload.kbId && widgetPayload.kbId !== kbId) {
          return NextResponse.json(
            { error: "KB ID mismatch in widget token" },
            { status: 403 },
          );
        }

        const allowedOrigins = Array.isArray(metadata.allowedOrigins)
          ? metadata.allowedOrigins.map((o: string) => new URL(o).origin)
          : [];

        if (widgetPayload.origin) {
          if (
            allowedOrigins.length > 0 &&
            !allowedOrigins.includes(widgetPayload.origin)
          ) {
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
      } else {
        // no widget token: require API key for private KBs
        const storedHash =
          typeof metadata.apiKeyHash === "string"
            ? metadata.apiKeyHash
            : undefined;

        if (!authHeader) {
          return NextResponse.json(
            { error: "Unauthorized (missing API key or widget token)" },
            { status: 401 },
          );
        }

        if (storedHash) {
          const incomingBuf = sha256Buffer(authHeader);
          const storedBuf = Buffer.from(storedHash, "hex");
          if (
            incomingBuf.length !== storedBuf.length ||
            !crypto.timingSafeEqual(incomingBuf, storedBuf)
          ) {
            return NextResponse.json(
              { error: "Unauthorized (invalid API key)" },
              { status: 401 },
            );
          }
        } else {
          return NextResponse.json(
            { error: "Knowledge base is private; API key required" },
            { status: 401 },
          );
        }
      }
    }

    // Build consistent cache key and check cache
    const ttsKey = `${text}::${voice}::${speed}`;
    const ttsHash = createHash(ttsKey);
    const cached = await cache.getTtsAudio(ttsHash, voice);

    if (cached) {
      // Record analytics for cached response
      if (kbId && kbData) {
        const eventId = crypto.randomUUID();
        const minutes = estimateMinutesFromText(text);
        const userIdentifier = isDemoKb
          ? "demo-user"
          : getUserIdentifier(request, widgetPayload);

        try {
          await logInteraction({
            userId: kbData.userId,
            botId: kbData.botId!,
            channel: "voice",
            interactions: 1,
            minutes,
            isCorrect: true,
            isNegative: false,
            isFallback: false,
            eventId,
            meta: {
              requestPath,
              userIdentifier,
              textLength: text.length,
              voice,
              speed,
              cached: true,
              isDemo: isDemoKb || isDemo,
            },
          });
        } catch (e) {
          console.warn("logInteraction failed (tts cached):", e);
        }

        // upsert usage row with richer meta
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
                kbId: kbData.id,
                textLength: text.length,
                voice,
                speed,
                cached: true,
                audioSize: cached?.length ?? 0,
                requestPath,
                userIdentifier,
                isDemo: isDemoKb || isDemo,
                createdAt: new Date().toISOString(),
              },
            },
            update: {
              date: new Date(),
              meta: {
                set: {
                  kbId: kbData.id,
                  textLength: text.length,
                  voice,
                  speed,
                  cached: true,
                  audioSize: cached?.length ?? 0,
                  requestPath,
                  userIdentifier,
                  isDemo: isDemoKb || isDemo,
                  lastSeenAt: new Date().toISOString(),
                },
              },
            },
          });
        } catch (e) {
          console.warn("usage upsert failed (tts cached):", e);
        }
      }

      return NextResponse.json({
        audioUrl: cached,
        voice,
        speed,
        textLength: text.length,
        cached: true,
        timestamp: new Date().toISOString(),
        isDemo: isDemoKb || isDemo,
        rateLimit: {
          remaining: rateLimit.remaining,
          reset: rateLimit.reset?.toISOString?.() || rateLimit.reset,
        },
      });
    }

    // Generate TTS via OpenAI (audio/speech endpoint)
    let ttsMs = 0;
    const ttsStart = Date.now();

    const ttsResp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: text.trim(),
        voice,
        response_format: "mp3",
        speed,
      }),
    });

    ttsMs = Date.now() - ttsStart;

    if (!ttsResp.ok) {
      const txt = await ttsResp.text().catch(() => "");
      console.error("TTS API error:", ttsResp.status, txt);

      if (ttsResp.status === 429) {
        return NextResponse.json(
          { error: "TTS service rate limit exceeded. Please try again later." },
          { status: 429 },
        );
      }
      if (ttsResp.status === 401) {
        return NextResponse.json(
          { error: "OpenAI API authentication failed" },
          { status: 502 },
        );
      }

      return NextResponse.json(
        {
          error: "Failed to generate speech",
          details:
            ttsResp.status === 413
              ? "Text too long"
              : "Service temporarily unavailable",
        },
        { status: 502 },
      );
    }

    const audioBuffer = await ttsResp.arrayBuffer();
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: "Empty audio response" },
        { status: 502 },
      );
    }

    // convert to base64 data URL
    const base64 = Buffer.from(audioBuffer).toString("base64");
    const audioUrl = `data:audio/mp3;base64,${base64}`;

    // cache audio (be mindful of blob sizes)
    try {
      await cache.setTtsAudio(ttsHash, voice, audioUrl);
    } catch (e) {
      console.warn("Failed to cache TTS audio (non-fatal):", e);
    }

    // Analytics: log interaction + upsert usage row
    if (kbId && kbData) {
      const eventId = crypto.randomUUID();
      const minutes = estimateMinutesFromText(text);
      const userIdentifier = isDemoKb
        ? "demo-user"
        : getUserIdentifier(request, widgetPayload);

      try {
        await logInteraction({
          userId: kbData.userId,
          botId: kbData.botId!,
          channel: "voice",
          interactions: 1,
          minutes,
          isCorrect: true,
          isNegative: false,
          isFallback: false,
          eventId,
          meta: {
            responseTimeMs: ttsMs,
            requestPath,
            userIdentifier,
            textLength: text.length,
            voice,
            speed,
            cached: false,
            isDemo: isDemoKb || isDemo,
          },
        });
      } catch (e) {
        console.warn("logInteraction failed (tts):", e);
      }

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
              kbId: kbData.id,
              textLength: text.length,
              voice,
              speed,
              cached: false,
              audioSize: audioBuffer.byteLength,
              createdAt: new Date().toISOString(),
              responseTimeMs: ttsMs,
              requestPath,
              userIdentifier,
              isDemo: isDemoKb || isDemo,
              correctness: {
                isCorrect: true,
                isNegative: false,
                isFallback: false,
              },
            },
          },
          update: {
            date: new Date(),
            meta: {
              set: {
                kbId: kbData.id,
                textLength: text.length,
                voice,
                speed,
                cached: false,
                audioSize: audioBuffer.byteLength,
                lastSeenAt: new Date().toISOString(),
                responseTimeMs: ttsMs,
                requestPath,
                userIdentifier,
                isDemo: isDemoKb || isDemo,
              },
            },
          },
        });
      } catch (e) {
        console.warn("usage upsert failed (tts):", e);
      }
    }

    void recordInvocationMetrics(await invCtx, {
      llmResponseMs: ttsMs,
      userId: kbData?.userId,
      botId: kbData?.botId,
      tag: "tts",
    });

    return NextResponse.json({
      audioUrl,
      voice,
      speed,
      textLength: text.length,
      audioSize: audioBuffer.byteLength,
      cached: false,
      timestamp: new Date().toISOString(),
      isDemo: isDemoKb || isDemo,
      rateLimit: {
        remaining: rateLimit.remaining,
        reset: rateLimit.reset?.toISOString?.() || rateLimit.reset,
      },
    });
  } catch (err) {
    console.error("TTS API error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

// other methods disallowed
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
