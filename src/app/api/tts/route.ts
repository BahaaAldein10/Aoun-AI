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

// Demo configuration
const DEMO_KB_ID = process.env.DEMO_KB_ID!;
const DEMO_TTS_LIMIT_PER_IP = 10; // Max TTS requests per IP per day for demo

/** helper to create sha256 buffer (timing-safe compare) */
function sha256Buffer(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest();
}

const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

/** estimate minutes from text (used for billing/analytics) */
function estimateMinutesFromText(text?: string | null, wpm = 150) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(1, Math.ceil(words / wpm));
}

/** Track demo TTS usage */
async function trackDemoTTSUsage(
  clientIP: string,
  cache: any,
): Promise<{ usage: number; allowed: boolean }> {
  const today = new Date().toDateString();
  const demoTtsKey = `demo_tts:${clientIP}:${today}`;

  const usage = (await cache.get(demoTtsKey)) || 0;
  const newUsage = usage + 1;

  if (newUsage > DEMO_TTS_LIMIT_PER_IP) {
    return { usage: newUsage, allowed: false };
  }

  await cache.set(demoTtsKey, newUsage, 86400); // 24 hours TTL
  return { usage: newUsage, allowed: true };
}

export async function POST(request: NextRequest) {
  // lazy/dynamic imports to avoid top-level evaluation
  const upstash = await import("@/lib/upstash");
  const requestPath = new URL(request.url).pathname;
  const invCtx = startInvocation();

  const { createHash } = upstash;
  const { CacheService, checkRateLimit, getUserIdentifier } = upstash;

  const JWT_SECRET = process.env.WIDGET_JWT_SECRET || "";
  const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

  // lazy-init cache
  const cache = CacheService.getInstance();

  try {
    // parse body first to check for demo flag
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

    // Demo-specific handling
    let demoTtsUsage: { usage: number; allowed: boolean } | null = null;

    if (isDemo || kbId === DEMO_KB_ID) {
      const clientIP =
        request.headers.get("x-forwarded-for")?.split(",")[0] ||
        request.headers.get("x-real-ip") ||
        "unknown";

      demoTtsUsage = await trackDemoTTSUsage(clientIP, cache);

      if (!demoTtsUsage.allowed) {
        return NextResponse.json(
          {
            error: "Demo TTS limit reached",
            message:
              "You've reached the daily demo TTS limit. Please sign up for unlimited access.",
            limit: DEMO_TTS_LIMIT_PER_IP,
            usage: demoTtsUsage.usage,
          },
          { status: 429 },
        );
      }
    }

    // parse auth header (may be widget jwt or API key)
    const authHeader = (request.headers.get("authorization") || "").replace(
      /^Bearer\s+/,
      "",
    );

    // try decode widget JWT if present (skip for demo)
    let widgetPayload: { kbId?: string; origin?: string } | null = null;
    if (authHeader && JWT_SECRET && !isDemo && kbId !== DEMO_KB_ID) {
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

    // rate limit (use demo tracking or regular rate limiting)
    let rateLimit;
    if (isDemo || kbId === DEMO_KB_ID) {
      // For demo, we use our custom tracking above
      rateLimit = {
        success: true,
        remaining: Math.max(
          0,
          DEMO_TTS_LIMIT_PER_IP - (demoTtsUsage?.usage || 0),
        ),
        reset: new Date(Date.now() + 86400000), // 24 hours from now
      };
    } else {
      const userIdentifier = getUserIdentifier(request, widgetPayload) ?? null;
      rateLimit = await checkRateLimit(userIdentifier, "api");

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

    // Load KB metadata (use demo data for demo requests)
    const targetKbId = isDemo || kbId === DEMO_KB_ID ? DEMO_KB_ID : kbId;
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: targetKbId },
      select: {
        id: true,
        title: true,
        metadata: true,
        userId: true,
        botId: true,
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
      botId: kb.botId,
      metadata: (kb.metadata as Record<string, any>) ?? {},
    };

    const metadata = kbData.metadata;

    // Auth checks (skip for demo)
    if (!isDemo && kbId !== DEMO_KB_ID) {
      if (widgetPayload) {
        if (widgetPayload.kbId !== kbId) {
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
        const userIdentifier = isDemo
          ? "demo-user"
          : getUserIdentifier(request, widgetPayload);

        try {
          await logInteraction({
            userId: kbData.userId,
            botId: kbData.botId ?? null,
            channel: "voice",
            interactions: 1,
            minutes,
            isCorrect: true, // always mark TTS as correct
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
              isDemo: isDemo || kbId === DEMO_KB_ID,
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
                isDemo: isDemo || kbId === DEMO_KB_ID,
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
                  isDemo: isDemo || kbId === DEMO_KB_ID,
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
        isDemo: isDemo || kbId === DEMO_KB_ID,
        demoUsage: isDemo ? demoTtsUsage?.usage : undefined,
        demoLimit: isDemo ? DEMO_TTS_LIMIT_PER_IP : undefined,
        rateLimit: {
          remaining: rateLimit.remaining,
          reset: rateLimit.reset.toISOString?.() || rateLimit.reset,
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
      const userIdentifier = isDemo
        ? "demo-user"
        : getUserIdentifier(request, widgetPayload);

      try {
        await logInteraction({
          userId: kbData.userId,
          botId: kbData.botId ?? null,
          channel: "voice",
          interactions: 1,
          minutes,
          isCorrect: true, // always mark TTS as correct
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
            isDemo: isDemo || kbId === DEMO_KB_ID,
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
              isDemo: isDemo || kbId === DEMO_KB_ID,
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
                isDemo: isDemo || kbId === DEMO_KB_ID,
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
      isDemo: isDemo || kbId === DEMO_KB_ID,
      demoUsage: isDemo ? demoTtsUsage?.usage : undefined,
      demoLimit: isDemo ? DEMO_TTS_LIMIT_PER_IP : undefined,
      rateLimit: {
        remaining: rateLimit.remaining,
        reset: rateLimit.reset.toISOString?.() || rateLimit.reset,
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
