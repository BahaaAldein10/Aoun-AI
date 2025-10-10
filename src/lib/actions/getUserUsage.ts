// src/lib/actions/getUserUsage.ts
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
  hasActiveSubscription: boolean;
  isMaintenancePlan: boolean;
  requiresUpgrade: boolean;
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

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  const isAdmin = user?.role === "ADMIN";

  const now = new Date();

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthStr = formatDay(startOfMonth);

  const start7Days = new Date(now);
  start7Days.setDate(now.getDate() - 6); // last 7 days including today
  const start7DaysStr = formatDay(start7Days);

  try {
    // 1) Bot count
    const botCount = await prisma.bot.count({ where: { userId } });

    // 2) Admins get unlimited access without subscription
    if (isAdmin) {
      const adminUsage = await prisma.aggregatedUsage.aggregate({
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

      const startDay = start7Days.toISOString().slice(0, 10);
      const endDay = now.toISOString().slice(0, 10);
      const accuracy = await getOverallAccuracy(userId, startDay, endDay);

      return {
        totalInteractions: adminUsage._sum.interactions ?? 0,
        botCount,
        botLimit: 999, // Unlimited
        planName: "ADMIN",
        minutesUsed: adminUsage._sum.minutes ?? 0,
        monthlyQuota: -1, // unlimited
        responseAccuracy:
          accuracy.accuracyFallbackAware ?? accuracy.accuracySimple ?? "—",
        interactionsSeries: Object.entries(seriesMap).map(([date, value]) => ({
          date,
          value,
        })),
        channelCounts: {
          website: adminUsage._sum.website ?? 0,
          whatsapp: adminUsage._sum.whatsapp ?? 0,
          facebook: adminUsage._sum.facebook ?? 0,
          voice: adminUsage._sum.voice ?? 0,
        },
        hasActiveSubscription: true,
        isMaintenancePlan: false,
        requiresUpgrade: false,
      };
    }

    // 3) Get active subscription (including grace period) for non-admin users
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
          ],
        },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });

    // Admins get unlimited access without subscription
    if (isAdmin) {
      const adminUsage = await prisma.aggregatedUsage.aggregate({
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

      const startDay = start7Days.toISOString().slice(0, 10);
      const endDay = now.toISOString().slice(0, 10);
      const accuracy = await getOverallAccuracy(userId, startDay, endDay);

      return {
        totalInteractions: adminUsage._sum.interactions ?? 0,
        botCount,
        botLimit: 999, // Unlimited
        planName: "ADMIN",
        minutesUsed: adminUsage._sum.minutes ?? 0,
        monthlyQuota: -1, // unlimited
        responseAccuracy:
          accuracy.accuracyFallbackAware ?? accuracy.accuracySimple ?? "—",
        interactionsSeries: Object.entries(seriesMap).map(([date, value]) => ({
          date,
          value,
        })),
        channelCounts: {
          website: adminUsage._sum.website ?? 0,
          whatsapp: adminUsage._sum.whatsapp ?? 0,
          facebook: adminUsage._sum.facebook ?? 0,
          voice: adminUsage._sum.voice ?? 0,
        },
        hasActiveSubscription: true,
        isMaintenancePlan: false,
        requiresUpgrade: false,
      };
    }

    // Determine subscription status and plan details
    const hasActiveSubscription = !!subscription;
    const planName = subscription?.plan?.name ?? null;
    const isMaintenancePlan = planName === PlanName.MAINTENANCE;

    // No defaults - if no subscription, they get 0
    const monthlyQuota = subscription?.plan?.minutesPerMonth ?? 0;
    const botLimit = subscription?.plan?.agents ?? 0;

    // User needs upgrade if:
    // - No subscription at all
    // - Has MAINTENANCE plan (no usage allowed)
    const requiresUpgrade = !hasActiveSubscription || isMaintenancePlan;

    // 3) Calculate usage for current billing period
    let periodStart = startOfMonth;
    if (subscription?.currentPeriodStart) {
      periodStart = subscription.currentPeriodStart;
    } else if (subscription?.createdAt) {
      periodStart = subscription.createdAt;
    }

    const periodStartStr = formatDay(periodStart);

    // 4) Totals for current period (use aggregatedUsage for fast reads)
    const periodSums = await prisma.aggregatedUsage.aggregate({
      where: {
        userId,
        day: { gte: periodStartStr },
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

    const totalInteractions = periodSums._sum.interactions ?? 0;
    const minutesUsed = periodSums._sum.minutes ?? 0;

    const channelCounts = {
      website: periodSums._sum.website ?? 0,
      whatsapp: periodSums._sum.whatsapp ?? 0,
      facebook: periodSums._sum.facebook ?? 0,
      voice: periodSums._sum.voice ?? 0,
    };

    // 5) Interactions series for last 7 days (build zeroed map then fill)
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

    // 6) Response accuracy (last 7 days)
    const startDay = start7Days.toISOString().slice(0, 10);
    const endDay = now.toISOString().slice(0, 10);
    const accuracy = await getOverallAccuracy(userId, startDay, endDay);

    const responseAccuracy =
      accuracy.accuracyFallbackAware ?? accuracy.accuracySimple ?? "—";

    return {
      totalInteractions,
      botCount,
      botLimit,
      planName: planName ?? "NONE", // Explicitly show no plan
      minutesUsed,
      monthlyQuota,
      responseAccuracy,
      interactionsSeries,
      channelCounts,
      hasActiveSubscription,
      isMaintenancePlan,
      requiresUpgrade,
    };
  } catch (error) {
    console.log("getUserUsage error:", error);
    return null;
  }
}
