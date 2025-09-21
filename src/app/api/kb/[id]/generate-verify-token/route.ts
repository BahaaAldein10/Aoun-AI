// app/api/kb/[id]/generate-verify-token/route.ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { NextResponse } from "next/server";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

type GenerateBody = {
  integrationId?: string;
  integrationIds?: string[]; // allow multiple
};

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

    // SAFE body parsing: handle empty body or invalid JSON gracefully
    let body: GenerateBody = {};
    try {
      const text = await req.text();
      if (text && text.trim().length > 0) {
        body = JSON.parse(text) as GenerateBody;
      } else {
        body = {};
      }
    } catch (parseErr) {
      // If there's invalid JSON, treat as empty body (legacy flow).
      console.warn(
        "generate-verify-token: failed to parse JSON body, falling back to empty body",
        parseErr,
      );
      body = {};
    }

    const integrationIds =
      body.integrationIds ?? (body.integrationId ? [body.integrationId] : []);

    // If no integrationIds provided => generate legacy token (kbId::random)
    if (integrationIds.length === 0) {
      const random = crypto.randomBytes(20).toString("hex");
      const plaintext = `${kbId}::${random}`; // legacy kbId::token format
      const hashed = sha256Hex(random); // backwards compat: previously stored sha256(token)
      // Also store v2 full plaintext hash for future-proofing
      const metadata = (kb.metadata as Record<string, unknown>) ?? {};
      metadata.verifyTokenHash = hashed;
      metadata.verifyTokenHashV2 = sha256Hex(plaintext);
      metadata.verifyTokenCreatedAt = new Date().toISOString();

      await prisma.knowledgeBase.update({
        where: { id: kbId },
        data: { metadata: metadata as unknown as Prisma.InputJsonValue },
      });

      return NextResponse.json({
        success: true,
        tokens: [{ integrationId: null, token: plaintext }],
      });
    }

    // Generate one token per integration
    const tokens: { integrationId: string; token: string }[] = [];

    for (const integrationId of integrationIds) {
      // verify that the integration belongs to this user
      const integ = await prisma.integration.findUnique({
        where: { id: integrationId },
        select: { id: true, userId: true },
      });
      if (!integ || integ.userId !== user.user.id) {
        // skip invalid integration ids (don't fail whole batch)
        console.warn(
          "generate-verify-token: skipping invalid integrationId",
          integrationId,
        );
        continue;
      }

      const random = crypto.randomBytes(20).toString("hex");
      const plaintext = `${integrationId}::${kbId}::${random}`;
      const hashed = sha256Hex(plaintext); // store full plaintext hash (new format)

      // Store hashed in KB metadata (merge with existing map if present)
      const metadata = (kb.metadata as Record<string, unknown>) ?? {};
      const tokenMap =
        (metadata.verifyTokenMap as Record<string, string>) ?? {};
      tokenMap[integrationId] = hashed;
      metadata.verifyTokenMap = tokenMap;
      metadata.verifyTokenCreatedAt = new Date().toISOString();

      await prisma.knowledgeBase.update({
        where: { id: kbId },
        data: { metadata: metadata as unknown as Prisma.InputJsonValue },
      });

      tokens.push({ integrationId, token: plaintext });
    }

    return NextResponse.json({ success: true, tokens });
  } catch (err) {
    console.error("generate-verify-token error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
