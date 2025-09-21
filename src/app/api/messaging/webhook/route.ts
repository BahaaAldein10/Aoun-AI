// app/api/messaging/webhook/route.ts
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal Meta (WhatsApp / Messenger) webhook handler.
 *
 * GET -> verification (hub.mode=subscribe, hub.verify_token, hub.challenge)
 * POST -> message events (verify signature if APP_SECRET present)
 *
 * This version supports verify tokens that encode integrationId and kbId:
 *  - integrationId::kbId::token  (new)
 *  - kbId::token                 (legacy)
 *  - token                       (older legacy: find by sha256(token))
 *
 * After successful verification with integrationId::kbId::token, we persist the mapping
 * by updating integration.credentials.kbId so POST can associate events to KBs.
 */

const APP_SECRET = process.env.FACEBOOK_CLIENT_SECRET || undefined; // optional but recommended

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function verifySignature(
  body: Buffer,
  signatureHeader?: string | null,
): boolean {
  if (!APP_SECRET) return true; // skip verification in dev (not recommended for prod)
  if (!signatureHeader) {
    console.warn("Missing x-hub-signature-256 header");
    return false;
  }

  const parts = signatureHeader.split("=");
  if (parts.length !== 2) {
    console.warn("Unexpected signature header format:", signatureHeader);
    return false;
  }
  const [algo, sigHex] = parts;
  if (algo !== "sha256") {
    console.warn("Unexpected signature algorithm:", algo);
    return false;
  }

  const expectedHmac = crypto
    .createHmac("sha256", APP_SECRET)
    .update(body)
    .digest("hex");

  let receivedBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    receivedBuf = Buffer.from(sigHex, "hex");
    expectedBuf = Buffer.from(expectedHmac, "hex");
  } catch (e) {
    console.warn("Signature not hex:", sigHex, e);
    return false;
  }

  if (receivedBuf.length !== expectedBuf.length) {
    console.warn("Signature length mismatch", {
      expectedLen: expectedBuf.length,
      receivedLen: receivedBuf.length,
    });
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = url.searchParams.get("hub.verify_token");

    if (!mode || !challenge || !verifyToken) {
      return NextResponse.json(
        { error: "Missing verification params" },
        { status: 400 },
      );
    }

    // Try to parse token formats:
    // 1) integrationId::kbId::random  (parts.length === 3)
    // 2) kbId::random                 (parts.length === 2)
    // 3) random                       (no ::)
    const parts = verifyToken.split("::");

    // Helper to check a KB's stored hashes for a match (supports multiple stored formats)
    const verifyKbToken = (
      kbMetadata: Record<string, unknown> | undefined,
      candidateHash: string,
      candidateFull?: string,
    ): boolean => {
      if (!kbMetadata) return false;
      // New style: metadata.verifyTokenMap[integrationId] stored per integration (we handle caller side)
      const map = kbMetadata.verifyTokenMap as
        | Record<string, string>
        | undefined;
      if (map) {
        // If caller used integrationId::kbId::token, map check is performed in caller code
      }
      // Legacy single-token fields:
      const stored = kbMetadata.verifyTokenHash as string | undefined;
      const storedV2 = kbMetadata.verifyTokenHashV2 as string | undefined;
      if (stored && stored === candidateHash) return true;
      if (storedV2 && candidateFull && storedV2 === sha256Hex(candidateFull))
        return true;
      return false;
    };

    if (parts.length === 3) {
      // new format: integrationId::kbId::token
      const [integrationId, kbId, tokenPart] = parts;
      // find KB
      const kb = await prisma.knowledgeBase.findUnique({
        where: { id: kbId },
        select: { id: true, userId: true, metadata: true },
      });
      if (!kb)
        return NextResponse.json({ error: "KB not found" }, { status: 404 });

      const metadata = kb.metadata as Record<string, unknown> | undefined;
      const storedMap =
        (metadata?.verifyTokenMap as Record<string, string> | undefined) ??
        undefined;
      const candidateFull = `${integrationId}::${kbId}::${tokenPart}`;
      const candidateFullHash = sha256Hex(candidateFull);
      const candidateTokenHash = sha256Hex(candidateFull); // we store the full plaintext hash in verifyTokenMap for new tokens

      // First try per-integration map
      const mapHash = storedMap?.[integrationId];
      const accept =
        (mapHash && mapHash === candidateFullHash) || // exact map match
        // Backwards compat: maybe metadata.verifyTokenHashV2 or verifyTokenHash exist
        (metadata &&
          (metadata.verifyTokenHashV2 === candidateFullHash ||
            metadata.verifyTokenHash === sha256Hex(tokenPart)));

      if (!accept) {
        return NextResponse.json({ error: "Invalid token" }, { status: 403 });
      }

      // persist mapping: set integration.credentials.kbId = kbId
      try {
        const integ = await prisma.integration.findUnique({
          where: { id: integrationId },
          select: { id: true, userId: true, credentials: true },
        });
        if (!integ) {
          console.warn(
            "Integration id from verify token not found:",
            integrationId,
          );
        } else if (integ.userId !== kb.userId) {
          // integrity check: integration must belong to same user as KB
          console.warn("Integration user mismatch for verification:", {
            integrationId,
            kbId,
          });
          return NextResponse.json(
            { error: "Invalid integration for KB" },
            { status: 403 },
          );
        } else {
          const existingCreds =
            (integ.credentials as Record<string, unknown>) ?? {};
          const merged = { ...existingCreds, kbId };
          await prisma.integration.update({
            where: { id: integ.id },
            data: { credentials: merged as Prisma.InputJsonValue },
          });
        }
      } catch (e) {
        console.warn("Failed to persist integration->kb mapping:", e);
      }

      return new NextResponse(challenge, { status: 200 });
    }

    if (parts.length === 2) {
      // legacy format: kbId::token
      const [kbId, tokenPart] = parts;
      const kb = await prisma.knowledgeBase.findUnique({
        where: { id: kbId },
        select: { id: true, metadata: true },
      });
      if (!kb)
        return NextResponse.json({ error: "KB not found" }, { status: 404 });

      const metadata = kb.metadata as Record<string, unknown> | undefined;
      const storedHash = metadata?.verifyTokenHash as string | undefined;
      const storedV2 = metadata?.verifyTokenHashV2 as string | undefined;

      const tokenHash = sha256Hex(tokenPart);
      const fullHash = sha256Hex(`${kbId}::${tokenPart}`);

      if (!(storedHash === tokenHash || storedV2 === fullHash)) {
        return NextResponse.json({ error: "Invalid token" }, { status: 403 });
      }

      return new NextResponse(challenge, { status: 200 });
    }

    // no :: - older format: find KB by sha256(token)
    const tokenHash = sha256Hex(verifyToken);
    const kbMatch = await prisma.knowledgeBase.findFirst({
      where: {
        metadata: { verifyTokenHash: tokenHash } as Record<string, unknown>,
      },
      select: { id: true },
    });

    if (!kbMatch) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    return new NextResponse(challenge, { status: 200 });
  } catch (err) {
    console.error("webhook GET error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.arrayBuffer();
    const bodyBuf = Buffer.from(raw);
    const signatureHeader = req.headers.get("x-hub-signature-256");
    if (!verifySignature(bodyBuf, signatureHeader)) {
      console.warn("Webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payloadText = bodyBuf.toString("utf8");
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      payload = null;
    }

    // Helper: extract phoneId / pageId / instagram id candidates from payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractIdsFromPayload = (p: any) => {
      const ids = {
        phoneId: null as string | null,
        pageId: null as string | null,
        instagramId: null as string | null,
      };

      const entries = Array.isArray(p?.entry) ? p.entry : [];
      for (const entry of entries) {
        const meta =
          entry?.changes?.[0]?.value?.metadata ||
          entry?.value?.metadata ||
          entry?.metadata;
        const phoneId =
          meta?.phone_number_id || meta?.phone_number || meta?.phone;
        if (phoneId) ids.phoneId = ids.phoneId || phoneId;

        // entry.id is often the page id for Messenger/IG webhooks
        const pageId = entry?.id || meta?.page_id || meta?.pageId;
        if (pageId) ids.pageId = ids.pageId || pageId;

        // Instagram may provide an instagram_business_account id inside value or metadata
        const igId =
          meta?.instagram_business_account_id ||
          entry?.changes?.[0]?.value?.metadata?.instagram_business_account_id ||
          entry?.value?.instagram_business_account?.id;
        if (igId) ids.instagramId = ids.instagramId || igId;

        // Also check changes.value for phone_number_id for WA
        const changePhone =
          entry?.changes?.[0]?.value?.phone_number_id ||
          entry?.changes?.[0]?.value?.metadata?.phone_number_id;
        if (changePhone) ids.phoneId = ids.phoneId || changePhone;
      }

      return ids;
    };

    const { phoneId, pageId, instagramId } = extractIdsFromPayload(payload);

    // try to find integration by stored credentials
    const tryFindIntegration = async (): Promise<{
      integrationId: string | null;
      userId: string | null;
    } | null> => {
      try {
        // Fetch enabled facebook/whatsapp/instagram integrations (narrow to providers you support)
        const candidates = await prisma.integration.findMany({
          where: {
            provider: {
              in: ["whatsapp", "messenger", "instagram"],
            },
            enabled: true,
          },
          select: { id: true, userId: true, credentials: true },
        });

        for (const integ of candidates) {
          const creds = integ.credentials as Record<string, unknown>;
          if (!creds) continue;
          if (
            phoneId &&
            (creds.phone_number_id === phoneId || creds.phoneNumber === phoneId)
          ) {
            return { integrationId: integ.id, userId: integ.userId };
          }
          if (pageId && (creds.page_id === pageId || creds.pageId === pageId)) {
            return { integrationId: integ.id, userId: integ.userId };
          }
          if (
            instagramId &&
            (creds.instagram_business_account_id === instagramId ||
              creds.instagramBusinessAccountId === instagramId)
          ) {
            return { integrationId: integ.id, userId: integ.userId };
          }
        }
      } catch (err) {
        console.warn("Error finding integration for message:", err);
      }
      return null;
    };

    const found = await tryFindIntegration();
    let kbId: string | null = null;

    if (found) {
      // Use explicit kbId stored in integration.credentials only (no unsafe fallback)
      const integ = await prisma.integration.findUnique({
        where: { id: found.integrationId! },
        select: { credentials: true, userId: true, id: true },
      });
      const creds = (integ?.credentials as Record<string, unknown>) || {};
      if (creds?.kbId) {
        kbId = creds.kbId as string;
      } else {
        // No kbId mapped to this integration — create audit log and skip attaching to a KB
        await prisma.auditLog.create({
          data: {
            action: "messaging_webhook_unmapped",
            meta: {
              integrationId: integ?.id,
              userId: integ?.userId,
              payloadSummary: {
                entryCount: (payload?.entry || []).length,
                phoneId,
                pageId,
                instagramId,
              },
            } as unknown as Prisma.InputJsonValue,
          },
        });

        kbId = null;
      }
    }

    // Extract a readable message text (depends on channel)
    let text = "";
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const msgs =
        entry?.changes?.[0]?.value?.messages ??
        entry?.messages ??
        entry?.changes?.[0]?.value?.messages;
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          if (m?.text?.body) text = text || m.text.body;
          if (m?.message) text = text || m.message;
          if (m?.type === "text" && m?.text) text = text || m.text;
        }
      }
    }

    // Persist lead if mapped to KB, otherwise write audit log
    try {
      if (kbId) {
        const userId = (
          await prisma.knowledgeBase.findUnique({
            where: { id: kbId },
            select: { userId: true },
          })
        )?.userId;
        await prisma.lead.create({
          data: {
            userId: userId!,
            name: "Inbound message",
            email: null,
            phone: undefined,
            status: "NEW",
            source: "messaging_webhook",
            capturedBy: kbId,
            meta: { payload, text } as unknown as Prisma.InputJsonValue,
          },
        });
      } else {
        // already logged unmapped above; keep behavior but avoid duplicate logs
      }
    } catch (dbErr) {
      console.warn("Failed to persist incoming message:", dbErr);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("webhook POST error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
