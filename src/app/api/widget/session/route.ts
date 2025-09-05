// src/app/api/widget/session/route.ts
import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";

const TOKEN_EXP_SECONDS = Number(process.env.WIDGET_TOKEN_EXP ?? 300); // 5 minutes
const WIDGET_JWT_SECRET = process.env.WIDGET_JWT_SECRET;

if (!WIDGET_JWT_SECRET) {
  throw new Error("WIDGET_JWT_SECRET is not defined in your environment");
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function corsHeaders(origin?: string) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, X-API-Key",
    "Access-Control-Allow-Credentials": "true",
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return NextResponse.json({}, { headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin") ?? "*";

  try {
    const { kbId } = await req.json();

    if (!kbId) {
      return NextResponse.json({ error: "Missing kbId" }, { status: 400 });
    }

    const requestOrigin = req.headers.get("origin");
    const apiKey = req.headers.get("x-api-key");

    if (!requestOrigin) {
      return NextResponse.json(
        { error: "Missing request origin" },
        { status: 400 },
      );
    }

    // Load KB and validate
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: { id: true, userId: true, metadata: true },
    });

    if (!kb) {
      return NextResponse.json({ error: "KB not found" }, { status: 404 });
    }

    const metadata = kb.metadata as KbMetadata & { apiKeyHash?: string };

    // Method 1: API Key Authentication (Preferred for production)
    if (apiKey) {
      const apiKeyHash = metadata?.apiKeyHash;
      if (!apiKeyHash) {
        return NextResponse.json(
          { error: "API key not configured for this knowledge base" },
          { status: 400 },
        );
      }

      const providedKeyHash = sha256Hex(apiKey);
      if (providedKeyHash !== apiKeyHash) {
        return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
      }

      // API key is valid - skip origin validation for API key auth
      console.log(`Widget: API key authenticated for kbId: ${kbId}`);
    } else {
      // Method 2: Origin-based Authentication (Fallback)
      const allowedOrigins = metadata?.allowedOrigins ?? [];

      if (allowedOrigins.length === 0) {
        return NextResponse.json(
          {
            error:
              "No authentication method configured. Please set up API keys or allowed origins.",
          },
          { status: 400 },
        );
      }

      const normalized = allowedOrigins.map((o) => new URL(o).origin);
      if (!normalized.includes(new URL(requestOrigin).origin)) {
        return NextResponse.json(
          { error: "Origin not allowed" },
          { status: 403 },
        );
      }

      console.log(`Widget: Origin authenticated for kbId: ${kbId}`);
    }

    // Generate JWT token
    const secretKey = new TextEncoder().encode(WIDGET_JWT_SECRET);
    const expUnix = Math.floor(Date.now() / 1000) + TOKEN_EXP_SECONDS;

    const tokenPayload = {
      kbId,
      origin: requestOrigin,
      auth_method: apiKey ? "api_key" : "origin",
      iat: Math.floor(Date.now() / 1000),
    };

    const token = await new SignJWT(tokenPayload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(expUnix)
      .sign(secretKey);

    const safeMetadata = {
      primaryColor: metadata?.primaryColor,
      accentColor: metadata?.accentColor,
      voice: metadata?.voice,
      language: metadata?.language,
    };

    return NextResponse.json(
      {
        token,
        expires_in: TOKEN_EXP_SECONDS,
        metadata: safeMetadata,
        auth_method: apiKey ? "api_key" : "origin",
      },
      { headers: corsHeaders(origin) },
    );
  } catch (err) {
    console.error("session token error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
