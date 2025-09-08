/* eslint-disable @typescript-eslint/no-explicit-any */
import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { logInteraction } from "@/lib/analytics/logInteraction";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // seconds - serverless slot

// Helpers (safe at top-level)
async function dynamicImports() {
  const [upstashModule, embeddingModule, upstashVectorModule] =
    await Promise.all([
      import("@/lib/upstash"),
      import("@/lib/embedding-service"),
      import("@/lib/upstash-vector"),
    ]);

  const { CacheService, checkRateLimit, createHash, getUserIdentifier } =
    upstashModule as any;
  const createEmbeddings = (embeddingModule as any).createEmbeddings;
  const upstashVector = (upstashVectorModule as any).default;

  return {
    CacheService,
    checkRateLimit,
    createHash,
    getUserIdentifier,
    createEmbeddings,
    upstashVector,
  };
}

function sha256Buffer(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest();
}

/** convert Data URL to Uint8Array */
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

function estimateMinutesFromText(text?: string | null, wpm = 150) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(1, Math.ceil(words / wpm));
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB

export async function POST(request: NextRequest) {
  // dynamic imports (lazy)
  const {
    CacheService,
    checkRateLimit,
    createHash,
    getUserIdentifier,
    createEmbeddings,
    upstashVector,
  } = await dynamicImports();

  // lazy-init cache instance
  const cache = CacheService.getInstance();

  // envs (read at request-time so build doesn't evaluate them)
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const WIDGET_JWT_SECRET = process.env.WIDGET_JWT_SECRET || "";
  if (!OPENAI_KEY) console.warn("OPENAI_API_KEY not set - voice will fail.");
  if (!WIDGET_JWT_SECRET)
    console.warn(
      "WIDGET_JWT_SECRET not set - widget tokens won't be validated.",
    );

  try {
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

    // Rate limiting
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

    // Accept multipart/form-data or JSON dataurl
    const contentType = request.headers.get("content-type") || "";
    let audioBuffer: Uint8Array | null = null;
    let transcriptFromClient: string | null = null;
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

    if (!kbId)
      return NextResponse.json({ error: "Missing kbId" }, { status: 400 });

    // Load KB metadata (cache)
    let kbData;
    if (!kbData) {
      const kb = await prisma.knowledgeBase.findUnique({
        where: { id: kbId },
        select: { id: true, userId: true, botId: true, metadata: true },
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
        botId: kb.botId ?? null,
        metadata: kb.metadata as unknown as KbMetadata & {
          apiKeyHash?: string;
        },
      };
    }

    const metadata = kbData.metadata;

    // Auth checks (widget vs API key)
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

    // Transcript (client-supplied or transcribe)
    let transcript = transcriptFromClient ?? null;
    let audioHash: string | null = null;
    let transcriptWasCached = false;

    if (!transcript && audioBuffer) {
      audioHash = createHash(Buffer.from(audioBuffer).toString("base64"));
      const cachedTranscript = await cache.getTranscription(audioHash);
      transcriptWasCached = Boolean(cachedTranscript);
      transcript = cachedTranscript ?? null;

      if (!transcript) {
        // transcribe with OpenAI Whisper
        const formData = new FormData();
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

        if (audioHash) await cache.setTranscription(audioHash, transcript);
      }
    }

    const isArabic = /[\u0600-\u06FF]/.test(transcript ?? "");
    const llmModel =
      process.env.LLM_MODEL || process.env.CHAT_MODEL || "gpt-4o-mini";
    const systemPromptBase = isArabic
      ? "أنت مساعد ذكي يتحدث العربية. كن مفيداً ومختصراً في إجاباتك. أجب باللغة العربية."
      : "You are a helpful assistant. Keep responses concise and in the user's language.";

    // ===== KB grounding (embedding + retrieval) =====
    let retrieved: Array<{ text: string; similarity: number; metadata: any }> =
      [];
    let retrievedCount = 0;
    try {
      if (transcript && transcript.trim().length > 0) {
        const cachedEmbedding = await cache.getEmbedding(transcript);
        let queryVec: number[] | undefined;
        if (Array.isArray(cachedEmbedding) && cachedEmbedding.length > 0) {
          queryVec = cachedEmbedding as number[];
        } else {
          const embs = await createEmbeddings([transcript]);
          queryVec = embs[0];
          if (queryVec) await cache.setEmbedding(transcript, queryVec);
        }

        if (queryVec) {
          const topK = Number(process.env.VOICE_RETRIEVAL_TOPK ?? 5);
          const results = await upstashVector.query(queryVec, {
            topK,
            includeMetadata: true,
            includeVectors: false,
            filter: `kbId = '${kbId.replace(/'/g, "\\'")}'`,
          });

          retrieved = (results ?? []).map((r: any) => {
            const md = r.metadata as Record<string, unknown> | undefined;
            return {
              text: (md?.text as string) ?? "",
              similarity: r.score ?? 0,
              metadata: {
                documentId: (md?.documentId as string) ?? "",
                filename: (md?.filename as string) ?? "",
                sourceUrl: (md?.sourceUrl as string) ?? "",
                chunkIndex: Number(md?.chunkIndex ?? 0),
                totalChunks: Number(md?.totalChunks ?? 1),
                startOffset: Number(md?.startOffset ?? 0),
                endOffset: Number(md?.endOffset ?? 0),
              },
            };
          });

          retrievedCount = retrieved.length;
        }
      }
    } catch (e) {
      console.warn("Voice KB retrieval failed, continuing without KB:", e);
      retrieved = [];
      retrievedCount = 0;
    }

    const sourceBlocks = retrieved.map((r, i) => {
      const srcMeta = r.metadata ?? {};
      const label = srcMeta.filename || srcMeta.sourceUrl || `source-${i + 1}`;
      return `SOURCE ${i + 1} (${label}, score=${(r.similarity || 0).toFixed(3)}):\n${r.text}`;
    });

    const personality = (metadata?.personality as string) ?? "";
    const retrievalText = sourceBlocks.length
      ? `Use the following retrieved snippets to ground your answer:\n\n${sourceBlocks.join("\n\n---\n\n")}\n\n`
      : "";

    const finalSystemInstruction =
      `${personality || systemPromptBase}\n\n${retrievalText}`.trim();

    // Build LLM input
    const llmInput = `${finalSystemInstruction}\n\nUser: ${transcript}\nAssistant:`;

    // LLM caching based on llmInput
    const responseHash = createHash(llmInput);
    let reply = await cache.get(`llm_response:${responseHash}`);

    if (!reply) {
      const llmResp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: llmModel,
          input: llmInput,
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

      await cache.set(`llm_response:${responseHash}`, reply, 1800);
    }

    // TTS generation with caching
    let audioDataUrl: string | null = null;
    const voice = isArabic ? voiceName || "nova" : voiceName || "alloy";
    const ttsHash = createHash(`${reply}:${voice}`);
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

    const finalConversationId =
      conversationId ??
      `voice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    // cached flags
    const transcriptCachedFlag = transcriptWasCached;
    const llmResponseCachedFlag = Boolean(
      await cache.get(`llm_response:${responseHash}`),
    );
    const ttsAudioCachedFlag = Boolean(await cache.getTtsAudio(ttsHash, voice));
    const overallCached =
      transcriptCachedFlag && llmResponseCachedFlag && ttsAudioCachedFlag;

    const minutes = estimateMinutesFromText(transcript, 150);

    // ---------------------------
    // Usage logging (new flow)
    // ---------------------------
    const eventId = crypto.randomUUID();

    try {
      // 1) update aggregatedUsage and create minimal usage audit row (via helper)
      await logInteraction({
        userId: kbData.userId,
        botId: kbData.botId,
        channel: "voice",
        interactions: 1,
        minutes,
        eventId,
      });
    } catch (err) {
      console.warn("logInteraction failed (voice):", err);
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
          minutes,
          meta: {
            kbId,
            conversationId: finalConversationId,
            cached: overallCached,
            promptSize: transcript ? transcript.length : 0,
            retrievedCount,
            transcriptLength: transcript?.length ?? 0,
            replyLength: reply.length,
            cachedFlags: {
              transcript: transcriptCachedFlag,
              llmResponse: llmResponseCachedFlag,
              ttsAudio: ttsAudioCachedFlag,
            },
            createdAt: new Date().toISOString(),
          },
        },
        update: {
          date: new Date(),
          meta: {
            set: {
              kbId,
              conversationId: finalConversationId,
              cached: overallCached,
              promptSize: transcript ? transcript.length : 0,
              retrievedCount,
              transcriptLength: transcript?.length ?? 0,
              replyLength: reply.length,
              cachedFlags: {
                transcript: transcriptCachedFlag,
                llmResponse: llmResponseCachedFlag,
                ttsAudio: ttsAudioCachedFlag,
              },
              lastSeenAt: new Date().toISOString(),
            },
          },
        },
      });
    } catch (err) {
      console.warn("usage upsert failed (voice):", err);
    }

    return NextResponse.json({
      text: transcript,
      reply,
      audio: audioDataUrl,
      conversationId: finalConversationId,
      source: "llm",
      history: [],
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
