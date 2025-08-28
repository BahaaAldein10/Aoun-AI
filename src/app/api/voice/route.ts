// app/api/voice/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // 30 seconds timeout

// Rate limiting store (in production, use Redis or database)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function getRateLimitKey(request: NextRequest): string {
  // Use IP address for rate limiting
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0]
    : request.headers.get("x-real-ip") || "unknown";
  return `voice_api_${ip}`;
}

function checkRateLimit(
  key: string,
  maxRequests = 10,
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

    // Parse form data
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 },
      );
    }

    // Validate audio file
    if (audioFile.size === 0) {
      return NextResponse.json(
        { error: "Audio file is empty" },
        { status: 400 },
      );
    }

    if (audioFile.size > 25 * 1024 * 1024) {
      // 25MB limit
      return NextResponse.json(
        { error: "Audio file too large (max 25MB)" },
        { status: 400 },
      );
    }

    console.log(
      `Processing audio file: ${audioFile.size} bytes, type: ${audioFile.type}`,
    );

    // Step 1: Transcribe audio with OpenAI Whisper
    const transcribeFormData = new FormData();
    transcribeFormData.append("file", audioFile, "audio.webm");
    transcribeFormData.append("model", "whisper-1");
    transcribeFormData.append("language", "auto"); // Auto-detect language
    transcribeFormData.append("response_format", "verbose_json");

    const transcriptionResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: transcribeFormData,
      },
    );

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      console.error("Transcription failed:", errorText);
      return NextResponse.json(
        {
          error: "Transcription failed",
          details:
            transcriptionResponse.status === 413
              ? "Audio file too large"
              : "Service temporarily unavailable",
        },
        { status: 502 },
      );
    }

    const transcriptionData = await transcriptionResponse.json();
    const transcript = transcriptionData.text?.trim();

    if (!transcript) {
      return NextResponse.json(
        { error: "No speech detected in audio" },
        { status: 400 },
      );
    }

    console.log("Transcript:", transcript);

    // Detect if Arabic
    const isArabic =
      /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
        transcript,
      );

    // Step 2: Generate response with GPT
    const llmEndpoint =
      process.env.CHAT_ENDPOINT || "https://api.openai.com/v1/chat/completions";
    const llmApiKey = process.env.OPENROUTER_API_KEY || openaiKey;
    const llmModel = process.env.LLM_MODEL || "gpt-4o-mini";

    const systemPrompt = isArabic
      ? "أنت مساعد ذكي يتحدث العربية. كن مفيداً ومختصراً في إجاباتك. أجب باللغة العربية."
      : "You are a helpful AI assistant. Keep responses concise and conversational. Respond in the same language as the user's input.";

    const chatResponse = await fetch(llmEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmApiKey}`,
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: transcript,
          },
        ],
        max_tokens: 300,
        temperature: 0.7,
        stream: false,
      }),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      console.error("Chat completion failed:", errorText);
      return NextResponse.json(
        {
          error: "Failed to generate response",
          details: "Service temporarily unavailable",
        },
        { status: 502 },
      );
    }

    const chatData = await chatResponse.json();
    const reply =
      chatData?.choices?.[0]?.message?.content?.trim() ||
      chatData?.choices?.[0]?.text?.trim() ||
      "I couldn't generate a response.";

    console.log("Reply:", reply);

    // Step 3: Generate speech with OpenAI TTS
    let audioUrl = null;

    try {
      const ttsResponse = await fetch(
        "https://api.openai.com/v1/audio/speech",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1", // or "tts-1-hd" for higher quality
            input: reply,
            voice: isArabic ? "nova" : "alloy", // Nova works better for Arabic
            response_format: "mp3",
            speed: 1.0,
          }),
        },
      );

      if (ttsResponse.ok) {
        const audioBuffer = await ttsResponse.arrayBuffer();

        // Convert to base64 data URL for immediate playback
        const base64Audio = Buffer.from(audioBuffer).toString("base64");
        audioUrl = `data:audio/mp3;base64,${base64Audio}`;

        console.log("TTS audio generated successfully");
      } else {
        const errorText = await ttsResponse.text();
        console.error("TTS failed:", errorText);
        // Continue without TTS - client will use speech synthesis
      }
    } catch (ttsError) {
      console.error("TTS generation error:", ttsError);
      // Continue without TTS - client will use speech synthesis
    }

    // Return successful response
    return NextResponse.json({
      transcript,
      reply,
      audioUrl,
      language: isArabic ? "ar" : "en",
      model: llmModel,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Voice API error:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        message: "An unexpected error occurred while processing your request",
      },
      { status: 500 },
    );
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
