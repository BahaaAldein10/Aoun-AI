/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/messaging/webhook/route.ts
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

// Import AI services
import { Channel, logInteraction } from "@/lib/analytics/logInteraction";
import { createEmbeddings } from "@/lib/embedding-service";

const APP_SECRET = process.env.FACEBOOK_CLIENT_SECRET || undefined;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";

// WhatsApp/Facebook (Messenger & Instagram) sending functions
// Use consistent API version with your integration setup
const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || "v16.0";

async function sendWhatsAppMessage(
  phoneNumberId: string,
  to: string,
  message: string,
) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn("WhatsApp access token not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to,
          type: "text",
          text: { body: message },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("WhatsApp API error:", errorData);
    }

    return response.ok;
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error);
    return false;
  }
}

async function sendMessengerMessage(
  pageId: string,
  recipientId: string,
  message: string,
) {
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn("Facebook page access token not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Messenger API error:", errorData);
    }

    return response.ok;
  } catch (error) {
    console.error("Failed to send Messenger message:", error);
    return false;
  }
}

async function sendInstagramMessage(
  instagramAccountId: string,
  recipientId: string,
  message: string,
) {
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn("Facebook page access token not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${instagramAccountId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Instagram API error:", errorData);
    }

    return response.ok;
  } catch (error) {
    console.error("Failed to send Instagram message:", error);
    return false;
  }
}

// AI Response Generation
async function generateAIResponse(
  kbId: string,
  message: string,
  userId: string,
  botId: string,
  channel: Channel = "whatsapp",
): Promise<{ response: string; sources: any[] }> {
  try {
    // Load knowledge base
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: { id: true, title: true, metadata: true, userId: true },
    });

    if (!kb) {
      return {
        response:
          "I'm sorry, I'm not available right now. Please try again later.",
        sources: [],
      };
    }

    const metadata = (kb.metadata as Record<string, unknown>) ?? {};

    // Create embeddings for the message
    const embeddings = await createEmbeddings([message]);
    const queryVec = embeddings[0];

    let retrieved: Array<{ text: string; similarity: number; metadata: any }> =
      [];

    if (queryVec) {
      // Use Upstash Vector for similarity search
      const { default: upstashVector } = await import("@/lib/upstash-vector");

      const results = await upstashVector.query(queryVec, {
        topK: 3, // Limit for messaging to keep responses concise
        includeMetadata: true,
        includeVectors: false,
        filter: `kbId = '${kbId.replace(/'/g, "\\'")}'`,
      });

      retrieved = (results ?? []).map((result: any) => {
        const md = result.metadata as Record<string, unknown> | undefined;
        const text = (md?.text as string) ?? "";
        return {
          text,
          similarity: result.score ?? 0,
          metadata: md ?? {},
        };
      });
    }

    // Build context from retrieved chunks
    const sourceBlocks = retrieved.map((r, i) => {
      return `SOURCE ${i + 1}:\n${r.text}`;
    });

    // Create prompt with platform-specific instructions
    const basePersonality =
      (metadata?.personality as string) ||
      "You are a helpful assistant. Keep responses concise and friendly for messaging.";

    let platformInstructions = "";
    if (channel === "facebook") {
      platformInstructions =
        " Always respond in a conversational tone suitable for Facebook Messenger and Instagram DMs. Keep responses under 300 characters when possible.";
    } else if (channel === "whatsapp") {
      platformInstructions =
        " Always respond in a conversational tone suitable for WhatsApp. Keep responses under 300 characters when possible.";
    }

    const systemInstruction = `${basePersonality}${platformInstructions}`;

    const retrievalText = sourceBlocks.length
      ? `Use the following information to answer the user's question:\n\n${sourceBlocks.join("\n\n---\n\n")}\n\n`
      : "";

    const prompt = `${systemInstruction}\n\n${retrievalText}User: ${message.trim()}\nAssistant:`;

    // Call OpenAI
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200, // Keep responses concise for messaging
      temperature: 0.1,
    });

    const responseText =
      completion.choices[0]?.message?.content?.trim() ||
      "I'm sorry, I couldn't process your message right now.";

    // Log interaction
    const fallbackRegex =
      /\b(i (do not|don't) know|cannot find|no information|sorry,|unable to)/i;
    const isFallback = !retrieved.length || fallbackRegex.test(responseText);
    const isCorrect =
      retrieved.length > 0 && responseText.length > 10 && !isFallback;

    await logInteraction({
      userId: userId,
      botId: botId,
      channel: channel,
      interactions: 1,
      minutes: 0,
      isCorrect,
      isNegative: false,
      isFallback,
      meta: {
        messageType: "auto_reply",
        retrievedCount: retrieved.length,
        promptSize: prompt.length,
        originalMessage: message,
      },
    });

    return {
      response: responseText,
      sources: retrieved.map((r, i) => ({
        index: i + 1,
        similarity: r.similarity,
        metadata: r.metadata,
      })),
    };
  } catch (error) {
    console.error("AI response generation failed:", error);
    return {
      response:
        "I'm experiencing technical difficulties. Please try again later.",
      sources: [],
    };
  }
}

