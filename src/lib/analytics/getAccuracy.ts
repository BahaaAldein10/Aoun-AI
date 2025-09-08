/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/analytics/getAccuracy.ts
import { prisma } from "@/lib/prisma";

function computeAccuracy(
  correct: number,
  negative: number,
  fallback: number,
  total: number,
) {
  const accuracySimple =
    Math.round((correct / Math.max(1, total)) * 100 * 100) / 100; // two decimals
  const accuracyFallbackAware =
    Math.round(
      (correct / Math.max(1, correct + negative + fallback)) * 100 * 100,
    ) / 100;
  const accuracyStrict =
    Math.round((correct / Math.max(1, correct + negative)) * 100 * 100) / 100;

  return { accuracySimple, accuracyFallbackAware, accuracyStrict };
}

/**
 * Accuracy for a specific bot.
 * - If startDay & endDay provided → computes in that date range
 * - If no dates provided → computes lifetime totals
 */
export async function getBotAccuracy(
  userId: string,
  botId: string,
  startDay?: string,
  endDay?: string,
) {
  const where: any = { userId, botId };
  if (startDay && endDay) {
    where.day = { gte: startDay, lte: endDay };
  }

  const sums = await prisma.aggregatedUsage.aggregate({
    where,
    _sum: {
      interactions: true,
      correctResponses: true,
      negativeResponses: true,
      fallbackCount: true,
    },
  });

  const total = sums._sum.interactions ?? 0;
  const correct = sums._sum.correctResponses ?? 0;
  const negative = sums._sum.negativeResponses ?? 0;
  const fallback = sums._sum.fallbackCount ?? 0;

  return {
    total,
    correct,
    negative,
    fallback,
    ...computeAccuracy(correct, negative, fallback, total),
  };
}

/**
 * Accuracy across ALL bots for a user.
 * - If startDay & endDay provided → computes in that date range
 * - If no dates provided → computes lifetime totals
 */
export async function getOverallAccuracy(
  userId: string,
  startDay?: string,
  endDay?: string,
) {
  const where: any = { userId };
  if (startDay && endDay) {
    where.day = { gte: startDay, lte: endDay };
  }

  const sums = await prisma.aggregatedUsage.aggregate({
    where,
    _sum: {
      interactions: true,
      correctResponses: true,
      negativeResponses: true,
      fallbackCount: true,
    },
  });

  const total = sums._sum.interactions ?? 0;
  const correct = sums._sum.correctResponses ?? 0;
  const negative = sums._sum.negativeResponses ?? 0;
  const fallback = sums._sum.fallbackCount ?? 0;

  return {
    total,
    correct,
    negative,
    fallback,
    ...computeAccuracy(correct, negative, fallback, total),
  };
}
