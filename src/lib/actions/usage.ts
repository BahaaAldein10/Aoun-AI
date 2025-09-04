"use server";

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
  responseAccuracy?: string | number;
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

export async function getUserUsage(userId: string): Promise<UserUsage | null> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const start7Days = new Date(now);
  start7Days.setDate(now.getDate() - 6); // last 7 days including today

  try {
    // 1) Bot count
    const botCount = await prisma.bot.count({ where: { userId } });

    // 2) Usage entries for the month and last 7 days
    const usageThisMonth = await prisma.usage.findMany({
      where: {
        userId,
        date: { gte: startOfMonth },
      },
    });

    const usageLast7 = await prisma.usage.findMany({
      where: {
        userId,
        date: { gte: start7Days },
      },
      orderBy: { date: "asc" },
    });

    // 3) Totals
    const totalInteractions = usageThisMonth.reduce(
      (s, u) => s + (u.interactions ?? 0),
      0,
    );

    const minutesUsed = usageThisMonth.reduce(
      (s, u) => s + (u.minutes ?? 0),
      0,
    );

    // 4) Build interactions series for last 7 days (YYYY-MM-DD -> sum)
    const seriesMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(start7Days);
      d.setDate(start7Days.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      seriesMap[key] = 0;
    }
    usageLast7.forEach((u) => {
      const key = u.date.toISOString().slice(0, 10);
      seriesMap[key] = (seriesMap[key] ?? 0) + (u.interactions ?? 0);
    });
    const interactionsSeries = Object.entries(seriesMap).map(
      ([date, value]) => ({
        date,
        value,
      }),
    );

    // 5) Channel counts: try to accumulate channelCounts if stored in usage.meta
    const channelCounts = { website: 0, whatsapp: 0, facebook: 0, voice: 0 };
    usageThisMonth.forEach((u) => {
      const meta = (u.meta ?? {}) as Record<string, channelCounts>;
      if (meta?.channelCounts && typeof meta.channelCounts === "object") {
        channelCounts.website += +(meta.channelCounts.website ?? 0);
        channelCounts.whatsapp += +(meta.channelCounts.whatsapp ?? 0);
        channelCounts.facebook += +(meta.channelCounts.facebook ?? 0);
        channelCounts.voice += +(meta.channelCounts.voice ?? 0);
      }
    });

    // 6) Subscription / plan info
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
      include: { plan: true },
    });

    const planName = subscription?.plan?.name ?? PlanName.FREE;
    const monthlyQuota = subscription?.plan?.minutesPerMonth ?? 0;
    const botLimit = subscription?.plan?.agents ?? 1;

    // 7) Response accuracy (optional; we leave as placeholder)
    const responseAccuracy = "—";

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
    console.log(error);
    return null;
  }
}
