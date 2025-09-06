/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/actions/analytics.ts
"use server";

import { prisma } from "@/lib/prisma";
import { CacheService } from "@/lib/upstash";

const cache = CacheService.getInstance();

export type CacheAnalytics = {
  hitRate: number;
  totalRequests: number;
  avgResponseTime: number;
  cacheTypes: Record<string, number>;
  rateLimitHits: Record<string, number>;
};

export type KnowledgeBaseAnalytics = {
  totalKnowledgeBases: number;
  totalDocuments: number;
  totalEmbeddings: number;
  averageDocumentsPerKB: number;
  recentlyUpdatedKBs: number;
  kbUsageDistribution: Array<{
    kbId: string;
    title: string;
    interactions: number;
    lastUsed: Date;
  }>;
};

export type ConversationAnalytics = {
  totalConversations: number;
  averageMessagesPerConversation: number;
  dailyConversations: Array<{
    date: string;
    count: number;
  }>;
  conversationLengthDistribution: Array<{
    range: string;
    count: number;
  }>;
};

export type VoiceAnalytics = {
  totalVoiceInteractions: number;
  avgTranscriptionLength: number;
  avgResponseLength: number;
  languageDistribution: Array<{
    language: string;
    count: number;
  }>;
  voiceProfileUsage: Array<{
    profileName: string;
    usageCount: number;
  }>;
};

export type PerformanceAnalytics = {
  chatApiRequests: number;
  voiceApiRequests: number;
  averageProcessingTime: number;
  errorRate: number;
  cacheEfficiency: CacheAnalytics;
  rateLimitingStats: Record<string, number>;
};

export type UserEngagementAnalytics = {
  activeUsers: number;
  newUsers: number;
  userRetention: number;
  mostActiveTimeOfDay: Array<{
    hour: number;
    interactions: number;
  }>;
  userJourney: Array<{
    step: string;
    users: number;
    conversionRate: number;
  }>;
};

export async function getKnowledgeBaseAnalytics(
  userId: string,
  days: number = 30,
): Promise<KnowledgeBaseAnalytics> {
  const cacheKey = `kb_analytics:${userId}:${days}`;
  const cached = await cache.get<KnowledgeBaseAnalytics>(cacheKey);

  if (cached) return cached;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [kbs, totalDocuments, totalEmbeddings, usage] = await Promise.all([
    prisma.knowledgeBase.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        _count: {
          select: {
            documents: true,
            embeddings: true,
          },
        },
      },
    }),
    prisma.document.count({
      where: {
        kb: { userId },
      },
    }),
    prisma.embedding.count({
      where: {
        kb: { userId },
      },
    }),
    prisma.usage.findMany({
      where: {
        userId,
        date: { gte: since },
        meta: { not: null },
      },
      select: {
        interactions: true,
        date: true,
        meta: true,
      },
    }),
  ]);

  // Calculate KB usage distribution
  const kbUsageMap = new Map<
    string,
    { interactions: number; lastUsed: Date }
  >();

  usage.forEach((u) => {
    const meta = u.meta as any;
    const kbId = meta?.kbId;
    if (kbId) {
      const existing = kbUsageMap.get(kbId) || {
        interactions: 0,
        lastUsed: new Date(0),
      };
      existing.interactions += u.interactions || 0;
      if (u.date > existing.lastUsed) {
        existing.lastUsed = u.date;
      }
      kbUsageMap.set(kbId, existing);
    }
  });

  const kbUsageDistribution = kbs
    .map((kb) => ({
      kbId: kb.id,
      title: kb.title,
      interactions: kbUsageMap.get(kb.id)?.interactions || 0,
      lastUsed: kbUsageMap.get(kb.id)?.lastUsed || kb.updatedAt,
    }))
    .sort((a, b) => b.interactions - a.interactions);

  const recentlyUpdatedKBs = kbs.filter((kb) => kb.updatedAt >= since).length;

  const analytics: KnowledgeBaseAnalytics = {
    totalKnowledgeBases: kbs.length,
    totalDocuments,
    totalEmbeddings,
    averageDocumentsPerKB:
      kbs.length > 0
        ? kbs.reduce((sum, kb) => sum + kb._count.documents, 0) / kbs.length
        : 0,
    recentlyUpdatedKBs,
    kbUsageDistribution,
  };

  // Cache for 15 minutes
  await cache.set(cacheKey, analytics, 900);

  return analytics;
}

