/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/actions/usage.ts (Enhanced version)
"use server";

import { prisma } from "@/lib/prisma";
import { PlanName, SubscriptionStatus } from "@prisma/client";
import {
  getConversationAnalytics,
  getKnowledgeBaseAnalytics,
  getPerformanceAnalytics,
  getVoiceAnalytics,
  type ConversationAnalytics,
  type KnowledgeBaseAnalytics,
  type VoiceAnalytics,
} from "./analytics";

export type SeriesPoint = { date: string; value: number };

export type EnhancedUserUsage = {
  // Existing fields
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

  // New analytics fields
  knowledgeBaseAnalytics?: KnowledgeBaseAnalytics;
  conversationAnalytics?: ConversationAnalytics;
  voiceAnalytics?: VoiceAnalytics;
  performanceMetrics?: {
    averageResponseTime: number;
    cacheHitRate: number;
    errorRate: number;
  };

  // Additional insights
  insights?: {
    mostActiveKB?: string;
    peakUsageHour?: number;
    growthTrend?: "up" | "down" | "stable";
    recommendations?: string[];
  };
};

export async function getEnhancedUserUsage(
  userId: string,
): Promise<EnhancedUserUsage | null> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const start7Days = new Date(now);
  start7Days.setDate(now.getDate() - 6);

  try {
    // Get all the existing data
    const [
      botCount,
      usageThisMonth,
      usageLast7,
      subscription,
      // New analytics
      kbAnalytics,
      conversationAnalytics,
      voiceAnalytics,
      performanceAnalytics,
    ] = await Promise.all([
      prisma.bot.count({ where: { userId } }),

      prisma.usage.findMany({
        where: {
          userId,
          date: { gte: startOfMonth },
        },
      }),

      prisma.usage.findMany({
        where: {
          userId,
          date: { gte: start7Days },
        },
        orderBy: { date: "asc" },
      }),

      prisma.subscription.findFirst({
        where: {
          userId,
          status: SubscriptionStatus.ACTIVE,
        },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),

      // Analytics
      getKnowledgeBaseAnalytics(userId, 30),
      getConversationAnalytics(userId, 30),
      getVoiceAnalytics(userId, 30),
      getPerformanceAnalytics(30),
    ]);

    // Existing calculations
    const totalInteractions = usageThisMonth.reduce(
      (s, u) => s + (u.interactions ?? 0),
      0,
    );

    const minutesUsed = usageThisMonth.reduce(
      (s, u) => s + (u.minutes ?? 0),
      0,
    );

    // Build interactions series for last 7 days
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
        date: new Date(date).toLocaleDateString("en", { weekday: "short" }),
        value,
      }),
    );

    // Channel counts with enhanced tracking
    const channelCounts = { website: 0, whatsapp: 0, facebook: 0, voice: 0 };
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let cachedResponses = 0;
    let totalResponses = 0;
    let errors = 0;

    usageThisMonth.forEach((u) => {
      const meta = (u.meta ?? {}) as any;

      // Enhanced channel tracking
      if (meta?.kbId && !meta?.transcriptLength) {
        channelCounts.website += u.interactions || 0;
      }
      if (meta?.transcriptLength) {
        channelCounts.voice += u.interactions || 0;
      }

      // Performance metrics
      if (meta?.processingTime) {
        totalResponseTime += meta.processingTime;
        responseTimeCount++;
      }

      if (meta?.cached) {
        cachedResponses++;
      }

      totalResponses += u.interactions || 0;

      if (meta?.error) {
        errors++;
      }
    });

    // Plan info
    const planName = subscription?.plan?.name ?? PlanName.FREE;
    const monthlyQuota = subscription?.plan?.minutesPerMonth ?? 0;
    const botLimit = subscription?.plan?.agents ?? 1;

    // Calculate performance metrics
    const performanceMetrics = {
      averageResponseTime:
        responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0,
      cacheHitRate:
        totalResponses > 0 ? (cachedResponses / totalResponses) * 100 : 0,
      errorRate: totalResponses > 0 ? (errors / totalResponses) * 100 : 0,
    };

    // Generate insights
    const mostActiveKB = kbAnalytics.kbUsageDistribution[0]?.title;
    const peakUsageHour = getMostActiveHour(usageLast7);
    const growthTrend = calculateGrowthTrend(usageLast7);

    const recommendations = generateRecommendations({
      performanceMetrics,
      kbAnalytics,
      voiceAnalytics,
      usagePercentage: (minutesUsed / monthlyQuota) * 100,
    });

    const insights = {
      mostActiveKB,
      peakUsageHour,
      growthTrend,
      recommendations,
    };

    return {
      totalInteractions,
      botCount,
      botLimit,
      planName,
      minutesUsed,
      monthlyQuota,
      responseAccuracy: calculateAccuracy(usageThisMonth),
      interactionsSeries,
      channelCounts,
      knowledgeBaseAnalytics: kbAnalytics,
      conversationAnalytics,
      voiceAnalytics,
      performanceMetrics,
      insights,
    };
  } catch (error) {
    console.error("Enhanced usage fetch error:", error);
    return null;
  }
}

