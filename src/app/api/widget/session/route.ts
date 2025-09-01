// src/app/api/widget/session/route.ts
import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { prisma } from "@/lib/prisma";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";

const TOKEN_EXP_SECONDS = Number(process.env.WIDGET_TOKEN_EXP ?? 300); // default 5 minutes
const WIDGET_JWT_SECRET = process.env.WIDGET_JWT_SECRET;

if (!WIDGET_JWT_SECRET) {
  throw new Error("WIDGET_JWT_SECRET is not defined in your environment");
}

function corsHeaders(origin?: string) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

// handle preflight
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
    if (!requestOrigin) {
      return NextResponse.json(
        { error: "Missing request origin" },
        { status: 400 },
      );
    }

    // Load KB and check allowed origin
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: { id: true, userId: true, metadata: true },
    });

    if (!kb) {
      return NextResponse.json({ error: "KB not found" }, { status: 404 });
    }

    const metadata = kb.metadata as KbMetadata;
    const allowedOrigins = metadata?.allowedOrigins ?? [];

    if (allowedOrigins.length === 0) {
      return NextResponse.json(
        { error: "No allowed origins configured" },
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

    // Sign JWT using JOSE
    const secretKey = new TextEncoder().encode(WIDGET_JWT_SECRET);
    const token = await new SignJWT({ kbId, origin: requestOrigin })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(TOKEN_EXP_SECONDS)
      .sign(secretKey);

    return NextResponse.json(
      { token, expires_in: TOKEN_EXP_SECONDS },
      { headers: corsHeaders(origin) },
    );
  } catch (err) {
    console.error("session token error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
