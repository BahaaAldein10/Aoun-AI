// app/api/messaging/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Minimal Meta (WhatsApp / Messenger) webhook handler.
 *
 * GET -> verification (hub.mode=subscribe, hub.verify_token, hub.challenge)
 * POST -> message events (verify signature if META_APP_SECRET present)
 *
 * Security and mapping:
 * - KBs should store a verify token in knowledgeBase.metadata.verifyTokenHash (sha256).
 * - For mapping incoming messages to KB: you should store the pageId / phoneNumber
 *   in metadata.messaging.pageId or metadata.messaging.phoneNumber and we'll try to find KB.
 * - This handler is intentionally minimal: it logs incoming events and creates a Lead if mapping exists.
 */

const APP_SECRET = process.env.FACEBOOK_CLIENT_SECRET || undefined; // optional but recommended

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function verifySignature(
  body: Buffer,
  signatureHeader?: string | null,
): boolean {
  if (!APP_SECRET) return true; // no secret configured -> skip verification (not recommended for prod)
  if (!signatureHeader) return false;
  // header like: sha256=...
  const parts = (signatureHeader || "").split("=");
  if (parts.length !== 2) return false;
  const algo = parts[0];
  const sig = parts[1];
  if (algo !== "sha256") return false;

  const hmac = crypto
    .createHmac("sha256", APP_SECRET)
    .update(body)
    .digest("hex");
  // constant time compare
  return crypto.timingSafeEqual(
    Buffer.from(hmac, "hex"),
    Buffer.from(sig, "hex"),
  );
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = url.searchParams.get("hub.verify_token");

    // must include challenge and mode
    if (!mode || !challenge || !verifyToken) {
      return NextResponse.json(
        { error: "Missing verification params" },
        { status: 400 },
      );
    }

    // We expect the verify token to match one of the KBs' metadata.verifyTokenHash.
    // If you have multiple KBs, you might need a different verification URL per KB (e.g. include kbId param).
    // Simple approach: require the `verify_token` be in form "<kbId>::<token>" so we can map to KB:
    // e.g. when generating token you provide "verifyToken" and instruct owner to set webhook using that token
    // Here we accept two formats:
    //  1) "kbId::token" -> we validate token for that KB
    //  2) token only -> search KB that has that hash (less ideal if duplicates)

    let kbId: string | null = null;
    let token = verifyToken;

    if (verifyToken.includes("::")) {
      const [kid, t] = verifyToken.split("::", 2);
      kbId = kid;
      token = t;
    }

    if (kbId) {
      const kb = await prisma.knowledgeBase.findUnique({
        where: { id: kbId },
        select: { metadata: true },
      });
      if (!kb)
        return NextResponse.json({ error: "KB not found" }, { status: 404 });

      const storedHash = (kb.metadata as Record<string, unknown>)?.verifyTokenHash as
        | string
        | undefined;
      if (!storedHash)
        return NextResponse.json(
          { error: "Verify token not configured" },
          { status: 403 },
        );

      const incomingHash = sha256Hex(token);
      if (incomingHash !== storedHash) {
        return NextResponse.json({ error: "Invalid token" }, { status: 403 });
      }

      // success: return challenge
      return new NextResponse(challenge, { status: 200 });
    }

    // fallback: try find KB by matching token hash
    const incomingHash = sha256Hex(token);
    const kbMatch = await prisma.knowledgeBase.findFirst({
      where: {
        metadata: {
          path: "$.verifyTokenHash",
          equals: incomingHash,
        } as Record<string, unknown>,
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

    // Basic routing: attempt to find KB by metadata.messaging.pageId or phoneNumber
    // Meta webhook body commonly includes 'entry[].changes[].value' with 'metadata' and 'messages'
    // Example: recipient id may be in payload.entry[0].id or payload.entry[0].changes[0].value.metadata.phone_number_id
    const tryFindKb = async (): Promise<string | null> => {
      try {
        // attempt multiple known fields
        const entries = Array.isArray(payload?.entry) ? payload.entry : [];
        for (const entry of entries) {
          const meta =
            entry?.changes?.[0]?.value?.metadata || entry?.value?.metadata;
          // phone_number_id or phone_number or phone
          const phoneId =
            meta?.phone_number_id || meta?.phone_number || meta?.phone;
          const pageId =
            entry?.id || meta?.phone_number_id || meta?.phone_number;
          if (pageId) {
            const match = await prisma.knowledgeBase.findFirst({
              where: {
                metadata: {
                  path: "$.messaging.pageId",
                  equals: String(pageId),
                } as Record<string, unknown>,
              },
              select: { id: true },
            });
            if (match) return match.id;
          }
          if (phoneId) {
            const match = await prisma.knowledgeBase.findFirst({
              where: {
                metadata: {
                  path: "$.messaging.phoneNumber",
                  equals: String(phoneId),
                } as Record<string, unknown>,
              },
              select: { id: true },
            });
            if (match) return match.id;
          }
        }

        // As final fallback, try to match verify token in the payload if present (rare)
        // (Not implemented here to avoid exposing tokens)
      } catch (err) {
        console.warn("Error finding KB for message:", err);
      }
      return null;
    };

    const kbId = await tryFindKb();

    // Create a lightweight log/lead so owner can see inbound messages if mapped
    try {
      // Extract a readable message text (depends on channel)
      let text = "";
      // WhatsApp style: payload.entry[].changes[].value.messages[].text.body
      const entries = Array.isArray(payload?.entry) ? payload.entry : [];
      for (const entry of entries) {
        const msgs =
          entry?.changes?.[0]?.value?.messages ??
          entry?.changes?.[0]?.value?.messages ??
          entry?.messages;
        if (Array.isArray(msgs)) {
          for (const m of msgs) {
            if (m?.text?.body) text = text || m.text.body;
            if (m?.message) text = text || m.message;
            if (m?.type === "text" && m?.text) text = text || m.text;
          }
        }
      }

      // if mapped to a KB, store a Lead record with source metadata
      if (kbId) {
        await prisma.lead.create({
          data: {
            userId:
              (
                await prisma.knowledgeBase.findUnique({
                  where: { id: kbId },
                  select: { userId: true },
                })
              )?.userId as string,
            name: "Inbound message",
            email: null,
            phone: undefined,
            status: "NEW",
            source: "messaging_webhook",
            capturedBy: kbId,
            meta: {
              payload: payload,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      } else {
        // fallback: write an audit log
        await prisma.auditLog.create({
          data: {
            action: "messaging_webhook_unmapped",
            meta: {
              payloadSummary: { entryCount: (payload?.entry || []).length },
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
    } catch (dbErr) {
      console.warn("Failed to persist incoming message:", dbErr);
    }

    // Respond with 200 to acknowledge receipt
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("webhook POST error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
