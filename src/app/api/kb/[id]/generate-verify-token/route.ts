// app/api/kb/[id]/generate-verify-token/route.ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { NextResponse } from "next/server";

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

    // Generate secure random token (e.g., 20 bytes = 40 hex chars)
    const token = crypto.randomBytes(20).toString("hex");
    const hashed = sha256Hex(token);

    const metadata = (kb.metadata as Record<string, unknown>) ?? {};
    metadata.verifyTokenHash = hashed;
    metadata.verifyTokenCreatedAt = new Date().toISOString();

    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { metadata: metadata as unknown as Prisma.InputJsonValue },
    });

    // Return the plaintext token once — instruct user to copy it into Meta Dev Portal as Verify Token.
    return NextResponse.json({ success: true, verifyToken: token });
  } catch (err) {
    console.error("generate-verify-token error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
