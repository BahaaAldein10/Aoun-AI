// src/lib/actions/userUsage.ts
"use server";

import { getOverallAccuracy } from "@/lib/analytics/getAccuracy";
import { prisma } from "@/lib/prisma";
import { PlanName, SubscriptionStatus } from "@prisma/client";

export type SeriesPoint = { date: string; value: number };
export type UserUsage = {
  totalInteractions?: number;
  botCount: number;
  botLimit: number;
  planName?: string;
  minutesUsed: number;
  monthlyQuota: number;
  responseAccuracy?: number | string;
  interactionsSeries?: SeriesPoint[];
  channelCounts?: {
    website?: number;
    whatsapp?: number;
    facebook?: number;
    voice?: number;
  };
};
export type channelCounts = {
  website?: number;
  whatsapp?: number;
  facebook?: number;
  voice?: number;
};

function formatDay(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function getUserUsage(userId: string): Promise<UserUsage | null> {
  if (!userId) return null;

  const now = new Date();

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthStr = formatDay(startOfMonth);

  const start7Days = new Date(now);
  start7Days.setDate(now.getDate() - 6); // last 7 days including today
  const start7DaysStr = formatDay(start7Days);

  try {
    // 1) Bot count
    const botCount = await prisma.bot.count({ where: { userId } });

    // 2) Totals for month (use aggregatedUsage for fast reads)
    const monthSums = await prisma.aggregatedUsage.aggregate({
      where: {
        userId,
        day: { gte: startOfMonthStr },
      },
      _sum: {
        interactions: true,
        minutes: true,
        website: true,
        whatsapp: true,
        facebook: true,
        voice: true,
      },
    });

    const totalInteractions = monthSums._sum.interactions ?? 0;
    const minutesUsed = monthSums._sum.minutes ?? 0;

    const channelCounts = {
      website: monthSums._sum.website ?? 0,
      whatsapp: monthSums._sum.whatsapp ?? 0,
      facebook: monthSums._sum.facebook ?? 0,
      voice: monthSums._sum.voice ?? 0,
    };

    // 3) Interactions series for last 7 days (build zeroed map then fill)
    const seriesMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(start7Days);
      d.setDate(start7Days.getDate() + i);
      const key = formatDay(d);
      seriesMap[key] = 0;
    }

    const aggsLast7 = await prisma.aggregatedUsage.findMany({
      where: {
        userId,
        day: { gte: start7DaysStr },
      },
      select: { day: true, interactions: true },
      orderBy: { day: "asc" },
    });

    aggsLast7.forEach((r) => {
      const day = r.day;
      seriesMap[day] = (seriesMap[day] ?? 0) + (r.interactions ?? 0);
    });

    const interactionsSeries: SeriesPoint[] = Object.entries(seriesMap).map(
      ([date, value]) => ({ date, value }),
    );

    // 4) Subscription / plan info
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });

    const planName = subscription?.plan?.name ?? PlanName.FREE;
    const monthlyQuota = subscription?.plan?.minutesPerMonth ?? 0;
    const botLimit = subscription?.plan?.agents ?? 1;

    // 5) Response accuracy (last 7 days)
    const startDay = start7Days.toISOString().slice(0, 10);
    const endDay = now.toISOString().slice(0, 10);
    const accuracy = await getOverallAccuracy(userId, startDay, endDay);

    const responseAccuracy =
      accuracy.accuracyFallbackAware ?? accuracy.accuracySimple ?? "—";

    return {
      totalInteractions,
      botCount,
      botLimit,
      planName,
      minutesUsed,
      monthlyQuota,
      responseAccuracy,
      interactionsSeries,
      channelCounts,
    };
  } catch (error) {
    console.log("getUserUsage error:", error);
    return null;
  }
}