export async function getConversationAnalytics(
  userId: string,
  days: number = 30,
): Promise<ConversationAnalytics> {
  const cacheKey = `conversation_analytics:${userId}:${days}`;
  const cached = await cache.get<ConversationAnalytics>(cacheKey);

  if (cached) return cached;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [conversations, messages] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        userId,
        createdAt: { gte: since },
      },
      select: {
        id: true,
        createdAt: true,
        _count: {
          select: { messages: true },
        },
      },
    }),
    prisma.message.count({
      where: {
        conversation: {
          userId,
          createdAt: { gte: since },
        },
      },
    }),
  ]);

  // Daily conversation counts
  const dailyMap = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const date = new Date(since);
    date.setDate(since.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    dailyMap.set(dateStr, 0);
  }

  conversations.forEach((conv) => {
    const dateStr = conv.createdAt.toISOString().split("T")[0];
    dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + 1);
  });

  const dailyConversations = Array.from(dailyMap.entries()).map(
    ([date, count]) => ({
      date,
      count,
    }),
  );

  // Conversation length distribution
  const lengthDistribution = [
    { range: "1-3 messages", count: 0 },
    { range: "4-10 messages", count: 0 },
    { range: "11-20 messages", count: 0 },
    { range: "20+ messages", count: 0 },
  ];

  conversations.forEach((conv) => {
    const messageCount = conv._count.messages;
    if (messageCount <= 3) lengthDistribution[0].count++;
    else if (messageCount <= 10) lengthDistribution[1].count++;
    else if (messageCount <= 20) lengthDistribution[2].count++;
    else lengthDistribution[3].count++;
  });

  const analytics: ConversationAnalytics = {
    totalConversations: conversations.length,
    averageMessagesPerConversation:
      conversations.length > 0 ? messages / conversations.length : 0,
    dailyConversations,
    conversationLengthDistribution: lengthDistribution,
  };

  await cache.set(cacheKey, analytics, 900);
  return analytics;
}

export async function getVoiceAnalytics(
  userId: string,
  days: number = 30,
): Promise<VoiceAnalytics> {
  const cacheKey = `voice_analytics:${userId}:${days}`;
  const cached = await cache.get<VoiceAnalytics>(cacheKey);

  if (cached) return cached;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [usage, voiceProfiles] = await Promise.all([
    prisma.usage.findMany({
      where: {
        userId,
        date: { gte: since },
        meta: { not: null },
      },
      select: {
        interactions: true,
        meta: true,
      },
    }),
    prisma.voiceProfile.findMany({
      where: { userId },
      select: {
        name: true,
        id: true,
      },
    }),
  ]);

  let totalTranscriptLength = 0;
  let totalResponseLength = 0;
  const languageMap = new Map<string, number>();

  usage.forEach((u) => {
    const meta = u.meta as any;
    if (meta?.transcriptLength) {
      totalTranscriptLength += meta.transcriptLength;
    }
    if (meta?.replyLength) {
      totalResponseLength += meta.replyLength;
    }

    // Extract language info if available
    const language = meta?.language || "en";
    languageMap.set(language, (languageMap.get(language) || 0) + 1);
  });

  const totalVoiceInteractions = usage.length;

  const analytics: VoiceAnalytics = {
    totalVoiceInteractions,
    avgTranscriptionLength:
      totalVoiceInteractions > 0
        ? totalTranscriptLength / totalVoiceInteractions
        : 0,
    avgResponseLength:
      totalVoiceInteractions > 0
        ? totalResponseLength / totalVoiceInteractions
        : 0,
    languageDistribution: Array.from(languageMap.entries()).map(
      ([language, count]) => ({
        language,
        count,
      }),
    ),
    voiceProfileUsage: voiceProfiles.map((profile) => ({
      profileName: profile.name,
      usageCount: 0, // You'd need to track this in usage.meta
    })),
  };

  await cache.set(cacheKey, analytics, 900);
  return analytics;
}

