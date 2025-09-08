import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body: {
      kbId?: string;
      voice?: string;
      language?: string;
    } = await req.json().catch(() => ({}));

    const { kbId, voice, language } = body;

    if (!kbId) {
      return NextResponse.json({ error: "kbId is required" }, { status: 400 });
    }

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return NextResponse.json(
        { error: "server_misconfigured" },
        { status: 500 },
      );
    }

    // Load KB data and metadata
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

    if (!kb) {
      return NextResponse.json(
        { error: "Knowledge base not found" },
        { status: 404 },
      );
    }

    const metadata = kb.metadata as KbMetadata;
    const personality = (metadata?.personality as string) ?? "";
    const kbTitle = kb.title || "Knowledge Base";

    // Create KB-aware instructions
    const kbInstructions = `You are an AI assistant with access to a knowledge base called "${kbTitle}". ${personality}

IMPORTANT: When users ask questions, you should provide answers based on the knowledge base content. Always ground your responses in the provided context and be helpful and accurate.

If you don't have relevant information in the knowledge base to answer a question, politely explain that you don't have that information available and suggest they might want to ask something else related to the knowledge base content.

Be conversational and natural in your responses while maintaining accuracy to the source material.`;

    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-4o-mini-realtime";

    // Create session config with KB context
    const sessionConfig = {
      model,
      voice: voice || "alloy",
      modalities: ["text", "audio"],
      instructions: kbInstructions,
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
        create_response: true,
      },
      temperature: 0.7,
      max_response_output_tokens: 1000,
      // Add tools for KB retrieval
      tools: [
        {
          type: "function",
          name: "search_knowledge_base",
          description:
            "Search the knowledge base for relevant information to answer the user's question",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query to find relevant information",
              },
            },
            required: ["query"],
          },
        },
      ],
      tool_choice: "auto",
    };

    console.log("Creating KB-aware realtime session:", {
      model,
      voice: voice || "alloy",
      kbId,
      kbTitle,
      hasPersonality: !!personality,
    });

    const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Failed to create realtime session:", {
        status: res.status,
        statusText: res.statusText,
        body: text,
      });
      return NextResponse.json(
        { error: "failed_to_create_session", details: text },
        { status: res.status },
      );
    }

    const session = await res.json();
    console.log("KB-aware realtime session created:", {
      id: session.id,
      expires_at: session.expires_at,
      model: session.model,
    });

    // Add KB context to session response for client reference
    return NextResponse.json({
      ...session,
      kbContext: {
        kbId,
        title: kbTitle,
        personality,
      },
    });
  } catch (err) {
    console.error("Session route error:", err);
    return NextResponse.json(
      { error: "internal_error", details: String(err) },
      { status: 500 },
    );
  }
}
