/* eslint-disable @typescript-eslint/no-explicit-any */
import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { logInteraction } from "@/lib/analytics/logInteraction";
import {
  recordInvocationMetrics,
  startInvocation,
} from "@/lib/monitoring/vercelMetrics";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import {
  checkUsageLimits,
  getOverageRate,
} from "@/lib/subscription/checkUsageLimits";

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
const DEMO_KB_ID = process.env.DEMO_KB_ID ?? null;

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

  const requestPath = new URL(request.url).pathname;
  const invCtx = startInvocation();

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
    const userIdentifier = getUserIdentifier(request, widgetPayload) ?? null;
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
        select: {
          id: true,
          userId: true,
          bot: { select: { id: true } },
          metadata: true,
        },
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
        botId: kb.bot?.id,
        metadata: kb.metadata as unknown as KbMetadata & {
          apiKeyHash?: string;
        },
      };
    }

    const metadata = kbData.metadata;
    const isDemoKb = DEMO_KB_ID !== null && kbId === DEMO_KB_ID;

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

    // ---------- SUBSCRIPTION & USAGE CHECK ----------
    try {
      if (!isDemoKb) {
        const estimatedMinutes = Math.max(
          1,
          estimateMinutesFromText(transcript),
        );
        const usageCheck = await checkUsageLimits(
          kbData.userId,
          estimatedMinutes,
        );

        if (!usageCheck.allowed) {
          const responseBody: any = {
            error: "usage_limit_exceeded",
            message: usageCheck.reason,
            requiresUpgrade: usageCheck.requiresUpgrade,
            planName: usageCheck.planName,
          };

          if (usageCheck.remainingMinutes !== undefined) {
            responseBody.usage = {
              remaining: usageCheck.remainingMinutes,
              total: usageCheck.totalMinutes,
              used: usageCheck.usedMinutes,
            };
          }

          if (usageCheck.planName) {
            const overageRate = getOverageRate(usageCheck.planName);
            if (overageRate > 0) {
              responseBody.overageRate = overageRate;
            }
          }

          return NextResponse.json(responseBody, { status: 402 });
        }
      }
    } catch (err) {
      console.warn("Usage check failed (voice):", err);
      // Fail-open: continue on transient errors but log it
    }
    // ---------- END SUBSCRIPTION & USAGE CHECK ----------

    const isArabic = /[\u0600-\u06FF]/.test(transcript ?? "");
    const llmModel = process.env.CHAT_MODEL || "gpt-4o-mini";

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

    // Build retrieval text with clearer labeling
    const retrievalText = sourceBlocks.length
      ? `\n\nRetrieved information from knowledge base:\n\n${sourceBlocks.join("\n\n---\n\n")}\n\n`
      : "\n\nNo specific information was retrieved from the knowledge base for this query. Provide a helpful general response or politely explain you don't have that information.\n\n";

    // Build improved system instruction based on language
    const baseSystemInstruction = isArabic
      ? `أنت مساعد صوتي ذكي لديه وصول مباشر إلى قاعدة معرفة المنصة.

تعليمات مهمة:
1. أجب على الأسئلة مباشرة باستخدام المعلومات من المصادر المقدمة أدناه
2. لا تخبر المستخدمين "يمكنك التحقق من المنصة" أو تحيلهم إلى مكان آخر
3. استخرج وقدم المعلومات الفعلية من المصادر في إجاباتك
4. كن محادثاً وطبيعياً ومختصراً - هذه محادثة صوتية
5. قل فقط أنه ليس لديك معلومات إذا لم تحتوي المصادر على تفاصيل ذات صلة
6. قدم المعلومات بشكل طبيعي كما لو كنت تشرحها مباشرة لشخص ما

${personality || ""}`
      : `You are a knowledgeable voice assistant with direct access to the platform's knowledge base.

CRITICAL INSTRUCTIONS:
1. Answer questions directly using information from the SOURCE blocks provided below
2. DO NOT redirect users with phrases like "you can check the platform" or refer them elsewhere
3. Extract and present the actual information from the sources in your responses
4. Be conversational, natural, and concise - this is a voice conversation
5. Only say you don't have information if the sources genuinely don't contain relevant details
6. Synthesize information from multiple sources when appropriate
7. Present information naturally as if explaining it directly to someone

${personality || ""}

Keep responses brief and natural for voice. Aim for 2-3 sentences unless more detail is requested.`;

    const finalSystemInstruction =
      `${baseSystemInstruction}${retrievalText}`.trim();

    // Build LLM input with clearer structure
    const llmInput = isArabic
      ? `${finalSystemInstruction}\n\nالسؤال الحالي:\nالمستخدم: ${transcript}\n\nقدم إجابة مباشرة ومفيدة باستخدام المعلومات المسترجعة أعلاه:\nالمساعد:`
      : `${finalSystemInstruction}\n\nCurrent question:\nUser: ${transcript}\n\nProvide a direct, informative answer using the retrieved information above:\nAssistant:`;

    // LLM caching based on llmInput
    const responseHash = createHash(llmInput);
    let reply = await cache.get(`llm_response:${responseHash}`);

    let llmMs = 0;

    if (!reply) {
      // --------- Measure LLM response time ---------
      const llmStart = Date.now();
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
      llmMs = Date.now() - llmStart; // <--- store elapsed ms
      // ---------------------------------------------

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
            model: "gpt-4o-mini-tts",
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

    // Heuristic correctness detection
    const fallbackRegex =
      /\b(i (do not|don't) know|cannot find|no information|sorry,|unable to)/i;
    const isFallback = !retrieved.length || fallbackRegex.test(reply);
    const isCorrect = retrieved.length > 0 && reply.length > 20 && !isFallback;
    const isNegative = !isCorrect;

    try {
      // 1) update aggregatedUsage and create minimal usage audit row (via helper)
      await logInteraction({
        userId: kbData.userId,
        botId: kbData.botId!,
        channel: "voice",
        interactions: 1,
        minutes,
        isCorrect,
        isNegative,
        isFallback,
        eventId,
        meta: {
          responseTimeMs: llmMs,
          requestPath,
          userIdentifier,
          promptSize: transcript ? transcript.length : 0,
          retrievedCount,
        },
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
            correctness: { isCorrect, isNegative, isFallback },
            cachedFlags: {
              transcript: transcriptCachedFlag,
              llmResponse: llmResponseCachedFlag,
              ttsAudio: ttsAudioCachedFlag,
            },
            responseTimeMs: llmMs,
            requestPath,
            userIdentifier,
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
              responseTimeMs: llmMs,
              requestPath,
              userIdentifier,
              lastSeenAt: new Date().toISOString(),
            },
          },
        },
      });
    } catch (err) {
      console.warn("usage upsert failed (voice):", err);
    }

    void recordInvocationMetrics(await invCtx, {
      llmResponseMs: llmMs,
      userId: kbData?.userId,
      botId: kbData?.botId,
      tag: "voice",
    });

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
