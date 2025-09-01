// src/app/api/kb/[id]/generate-api-key/route.ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { NextResponse } from "next/server";

/**
 * POST -> generate/regenerate API key for KB
 * - only owner can call
 * - stores SHA256 hash in metadata.apiKeyHash
 * - returns plaintext apiKey once in response
 */

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await auth();
    if (!user?.user?.id)
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const { id: kbId } = await params;

    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: { id: true, userId: true, metadata: true },
    });
    if (!kb)
      return NextResponse.json({ error: "KB not found" }, { status: 404 });
    if (kb.userId !== user.user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Generate secure random key (hex)
    const apiKey = crypto.randomBytes(32).toString("hex");
    const hashed = sha256Hex(apiKey);

    const existingMetadata =
      (kb.metadata as Record<string, unknown> | null) ?? {};

    const newMetadata = {
      ...existingMetadata,
      apiKeyHash: hashed,
      apiKeyCreatedAt: new Date().toISOString(),
    };

    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { metadata: newMetadata },
    });

    // Return the plaintext key once
    return NextResponse.json({ success: true, apiKey });
  } catch (err) {
    console.error("generate-api-key error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
