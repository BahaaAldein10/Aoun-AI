import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Demo configuration
const DEMO_KB_ID = process.env.DEMO_KB_ID!;
const DEMO_SESSION_DURATION = 5 * 60; // 5 minutes for demo sessions

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

    // Demo handling
    if (isDemo || kbId === DEMO_KB_ID) {
      console.log("Creating demo realtime session:", {
        voice: voice || "alloy",
        language: language || "en",
        duration: DEMO_SESSION_DURATION,
      });

      // Demo KB data
      const demoKbData = {
        id: DEMO_KB_ID,
        title: "Demo Knowledge Base",
        metadata: {
          personality:
            "You are a helpful and enthusiastic AI assistant showcasing our platform's capabilities. Be conversational, informative, and occasionally mention the benefits of signing up for the full service. Keep responses concise but engaging. This is a demo session with limited duration.",
          language: language || "en",
          voice: voice || "alloy",
        } as KbMetadata,
      };

      const demoInstructions = `You are an AI assistant demonstrating our platform's capabilities with access to information about our AI-powered business solutions. ${demoKbData.metadata?.personality}

IMPORTANT: This is a DEMO session. When users ask questions, provide helpful information about our platform, features, pricing, and capabilities. You have access to a search function to find relevant information.

Key topics you can help with:
- Platform features and capabilities
- Pricing and subscription plans  
- Getting started guides
- Use cases and applications
- Technical specifications
- Support and contact information

Always ground your responses in the retrieved context and be helpful while encouraging users to sign up for the full service. Keep responses concise and engaging for the demo experience.

If you don't have specific information, politely explain that this is a demo and the full version would have access to their custom knowledge base content.`;

      const model =
        process.env.OPENAI_REALTIME_MODEL || "gpt-4o-mini-realtime-preview";

      // Demo session config with shorter duration and limits
      const demoSessionConfig = {
        model,
        voice: voice || "alloy",
        modalities: ["text", "audio"],
        instructions: demoInstructions,
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
        max_response_output_tokens: 400, // Shorter responses for demo
        // Add tools for demo KB retrieval
        tools: [
          {
            type: "function",
            name: "search_knowledge_base",
            description:
              "Search the demo knowledge base for relevant information about our platform and services",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description:
                    "The search query to find relevant information about our platform",
                },
              },
              required: ["query"],
            },
          },
        ],
        tool_choice: "auto",
      };

      console.log("Creating demo realtime session with config:", {
        model,
        voice: voice || "alloy",
        maxTokens: 400,
        hasTools: true,
      });

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
      console.log("Demo realtime session created:", {
        id: session.id,
        expires_at: session.expires_at,
        model: session.model,
        isDemo: true,
      });

      // Return session with demo context
      return NextResponse.json({
        ...session,
        isDemo: true,
        kbContext: {
          kbId: DEMO_KB_ID,
          title: "Demo Knowledge Base",
          personality: demoKbData.metadata?.personality,
          isDemo: true,
          demoMessage:
            "This is a demo session showcasing our platform's capabilities. Sign up for unlimited access to custom knowledge bases!",
        },
      });
    }

    // Regular KB handling (non-demo)
    // Load KB data and metadata
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

    // Create KB-aware instructions
    const kbInstructions = `You are an AI assistant with access to a knowledge base called "${kbTitle}". ${personality}

IMPORTANT: When users ask questions, you should provide answers based on the knowledge base content. Always ground your responses in the provided context and be helpful and accurate.

If you don't have relevant information in the knowledge base to answer a question, politely explain that you don't have that information available and suggest they might want to ask something else related to the knowledge base content.

Be conversational and natural in your responses while maintaining accuracy to the source material.`;

    const model =
      process.env.OPENAI_REALTIME_MODEL || "gpt-4o-mini-realtime-preview";

    // Create session config with KB context
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
      voice: voice || metadata?.voice || "alloy",
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