// Helper functions
function getMostActiveHour(usage: any[]): number {
  const hourCounts = new Array(24).fill(0);

  usage.forEach((u) => {
    const hour = u.date.getHours();
    hourCounts[hour] += u.interactions || 0;
  });

  return hourCounts.indexOf(Math.max(...hourCounts));
}

function calculateGrowthTrend(usage: any[]): "up" | "down" | "stable" {
  if (usage.length < 4) return "stable";

  const firstHalf = usage
    .slice(0, Math.floor(usage.length / 2))
    .reduce((sum, u) => sum + (u.interactions || 0), 0);
  const secondHalf = usage
    .slice(Math.floor(usage.length / 2))
    .reduce((sum, u) => sum + (u.interactions || 0), 0);

  const diff = ((secondHalf - firstHalf) / Math.max(firstHalf, 1)) * 100;

  if (diff > 10) return "up";
  if (diff < -10) return "down";
  return "stable";
}

function calculateAccuracy(usage: any[]): string {
  // This would need to be based on user feedback or error rates
  // For now, return a placeholder based on error rate
  const totalInteractions = usage.reduce(
    (sum, u) => sum + (u.interactions || 0),
    0,
  );
  const errors = usage.reduce((sum, u) => {
    const meta = u.meta as any;
    return sum + (meta?.error ? 1 : 0);
  }, 0);

  if (totalInteractions === 0) return "—";

  const accuracy = ((totalInteractions - errors) / totalInteractions) * 100;
  return `${Math.round(accuracy)}%`;
}

function generateRecommendations(data: {
  performanceMetrics: any;
  kbAnalytics: any;
  voiceAnalytics: any;
  usagePercentage: number;
}): string[] {
  const recommendations: string[] = [];

  if (data.performanceMetrics.cacheHitRate < 60) {
    recommendations.push(
      "Consider optimizing your knowledge base content to improve cache efficiency",
    );
  }

  if (data.performanceMetrics.averageResponseTime > 2000) {
    recommendations.push(
      "Response times are slower than optimal - review your knowledge base size",
    );
  }

  if (data.usagePercentage > 80) {
    recommendations.push(
      "You're approaching your monthly quota - consider upgrading your plan",
    );
  }

  if (
    data.kbAnalytics.totalDocuments > 100 &&
    data.kbAnalytics.totalKnowledgeBases === 1
  ) {
    recommendations.push(
      "Consider organizing your content into multiple knowledge bases for better performance",
    );
  }

  if (
    data.voiceAnalytics.totalVoiceInteractions > 0 &&
    data.voiceAnalytics.avgTranscriptionLength < 10
  ) {
    recommendations.push(
      "Voice interactions are very short - ensure users know they can ask detailed questions",
    );
  }

  return recommendations.slice(0, 3); // Limit to top 3 recommendations
}

// Keep the original function for backwards compatibility
export async function getUserUsage(userId: string) {
  const enhanced = await getEnhancedUserUsage(userId);
  if (!enhanced) return null;

  // Return in the original format
  return {
    totalInteractions: enhanced.totalInteractions,
    botCount: enhanced.botCount,
    botLimit: enhanced.botLimit,
    planName: enhanced.planName,
    minutesUsed: enhanced.minutesUsed,
    monthlyQuota: enhanced.monthlyQuota,
    responseAccuracy: enhanced.responseAccuracy,
    interactionsSeries: enhanced.interactionsSeries,
    channelCounts: enhanced.channelCounts,
  };
}
