// lib/analytics/logInteraction.ts
import { prisma } from "@/lib/prisma";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { randomUUID } from "crypto";

export type Channel = "website" | "whatsapp" | "facebook" | "voice";

type LogParams = {
  userId: string;
  botId: string;
  channel?: Channel;
  interactions?: number; // usually 1
  minutes?: number; // 0 for text chat, seconds or minutes for calls
  isCorrect?: boolean; // thumbs-up or auto-detected correct
  isNegative?: boolean; // thumbs-down
  isFallback?: boolean; // bot returned fallback / handed off
  eventId?: string; // optional idempotency key
  meta?: Record<string, unknown>; // additional metadata to store in usage record
};

/**
 * Simple synchronous helper: creates Usage audit row and upserts aggregated counters.
 * Call this from any server-side handler (API route, server action, etc).
 */
export async function logInteraction(params: LogParams) {
  const {
    userId,
    botId,
    channel = "website",
    interactions = 1,
    minutes = 0,
    isCorrect = false,
    isNegative = false,
    isFallback = false,
    eventId = randomUUID(),
    meta = {},
  } = params;

  const day = new Date().toISOString().slice(0, 10);

  // Merge base metadata with additional meta
  const combinedMeta = {
    channel,
    isCorrect,
    isNegative,
    isFallback,
    ...meta, // spread additional metadata from the caller
  };

  // 1) Create audit Usage row (idempotent via unique eventId)
  try {
    await prisma.usage.create({
      data: {
        eventId,
        userId,
        botId,
        date: new Date(),
        interactions,
        minutes,
        meta: combinedMeta,
      },
    });
  } catch (err: unknown) {
    // Unique constraint (already logged) -> don't double count
    if (err instanceof PrismaClientKnownRequestError && err?.code === "P2002") {
      // duplicate event: silently return
      return { ok: true, reason: "duplicate_event" };
    }
    throw err;
  }

  // 2) Upsert per-bot daily aggregated counters (atomic increments)
  await prisma.aggregatedUsage.upsert({
    where: { userId_botId_day: { userId, botId, day } },
    update: {
      interactions: { increment: interactions },
      minutes: { increment: minutes },
      website: { increment: channel === "website" ? interactions : 0 },
      whatsapp: { increment: channel === "whatsapp" ? interactions : 0 },
      facebook: { increment: channel === "facebook" ? interactions : 0 },
      voice: { increment: channel === "voice" ? interactions : 0 },
      correctResponses: { increment: isCorrect ? 1 : 0 },
      negativeResponses: { increment: isNegative ? 1 : 0 },
      fallbackCount: { increment: isFallback ? 1 : 0 },
    },
    create: {
      userId,
      botId,
      day,
      interactions,
      minutes: minutes,
      website: channel === "website" ? interactions : 0,
      whatsapp: channel === "whatsapp" ? interactions : 0,
      facebook: channel === "facebook" ? interactions : 0,
      voice: channel === "voice" ? interactions : 0,
      correctResponses: isCorrect ? 1 : 0,
      negativeResponses: isNegative ? 1 : 0,
      fallbackCount: isFallback ? 1 : 0,
    },
  });

  return { ok: true };
}