// Existing verification functions...
function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function verifySignature(
  body: Buffer,
  signatureHeader?: string | null,
): boolean {
  if (!APP_SECRET) return true;
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
    console.warn("Signature length mismatch");
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

    const parts = verifyToken.split("::");

    if (parts.length === 3) {
      const [integrationId, kbId, tokenPart] = parts;
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

      const mapHash = storedMap?.[integrationId];
      const accept =
        (mapHash && mapHash === candidateFullHash) ||
        (metadata &&
          (metadata.verifyTokenHashV2 === candidateFullHash ||
            metadata.verifyTokenHash === sha256Hex(tokenPart)));

      if (!accept) {
        return NextResponse.json({ error: "Invalid token" }, { status: 403 });
      }

      try {
        const integ = await prisma.integration.findUnique({
          where: { id: integrationId },
          select: { id: true, userId: true, credentials: true },
        });
        if (integ && integ.userId === kb.userId) {
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

    // Handle legacy formats...
    if (parts.length === 2) {
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

// Enhanced POST with AI auto-reply
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

        const pageId = entry?.id || meta?.page_id || meta?.pageId;
        if (pageId) ids.pageId = ids.pageId || pageId;

        const igId =
          meta?.instagram_business_account_id ||
          entry?.changes?.[0]?.value?.metadata?.instagram_business_account_id;
        if (igId) ids.instagramId = ids.instagramId || igId;

        const changePhone = entry?.changes?.[0]?.value?.phone_number_id;
        if (changePhone) ids.phoneId = ids.phoneId || changePhone;
      }

      return ids;
    };

    // Extract message details for auto-reply - Enhanced for Instagram
    const extractMessageDetails = (p: any) => {
      const entries = Array.isArray(p?.entry) ? p.entry : [];
      for (const entry of entries) {
        // WhatsApp messages
        const msgs =
          entry?.changes?.[0]?.value?.messages ?? entry?.messages ?? [];
        if (Array.isArray(msgs)) {
          for (const m of msgs) {
            if (m?.text?.body || m?.message) {
              return {
                text: m?.text?.body || m?.message || "",
                senderId: m?.from || m?.sender?.id || "",
                messageId: m?.id || "",
                timestamp: m?.timestamp || Date.now(),
                platform: "whatsapp",
              };
            }
          }
        }

        // Messenger format
        const messaging = entry?.messaging?.[0];
        if (messaging?.message?.text) {
          return {
            text: messaging.message.text,
            senderId: messaging.sender.id,
            messageId: messaging.message.mid || "",
            timestamp: messaging.timestamp || Date.now(),
            platform: "messenger",
          };
        }

        // Instagram Direct Messages
        const changes = entry?.changes || [];
        for (const change of changes) {
          if (change?.field === "messages" && change?.value?.messages) {
            const igMessages = change.value.messages;
            for (const igMsg of igMessages) {
              if (igMsg?.message?.text) {
                return {
                  text: igMsg.message.text,
                  senderId: igMsg.from || "",
                  messageId: igMsg.id || "",
                  timestamp: igMsg.timestamp || Date.now(),
                  platform: "instagram",
                };
              }
            }
          }
        }
      }
      return null;
    };

    const { phoneId, pageId, instagramId } = extractIdsFromPayload(payload);
    const messageDetails = extractMessageDetails(payload);

    // Find integration and KB - Enhanced to properly map Facebook platforms
    const found = await (async () => {
      try {
        const candidates = await prisma.integration.findMany({
          where: {
            provider: {
              in: ["whatsapp", "messenger", "instagram"],
            },
            enabled: true,
          },
          select: { id: true, userId: true, credentials: true, provider: true },
        });

        for (const integ of candidates) {
          const creds = integ.credentials as Record<string, unknown>;
          if (!creds) continue;

          // WhatsApp matching
          if (
            phoneId &&
            (creds.phone_number_id === phoneId || creds.phoneNumber === phoneId)
          ) {
            return {
              integrationId: integ.id,
              userId: integ.userId,
              provider: integ.provider,
              channel: "whatsapp" as Channel,
              platformId: phoneId,
            };
          }

          // Messenger matching - map to facebook channel
          if (pageId && (creds.page_id === pageId || creds.pageId === pageId)) {
            return {
              integrationId: integ.id,
              userId: integ.userId,
              provider: integ.provider,
              channel: "facebook" as Channel,
              platformId: pageId,
              subPlatform: "messenger",
            };
          }

          // Instagram matching - map to facebook channel
          if (
            instagramId &&
            (creds.instagram_business_account_id === instagramId ||
              creds.instagramBusinessAccountId === instagramId)
          ) {
            return {
              integrationId: integ.id,
              userId: integ.userId,
              provider: integ.provider,
              channel: "facebook" as Channel,
              platformId: instagramId,
              subPlatform: "instagram",
            };
          }
        }
      } catch (err) {
        console.warn("Error finding integration for message:", err);
      }
      return null;
    })();

    let kbId: string | null = null;
    let botId: string | null = null;
    let channel: Channel = "whatsapp";

    if (found) {
      const integ = await prisma.integration.findUnique({
        where: { id: found.integrationId! },
        select: { credentials: true, userId: true, id: true, provider: true },
      });
      const creds = (integ?.credentials as Record<string, unknown>) || {};
      kbId = (creds?.kbId as string) || null;
      channel = found.channel;

      // Get bot ID from knowledge base
      if (kbId) {
        const kb = await prisma.knowledgeBase.findUnique({
          where: { id: kbId },
          select: { bot: { select: { id: true } } },
        });
        botId = kb?.bot?.id || null;
      }
    }

    // Extract message text
    let text = "";
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const msgs =
        entry?.changes?.[0]?.value?.messages ?? entry?.messages ?? [];
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          if (m?.text?.body) text = text || m.text.body;
          if (m?.message) text = text || m.message;
          if (m?.type === "text" && m?.text) text = text || m.text;
        }
      }

      // Messenger format
      const messaging = entry?.messaging?.[0];
      if (messaging?.message?.text) {
        text = messaging.message.text;
      }

      // Instagram format
      const changes = entry?.changes || [];
      for (const change of changes) {
        if (change?.field === "messages" && change?.value?.messages) {
          const igMessages = change.value.messages;
          for (const igMsg of igMessages) {
            if (igMsg?.message?.text) {
              text = igMsg.message.text;
              break;
            }
          }
        }
      }
    }

    // Generate AI response if we have a KB and message
    if (kbId && botId && messageDetails && messageDetails.text.trim()) {
      try {
        const { response } = await generateAIResponse(
          kbId,
          messageDetails.text,
          found!.userId,
          botId,
          channel,
        );

        // Send response based on platform
        let messageSent = false;

        if (
          found!.provider === "whatsapp" &&
          phoneId &&
          messageDetails.senderId
        ) {
          messageSent = await sendWhatsAppMessage(
            phoneId,
            messageDetails.senderId,
            response,
          );
        } else if (
          (found!.provider === "messenger" ||
            found!.subPlatform === "messenger") &&
          pageId &&
          messageDetails.senderId
        ) {
          messageSent = await sendMessengerMessage(
            pageId,
            messageDetails.senderId,
            response,
          );
        } else if (
          (found!.provider === "instagram" ||
            found!.subPlatform === "instagram") &&
          instagramId &&
          messageDetails.senderId
        ) {
          messageSent = await sendInstagramMessage(
            instagramId,
            messageDetails.senderId,
            response,
          );
        }

        if (messageSent) {
          const platformName = found!.subPlatform || found!.provider;
          console.log(
            `Auto-reply sent via ${platformName} to ${messageDetails.senderId}`,
          );
        }
      } catch (error) {
        console.error("Failed to generate or send AI response:", error);
      }
    }

    // Persist lead (existing logic) - Enhanced with platform info
    try {
      if (kbId) {
        const userId = (
          await prisma.knowledgeBase.findUnique({
            where: { id: kbId },
            select: { userId: true },
          })
        )?.userId;

        const leadSource = found?.subPlatform
          ? `${found.subPlatform}_messaging_webhook`
          : "messaging_webhook";

        await prisma.lead.create({
          data: {
            userId: userId!,
            name: "Inbound message",
            email: null,
            phone: messageDetails?.senderId || undefined,
            status: "NEW",
            source: leadSource,
            capturedBy: kbId,
            meta: {
              payload,
              text,
              autoReplySent: !!messageDetails,
              messageDetails,
              platform: found?.subPlatform || found?.provider,
              channel: found?.channel,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      } else {
        await prisma.auditLog.create({
          data: {
            action: "messaging_webhook_unmapped",
            meta: {
              integrationId: found?.integrationId,
              userId: found?.userId,
              payloadSummary: {
                entryCount: (payload?.entry || []).length,
                phoneId,
                pageId,
                instagramId,
                hasMessage: !!messageDetails,
                platform: messageDetails?.platform,
              },
            } as unknown as Prisma.InputJsonValue,
          },
        });
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
