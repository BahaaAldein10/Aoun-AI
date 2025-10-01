import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEMO_KB_ID = process.env.DEMO_KB_ID ?? null;

export async function POST(req: Request) {
  try {
    const body: {
      kbId?: string;
      voice?: string;
      language?: string;
      isDemo?: boolean;
    } = await req.json().catch(() => ({}));

    const { kbId, voice, language, isDemo = false } = body;

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

    const isDemoKb = DEMO_KB_ID !== null && kbId === DEMO_KB_ID;

    if (isDemoKb || isDemo) {
      const demoKbData = {
        id: DEMO_KB_ID!,
        title: "Demo Knowledge Base",
        metadata: {
          personality:
            "You are a helpful AI assistant demonstrating platform capabilities. Be conversational and informative. Ground answers in available context and be concise.",
          language: language || "en",
          voice: voice || "alloy",
        } as KbMetadata,
      };

      const model =
        process.env.OPENAI_REALTIME_MODEL || "gpt-4o-mini-realtime-preview";

      const demoSessionConfig = {
        model,
        voice: voice || demoKbData.metadata?.voice || "alloy",
        modalities: ["text", "audio"],
        instructions:
          `You are a knowledgeable voice assistant with direct access to our platform's knowledge base.

CRITICAL INSTRUCTIONS:
1. Answer questions directly using information from the search_knowledge_base function results
2. DO NOT redirect users with phrases like "you can check the platform" or "see our website"
3. Extract and present the actual information from search results in your responses
4. Be conversational, natural, and concise in voice format
5. Only say you don't have information if search results genuinely don't contain relevant details
6. Synthesize information from multiple sources when appropriate
7. Present information as if you're explaining it directly, not reading from a document

${demoKbData.metadata?.personality || ""}

Keep responses brief and natural for voice conversation.`.trim(),
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
        tools: [
          {
            type: "function",
            name: "search_knowledge_base",
            description:
              "Search the knowledge base for relevant information to answer the user's question. Always use this before responding to questions about the platform or services.",
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

      const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(demoSessionConfig),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Failed to create demo realtime session:", {
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

      return NextResponse.json({
        ...session,
        isDemo: isDemoKb || isDemo,
        kbContext: {
          kbId: DEMO_KB_ID,
          title: demoKbData.title,
          personality: demoKbData.metadata?.personality,
          userId: null,
          botId: null,
        },
      });
    }

    // Regular KB handling (non-demo)
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
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

    const metadata = kb.metadata as KbMetadata;
    const personality = (metadata?.personality as string) ?? "";
    const kbTitle = kb.title || "Knowledge Base";

    const model =
      process.env.OPENAI_REALTIME_MODEL || "gpt-4o-mini-realtime-preview";

    const kbInstructions =
      `You are a knowledgeable voice assistant with direct access to the "${kbTitle}" knowledge base.

CRITICAL INSTRUCTIONS:
1. Answer questions directly using information from the search_knowledge_base function results
2. DO NOT redirect users with phrases like "you can check the platform" or refer them elsewhere
3. Extract and present the actual information from search results in your responses
4. Be conversational, natural, and concise - this is a voice conversation
5. Only say you don't have information if search results genuinely don't contain relevant details
6. Synthesize information from multiple sources when appropriate
7. Present information naturally as if explaining it directly to someone

${personality ? `Additional guidance: ${personality}` : ""}

Keep responses brief and natural for voice conversation. Aim for 2-3 sentences unless more detail is specifically requested.`.trim();

    const sessionConfig = {
      model,
      voice: voice || metadata?.voice || "alloy",
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
      tools: [
        {
          type: "function",
          name: "search_knowledge_base",
          description:
            "Search the knowledge base for relevant information to answer the user's question. Always use this function when users ask about specific topics, features, or information.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "The search query to find relevant information. Be specific and focus on key terms.",
              },
            },
            required: ["query"],
          },
        },
      ],
      tool_choice: "auto",
    };

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

    return NextResponse.json({
      ...session,
      isDemo: false,
      kbContext: {
        kbId,
        title: kbTitle,
        personality,
        userId: kb.userId,
        botId: kb.bot?.id,
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
