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

  // Validate inputs
  if (!userId || !botId) {
    console.error("logInteraction: userId and botId are required", {
      userId,
      botId,
    });
    return { ok: false, reason: "missing_required_params" };
  }

  try {
    // 1) Create audit Usage row (with explicit error handling)
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

    console.log(`Usage logged: ${channel} interaction for bot ${botId}`);
  } catch (err: unknown) {
    // Handle unique constraint violations gracefully
    if (err instanceof PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        // Duplicate eventId - this is expected for idempotency
        console.log(`Duplicate event ignored: ${eventId}`);
        return { ok: true, reason: "duplicate_event" };
      }

      // Other Prisma errors
      console.error("Prisma error in usage creation:", {
        code: err.code,
        message: err.message,
        meta: err.meta,
      });
      return { ok: false, reason: "database_error", error: err.message };
    }

    // Unknown errors
    console.error("Unknown error in usage creation:", err);
    return { ok: false, reason: "unknown_error", error: String(err) };
  }

  try {
    // 2) Upsert per-bot daily aggregated counters (atomic increments)
    await prisma.aggregatedUsage.upsert({
      where: {
        userId_botId_day: { userId, botId, day },
      },
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

    console.log(`Aggregated usage updated for bot ${botId} on ${day}`);
    return { ok: true };
  } catch (err: unknown) {
    if (err instanceof PrismaClientKnownRequestError) {
      console.error("Prisma error in aggregated usage:", {
        code: err.code,
        message: err.message,
        userId,
        botId,
        day,
      });
    } else {
      console.error("Unknown error in aggregated usage:", err);
    }

    // Even if aggregated usage fails, the main usage record was created
    return { ok: true, warning: "aggregated_usage_failed" };
  }
}
