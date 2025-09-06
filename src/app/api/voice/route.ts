// src/app/api/voice/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@/lib/prisma";
import {
  CacheService,
  checkRateLimit,
  getUserIdentifier,
  createHash,
} from "@/lib/upstash";
import crypto from "crypto";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // seconds - serverless slot

const cache = CacheService.getInstance();

// Security helpers
function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
function sha256Buffer(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest();
}

/**
 * Helper: convert Data URL (data:audio/..;base64,...) into ArrayBuffer/Uint8Array
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  try {
    const match = dataUrl.match(/^data:audio\/[a-z0-9.+-]+;base64,(.*)$/i);
    if (!match) return null;
    const b64 = match[1];
    const buf = Buffer.from(b64, "base64");
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const WIDGET_JWT_SECRET = process.env.WIDGET_JWT_SECRET || "";
if (!OPENAI_KEY) console.warn("OPENAI_API_KEY not set - voice will fail.");
if (!WIDGET_JWT_SECRET)
  console.warn("WIDGET_JWT_SECRET not set - widget tokens won't be validated.");

// Acceptable audio max size
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB

export async function POST(request: NextRequest) {
  try {
    // Parse incoming credentials (authorization header may be JWT or API key)
    const authHeader = (request.headers.get("authorization") || "").replace(
      /^Bearer\s+/,
      "",
    );
    let widgetPayload: { kbId?: string; origin?: string } | null = null;
    if (authHeader && WIDGET_JWT_SECRET) {
      try {
        const secretKey = new TextEncoder().encode(WIDGET_JWT_SECRET);
        const { payload } = await jwtVerify(authHeader, secretKey);
        widgetPayload = {
          kbId: payload.kbId as string | undefined,
          origin: payload.origin as string | undefined,
        };
      } catch {
        widgetPayload = null;
      }
    }

    // Rate limiting with user identification
    const userIdentifier = getUserIdentifier(request, widgetPayload);
    const rateLimit = await checkRateLimit(userIdentifier, "voice");

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

    // Support both multipart/form-data (file upload) and JSON body with data URL
    const contentType = request.headers.get("content-type") || "";
    let audioBuffer: Uint8Array | null = null;
    let transcriptFromClient: string | null = null; // optional: client may send pre-transcribed text
    let kbId: string | undefined;
    let conversationId: string | undefined;
    let voiceName: string | undefined;

    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      kbId = (form.get("kbId") as string) || undefined;
      conversationId = (form.get("conversationId") as string) || undefined;
      voiceName = (form.get("voiceName") as string) || undefined;
      const file = form.get("audio") as File | null;
      const textField = form.get("text") as string | null;
      if (textField) transcriptFromClient = textField;

      if (file) {
        if (file.size > MAX_AUDIO_BYTES)
          return NextResponse.json(
            { error: "Audio too large" },
            { status: 400 },
          );
        const arrBuf = await file.arrayBuffer();
        audioBuffer = new Uint8Array(arrBuf);
      }
    } else {
      // JSON body
      const body = await request.json().catch(() => ({}));
      const audioData =
        typeof body?.audio === "string" ? body.audio : undefined;
      kbId = body?.kbId ?? undefined;
      conversationId = body?.conversationId ?? undefined;
      voiceName = body?.voiceName ?? undefined;
      if (typeof body?.text === "string") transcriptFromClient = body.text;

      if (audioData) {
        const ua = dataUrlToUint8Array(audioData);
        if (!ua)
          return NextResponse.json(
            { error: "Invalid audio data URL" },
            { status: 400 },
          );
        if (ua.byteLength > MAX_AUDIO_BYTES)
          return NextResponse.json(
            { error: "Audio too large" },
            { status: 400 },
          );
        audioBuffer = ua;
      }
    }

    // kbId required (private KBs)
    if (!kbId)
      return NextResponse.json({ error: "Missing kbId" }, { status: 400 });

    // Load KB metadata from cache first, then DB if needed
    let kbData = await cache.getKbMetadata(kbId);
    if (!kbData) {
      const kb = await prisma.knowledgeBase.findUnique({
        where: { id: kbId },
        select: { id: true, userId: true, metadata: true },
      });

      if (!kb) {
        return NextResponse.json(
          { error: "Knowledge base not found" },
          { status: 404 },
        );
      }

      kbData = {
        id: kb.id,
        userId: kb.userId,
        metadata: (kb.metadata as Record<string, any>) ?? {},
      };

      // Cache for future requests
      await cache.setKbMetadata(kbId, kbData);
    }

    const metadata = kbData.metadata;

    // Authentication checks
    if (widgetPayload) {
      // ensure token's kbId matches
      if (widgetPayload.kbId !== kbId) {
        return NextResponse.json(
          { error: "KB ID mismatch in widget token" },
          { status: 403 },
        );
      }

      // Verify the token's parent origin (encoded in JWT) is allowed for this KB.
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
      // No widget token: require API key (KB is private)
      const storedHash =
        typeof metadata.apiKeyHash === "string"
          ? metadata.apiKeyHash
          : undefined;
      const storedPlain =
        typeof metadata.apiKey === "string" ? metadata.apiKey : undefined; // legacy
      if (!authHeader) {
        return NextResponse.json(
          { error: "Unauthorized (missing API key or widget token)" },
          { status: 401 },
        );
      }
      // If hash exists, compare timing-safe
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
      } else if (storedPlain) {
        if (authHeader !== storedPlain)
          return NextResponse.json(
            { error: "Unauthorized (invalid API key - legacy)" },
            { status: 401 },
          );
      } else {
        // KB is private by policy — require key or widget
        return NextResponse.json(
          { error: "Knowledge base is private; API key required" },
          { status: 401 },
        );
      }
    }

    // If no audio buffer but transcript provided by client, use it and skip transcription
    let transcript = transcriptFromClient ?? null;
    let audioHash: string | null = null;

    // If we have an audio buffer, check cache first, then transcribe with OpenAI Whisper
    if (!transcript && audioBuffer) {
      // Create hash of audio for caching
      audioHash = createHash(Buffer.from(audioBuffer).toString("base64"));

      // Check if we've transcribed this audio before
      transcript = await cache.getTranscription(audioHash);

      if (!transcript) {
        // create a blob & multipart for OpenAI
        const formData = new FormData();
        // Convert Uint8Array to Blob/ File-like using Buffer
        const file = new Blob([Buffer.from(audioBuffer)], {
          type: "audio/webm",
        });
        formData.append("file", file, "audio.webm");
        formData.append("model", "whisper-1");
        formData.append("language", "auto");
        formData.append("response_format", "verbose_json");

        const resp = await fetch(
          "https://api.openai.com/v1/audio/transcriptions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENAI_KEY}` },
            body: formData as any,
          },
        );

        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          console.error("Whisper transcription failed:", resp.status, txt);
          return NextResponse.json(
            { error: "Transcription failed" },
            { status: 502 },
          );
        }

        const json = await resp.json();
        transcript = (json?.text || "").trim();
        if (!transcript)
          return NextResponse.json(
            { error: "No speech detected" },
            { status: 400 },
          );

        // Cache the transcription
        await cache.setTranscription(audioHash, transcript);
      }
    }

    // Language detection (simple heuristic)
    const isArabic = /[\u0600-\u06FF]/.test(transcript ?? "");

    // Build system prompt & call LLM
    const llmModel =
      process.env.LLM_MODEL || process.env.CHAT_MODEL || "gpt-4o-mini";
    const systemPrompt = isArabic
      ? "أنت مساعد ذكي يتحدث العربية. كن مفيداً ومختصراً في إجاباتك. أجب باللغة العربية."
      : "You are a helpful assistant. Keep responses concise and in the user's language.";

    // Check if we have a cached LLM response for this transcript
    const responseHash = createHash(`${systemPrompt}:${transcript}`);
    let reply = await cache.get<string>(`llm_response:${responseHash}`);

    if (!reply) {
      // Call OpenAI Responses API
      const llmResp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: llmModel,
          input: `${systemPrompt}\n\nUser: ${transcript}`,
          max_output_tokens: 800,
          temperature: 0.2,
        }),
      });

      if (!llmResp.ok) {
        const txt = await llmResp.text().catch(() => "");
        console.error("LLM call failed:", llmResp.status, txt);
        return NextResponse.json(
          { error: "Failed to generate response" },
          { status: 502 },
        );
      }

      const llmJson = await llmResp.json();
      // robustly extract text
      if (Array.isArray(llmJson.output)) {
        reply = llmJson.output
          .map((o: any) =>
            (o?.content || [])
              .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
              .join(" "),
          )
          .join(" ")
          .trim();
      } else if (typeof llmJson.output_text === "string") {
        reply = llmJson.output_text;
      } else {
        reply =
          String(llmJson?.output?.[0]?.content?.[0]?.text ?? "") ||
          String(llmJson?.choices?.[0]?.message?.content ?? "");
      }
      reply = reply || "I couldn't generate a response.";

      // Cache the LLM response for 30 minutes
      await cache.set(`llm_response:${responseHash}`, reply, 1800);
    }

    // TTS generation with caching
    let audioDataUrl: string | null = null;
    const voice = isArabic ? voiceName || "nova" : voiceName || "alloy";
    const ttsHash = createHash(`${reply}:${voice}`);

    // Check TTS cache first
    audioDataUrl = await cache.getTtsAudio(ttsHash, voice);

    if (!audioDataUrl) {
      try {
        const ttsResp = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1",
            input: reply,
            voice: voice,
            response_format: "mp3",
            speed: 1.0,
          }),
        });

        if (ttsResp.ok) {
          const ab = await ttsResp.arrayBuffer();
          const b64 = Buffer.from(ab).toString("base64");
          audioDataUrl = `data:audio/mp3;base64,${b64}`;

          // Cache the TTS audio
          await cache.setTtsAudio(ttsHash, voice, audioDataUrl);
        } else {
          const txt = await ttsResp.text().catch(() => "");
          console.warn(
            "TTS failed, continuing without audio:",
            ttsResp.status,
            txt,
          );
        }
      } catch (ttsErr) {
        console.warn("TTS request error - continuing without audio:", ttsErr);
      }
    }

    // Create a simple conversationId for voice session if not provided
    const finalConversationId =
      conversationId ??
      `voice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    // Record usage (non-blocking)
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
              transcriptLength: transcript?.length ?? 0,
              replyLength: reply.length,
              cached: {
                transcript:
                  !!audioHash && !!(await cache.getTranscription(audioHash)),
                llmResponse: !!(await cache.get(
                  `llm_response:${responseHash}`,
                )),
                ttsAudio: !!(await cache.getTtsAudio(ttsHash, voice)),
              },
            },
          },
        });
      } catch (e) {
        console.warn("Usage log failed:", e);
      }
    })();

    // Return payload matching your docs
    return NextResponse.json({
      text: transcript,
      reply,
      audio: audioDataUrl, // may be null
      conversationId: finalConversationId,
      source: "llm",
      history: [], // you can expand this in the future
      language: isArabic ? "ar" : "en",
      rateLimit: {
        remaining: rateLimit.remaining,
        reset: rateLimit.reset.toISOString(),
      },
    });
  } catch (err) {
    console.error("Voice API error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

// disallow other methods
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