export async function getPerformanceAnalytics(
  days: number = 30,
): Promise<PerformanceAnalytics> {
  const cacheKey = `performance_analytics:${days}`;
  const cached = await cache.get<PerformanceAnalytics>(cacheKey);

  if (cached) return cached;

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Get usage data to calculate performance metrics
  const usage = await prisma.usage.findMany({
    where: {
      date: { gte: since },
    },
    select: {
      meta: true,
      interactions: true,
    },
  });

  let chatApiRequests = 0;
  let voiceApiRequests = 0;
  let totalProcessingTime = 0;
  let errorCount = 0;
  const rateLimitingStats: Record<string, number> = {};

  usage.forEach((u) => {
    const meta = u.meta as any;

    if (meta?.kbId) chatApiRequests++;
    if (meta?.transcriptLength) voiceApiRequests++;

    if (meta?.processingTime) {
      totalProcessingTime += meta.processingTime;
    }

    if (meta?.error) {
      errorCount++;
    }

    // Rate limiting stats would need to be tracked in meta
    if (meta?.rateLimitHit) {
      const type = meta.rateLimitType || "general";
      rateLimitingStats[type] = (rateLimitingStats[type] || 0) + 1;
    }
  });

  const totalRequests = chatApiRequests + voiceApiRequests;

  const analytics: PerformanceAnalytics = {
    chatApiRequests,
    voiceApiRequests,
    averageProcessingTime:
      totalRequests > 0 ? totalProcessingTime / totalRequests : 0,
    errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
    cacheEfficiency: {
      hitRate: 0, // Would need to be tracked in cache layer
      totalRequests,
      avgResponseTime: 0,
      cacheTypes: {},
      rateLimitHits: rateLimitingStats,
    },
    rateLimitingStats,
  };

  await cache.set(cacheKey, analytics, 300); // 5 minutes cache
  return analytics;
}

export async function getUserEngagementAnalytics(
  days: number = 30,
): Promise<UserEngagementAnalytics> {
  const cacheKey = `user_engagement_analytics:${days}`;
  const cached = await cache.get<UserEngagementAnalytics>(cacheKey);

  if (cached) return cached;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [users, usage] = await Promise.all([
    prisma.user.findMany({
      where: {
        createdAt: { gte: since },
      },
      select: {
        id: true,
        createdAt: true,
      },
    }),
    prisma.usage.findMany({
      where: {
        date: { gte: since },
        userId: { not: null },
      },
      select: {
        userId: true,
        date: true,
        interactions: true,
      },
    }),
  ]);

  // Active users (users who had interactions)
  const activeUserIds = new Set(usage.map((u) => u.userId).filter(Boolean));

  // Time of day analysis
  const hourlyMap = new Map<number, number>();
  for (let i = 0; i < 24; i++) {
    hourlyMap.set(i, 0);
  }

  usage.forEach((u) => {
    const hour = u.date.getHours();
    hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + (u.interactions || 0));
  });

  const mostActiveTimeOfDay = Array.from(hourlyMap.entries()).map(
    ([hour, interactions]) => ({
      hour,
      interactions,
    }),
  );

  const analytics: UserEngagementAnalytics = {
    activeUsers: activeUserIds.size,
    newUsers: users.length,
    userRetention: 0, // Would need historical data to calculate
    mostActiveTimeOfDay,
    userJourney: [
      { step: "Registration", users: users.length, conversionRate: 100 },
      { step: "First Bot Created", users: 0, conversionRate: 0 }, // Would need to track
      {
        step: "First Interaction",
        users: activeUserIds.size,
        conversionRate: 0,
      },
    ],
  };

  await cache.set(cacheKey, analytics, 1800); // 30 minutes
  return analytics;
}
