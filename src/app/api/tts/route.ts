// app/api/tts/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import crypto from "crypto";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

/** helper to create sha256 buffer (timing-safe compare) */
function sha256Buffer(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest();
}

const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

// NOTE: keep lightweight constants at top-level only (no client initialization)

export async function POST(request: NextRequest) {
  // lazy/dynamic imports to avoid top-level evaluation (break circular imports)
  const upstash = await import("@/lib/upstash");
  const { createHash } = upstash;
  const { CacheService, checkRateLimit, getUserIdentifier } = upstash;

  const JWT_SECRET = process.env.WIDGET_JWT_SECRET || "";
  const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

  // lazy-init cache
  const cache = CacheService.getInstance();

  try {
    // parse auth header (may be widget jwt or API key)
    const authHeader = (request.headers.get("authorization") || "").replace(
      /^Bearer\s+/,
      "",
    );

    // try decode widget JWT if present
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

    // rate limit (use 'api' limiter or change to 'voice' if you'd prefer)
    const userIdentifier = getUserIdentifier(request, widgetPayload);
    const rateLimit = await checkRateLimit(userIdentifier, "api");

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

    // ensure OpenAI key exists
    if (!OPENAI_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return NextResponse.json(
        { error: "Service configuration error" },
        { status: 500 },
      );
    }

    // parse body
    const body = await request.json().catch(() => null);
    if (!body)
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const { text, voice = "alloy", speed = 1.0, kbId } = body;

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

    // If widget token present + kbId, validate token KB match + allowed origin if metadata exists
    if (widgetPayload) {
      if (kbId && widgetPayload.kbId !== kbId) {
        return NextResponse.json(
          { error: "KB ID mismatch in widget token" },
          { status: 403 },
        );
      }

      if (kbId) {
        const kbData = await cache.getKbMetadata(kbId);
        if (kbData) {
          const metadata = kbData.metadata ?? {};
          const allowedOrigins = Array.isArray(metadata.allowedOrigins)
            ? metadata.allowedOrigins.map((o: string) => new URL(o).origin)
            : [];
          if (
            widgetPayload.origin &&
            allowedOrigins.length > 0 &&
            !allowedOrigins.includes(widgetPayload.origin)
          ) {
            return NextResponse.json(
              { error: "Origin not allowed for widget token" },
              { status: 403 },
            );
          }
        } else {
          console.warn(
            `KB metadata not found (kbId=${kbId}) while validating widget token`,
          );
        }
      }
    } else if (kbId) {
      // if kbId provided and no widget token: require API key or hash from KB metadata
      const kbData = await cache.getKbMetadata(kbId);
      if (!kbData)
        return NextResponse.json(
          { error: "Knowledge base not found" },
          { status: 404 },
        );

      const metadata = kbData.metadata ?? {};
      const storedHash =
        typeof metadata.apiKeyHash === "string"
          ? metadata.apiKeyHash
          : undefined;
      const storedPlain =
        typeof metadata.apiKey === "string" ? metadata.apiKey : undefined;

      if (storedHash || storedPlain) {
        if (!authHeader)
          return NextResponse.json(
            { error: "Unauthorized (missing API key)" },
            { status: 401 },
          );

        if (storedHash) {
          const incoming = sha256Buffer(authHeader);
          const stored = Buffer.from(storedHash, "hex");
          if (
            incoming.length !== stored.length ||
            !crypto.timingSafeEqual(incoming, stored)
          ) {
            return NextResponse.json(
              { error: "Unauthorized (invalid API key)" },
              { status: 401 },
            );
          }
        } else {
          if (authHeader !== storedPlain)
            return NextResponse.json(
              { error: "Unauthorized (invalid API key - legacy)" },
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
      return NextResponse.json({
        audioUrl: cached,
        voice,
        speed,
        textLength: text.length,
        cached: true,
        timestamp: new Date().toISOString(),
        rateLimit: {
          remaining: rateLimit.remaining,
          reset: rateLimit.reset.toISOString(),
        },
      });
    }

    // Generate TTS via OpenAI (audio/speech endpoint)
    const ttsResp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text.trim(),
        voice,
        response_format: "mp3",
        speed,
      }),
    });

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
    await cache.setTtsAudio(ttsHash, voice, audioUrl);

    return NextResponse.json({
      audioUrl,
      voice,
      speed,
      textLength: text.length,
      audioSize: audioBuffer.byteLength,
      cached: false,
      timestamp: new Date().toISOString(),
      rateLimit: {
        remaining: rateLimit.remaining,
        reset: rateLimit.reset.toISOString(),
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
