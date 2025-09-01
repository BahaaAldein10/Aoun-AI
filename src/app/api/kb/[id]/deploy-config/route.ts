// src/app/api/kb/[id]/deploy-config/route.ts
import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * GET -> return deploy metadata (allowedOrigins, isPublic)
 * POST -> update allowedOrigins (array) and isPublic boolean
 *
 * Owner-only actions.
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: kbId } = await params;
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: { id: true, metadata: true, userId: true },
    });
    if (!kb)
      return NextResponse.json({ error: "KB not found" }, { status: 404 });

    const metadata = (kb.metadata as Record<string, unknown>) ?? {};
    const allowedOrigins = Array.isArray(metadata.allowedOrigins)
      ? metadata.allowedOrigins
      : [];
    const hasVerifyToken = typeof metadata.verifyTokenHash === "string";

    // Determine if requester is owner so we can optionally return (masked) token or owner-only info
    const user = await auth().catch(() => null);
    const isOwner = !!user?.user?.id && user.user.id === kb.userId;

    return NextResponse.json({
      allowedOrigins,
      isPublic: false,
      hasVerifyToken,
      verifyTokenConfiguredAt: metadata.verifyTokenCreatedAt ?? null,
      // only for owner - we DO NOT return plaintext here (generate endpoint returns the plaintext once)
      isOwner,
    });
  } catch (err) {
    console.error("deploy-config GET error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
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
    const body = await req.json().catch(() => ({}));
    const { allowedOrigins = [] } = body as {
      allowedOrigins?: string[];
    };

    // Validate KB exists and is owned by user
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: { id: true, userId: true, metadata: true },
    });
    if (!kb)
      return NextResponse.json({ error: "KB not found" }, { status: 404 });
    if (kb.userId !== user.user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Validate allowedOrigins items are valid origins (scheme+host)
    const normalizedOrigins: string[] = [];
    for (const o of Array.isArray(allowedOrigins) ? allowedOrigins : []) {
      if (!o || typeof o !== "string") continue;
      try {
        const u = new URL(o);
        normalizedOrigins.push(u.origin);
      } catch {
        // try if user supplied origin w/o scheme, attempt to prepend https
        try {
          const u2 = new URL(`https://${o}`);
          normalizedOrigins.push(u2.origin);
        } catch {
          // invalid origin - skip
        }
      }
    }

    // Merge metadata
    const existingMetadata = (kb.metadata as KbMetadata) ?? {};
    const newMetadata = {
      ...existingMetadata,
      allowedOrigins: normalizedOrigins,
    };

    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { metadata: newMetadata },
    });

    return NextResponse.json({
      success: true,
      allowedOrigins: normalizedOrigins,
      isPublic: false,
    });
  } catch (err) {
    console.error("deploy-config POST error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
