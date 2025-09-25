// app/api/kb/[id]/generate-verify-token/route.ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { NextResponse } from "next/server";

/**
 * Utility: compute sha256 hex digest of input (utf8)
 */
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
    if (!user?.user?.id) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { id: kbId } = await params;

    // ensure KB exists and belongs to caller
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: { id: true, userId: true, metadata: true },
    });
    if (!kb) {
      return NextResponse.json({ error: "KB not found" }, { status: 404 });
    }
    if (kb.userId !== user.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    // If no integrationIds provided => legacy token (kbId::random)
    if (integrationIds.length === 0) {
      const random = crypto.randomBytes(20).toString("hex");
      const plaintext = `${kbId}::${random}`; // legacy kbId::token format
      // backwards compat: previously stored sha256(token) (where token was the random part)
      const hashed = sha256Hex(random);
      // Also store v2 full plaintext hash for future-proofing
      const metadata = (kb.metadata as Record<string, unknown>) ?? {};

      // Merge (don't clobber) existing metadata fields
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

    // Otherwise, generate one token per integrationId (validated)
    const tokens: { integrationId: string; token: string }[] = [];

    // Load existing metadata and token map (we'll update once at the end)
    const existingMetadata = (kb.metadata as Record<string, unknown>) ?? {};
    const existingTokenMap =
      (existingMetadata.verifyTokenMap as Record<string, string>) ?? {};

    // We'll produce new entries into newTokenMap and then merge
    const newTokenMap: Record<string, string> = { ...existingTokenMap };

    for (const integrationId of integrationIds) {
      // verify that the integration belongs to this user
      const integ = await prisma.integration.findUnique({
        where: { id: integrationId },
        select: { id: true, userId: true },
      });

      if (!integ || integ.userId !== user.user.id) {
        // skip invalid integration ids (don't fail whole batch)
        console.warn(
          "generate-verify-token: skipping invalid or unauthorized integrationId",
          integrationId,
        );
        continue;
      }

      const random = crypto.randomBytes(20).toString("hex");
      const plaintext = `${integrationId}::${kbId}::${random}`;
      const hashed = sha256Hex(plaintext); // store full plaintext hash (new format)

      // put into in-memory map
      newTokenMap[integrationId] = hashed;

      // push token to return to caller (plaintext so owner can paste into Meta console)
      tokens.push({ integrationId, token: plaintext });
    }

    // Persist once (merge existing metadata with new token map and metadata fields)
    if (Object.keys(newTokenMap).length > 0) {
      const mergedMetadata = {
        ...existingMetadata,
        verifyTokenMap: newTokenMap,
        verifyTokenCreatedAt: new Date().toISOString(),
      } as Record<string, unknown>;

      await prisma.knowledgeBase.update({
        where: { id: kbId },
        data: { metadata: mergedMetadata as unknown as Prisma.InputJsonValue },
      });
    } else {
      // nothing generated (e.g., all integrationIds invalid). Return success:false
      return NextResponse.json(
        {
          success: false,
          error: "No valid integration IDs provided or authorized",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, tokens });
  } catch (err) {
    console.error("generate-verify-token error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
