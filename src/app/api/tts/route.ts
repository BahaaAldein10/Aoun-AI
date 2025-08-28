// app/api/tts/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Rate limiting store (in production, use Redis or database)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0]
    : request.headers.get("x-real-ip") || "unknown";
  return `tts_api_${ip}`;
}

function checkRateLimit(
  key: string,
  maxRequests = 20,
  windowMs = 60000,
): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

// Validate voice name
const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitKey = getRateLimitKey(request);
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    // Validate environment variables
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.error("OPENAI_API_KEY not configured");
      return NextResponse.json(
        { error: "Service configuration error" },
        { status: 500 },
      );
    }

    // Parse request body
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { text, voice = "alloy", speed = 1.0 } = body;

    // Validate input
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

    console.log(
      `Generating TTS for text: "${text.substring(0, 50)}..." with voice: ${voice}`,
    );

    // Generate speech with OpenAI TTS
    const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1", // or "tts-1-hd" for higher quality
        input: text.trim(),
        voice: voice,
        response_format: "mp3",
        speed: speed,
      }),
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error("TTS API error:", errorText);

      if (ttsResponse.status === 429) {
        return NextResponse.json(
          { error: "TTS service rate limit exceeded. Please try again later." },
          { status: 429 },
        );
      }

      return NextResponse.json(
        {
          error: "Failed to generate speech",
          details:
            ttsResponse.status === 413
              ? "Text too long"
              : "Service temporarily unavailable",
        },
        { status: 502 },
      );
    }

    // Get audio buffer
    const audioBuffer = await ttsResponse.arrayBuffer();

    if (audioBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: "Empty audio response" },
        { status: 502 },
      );
    }

    // Convert to base64 data URL for immediate playback
    const base64Audio = Buffer.from(audioBuffer).toString("base64");
    const audioUrl = `data:audio/mp3;base64,${base64Audio}`;

    console.log(
      `TTS generation successful. Audio size: ${audioBuffer.byteLength} bytes`,
    );

    // Return successful response
    return NextResponse.json({
      audioUrl,
      voice,
      speed,
      textLength: text.length,
      audioSize: audioBuffer.byteLength,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("TTS API error:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        message: "An unexpected error occurred while generating speech",
      },
      { status: 500 },
    );
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json(
    {
      error: "Method not allowed",
      message: "Use POST to generate text-to-speech",
    },
    { status: 405 },
  );
}

export async function PUT() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
