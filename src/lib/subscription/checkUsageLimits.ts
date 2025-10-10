// lib/subscription/checkUsageLimits.ts
import { prisma } from "@/lib/prisma";
import { PlanName, SubscriptionStatus } from "@prisma/client";

type UsageLimitResult = {
  allowed: boolean;
  reason?: string;
  remainingMinutes?: number;
  totalMinutes?: number;
  usedMinutes?: number;
  planName?: PlanName;
  requiresUpgrade?: boolean;
};

type AgentLimitResult = {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
  requiresUpgrade?: boolean;
  planName?: PlanName;
};

/**
 * Check if user can make a request based on their subscription and usage
 */
export async function checkUsageLimits(
  userId: string,
  estimatedMinutes: number = 1,
): Promise<UsageLimitResult> {
  // Check if user is admin - admins bypass all limits
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role === "ADMIN") {
    // Calculate actual usage for admin (for tracking purposes)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const usage = await prisma.usage.aggregate({
      where: {
        userId,
        date: {
          gte: startOfMonth,
          lte: now,
        },
      },
      _sum: {
        minutes: true,
      },
    });

    const usedMinutes = usage._sum.minutes || 0;

    return {
      allowed: true,
      planName: PlanName.ENTERPRISE,
      remainingMinutes: -1, // Unlimited
      totalMinutes: -1,
      usedMinutes: usedMinutes, // Actual usage tracked
    };
  }

  // 1. Get user's active subscription
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: {
        in: [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
          SubscriptionStatus.PAST_DUE, // Allow past_due to continue (grace period)
        ],
      },
    },
    include: {
      plan: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // No active subscription = blocked
  if (!subscription) {
    return {
      allowed: false,
      reason: "No active subscription found. Please subscribe to a plan.",
      requiresUpgrade: true,
    };
  }

  const plan = subscription.plan;

  // Skip checks for MAINTENANCE plan (it's a one-time fee, no usage limits)
  if (plan.name === PlanName.MAINTENANCE) {
    return {
      allowed: false,
      reason:
        "Maintenance plan does not include usage minutes. Please upgrade to a paid plan.",
      requiresUpgrade: true,
      planName: plan.name,
    };
  }

  // Enterprise plan with unlimited minutes
  if (plan.name === PlanName.ENTERPRISE) {
    return {
      allowed: true,
      planName: plan.name,
      remainingMinutes: -1, // -1 indicates unlimited
      totalMinutes: plan.minutesPerMonth,
    };
  }

  // 2. Calculate current billing period
  const periodStart = subscription.currentPeriodStart || subscription.createdAt;
  const periodEnd =
    subscription.currentPeriodEnd ||
    new Date(
      periodStart.getTime() + 30 * 24 * 60 * 60 * 1000, // Default 30 days
    );

  // 3. Get usage for current billing period
  const matchStage = {
    $match: {
      userId,
      date: { $gte: periodStart, $lte: periodEnd },
      $or: [
        { "meta.isDemo": { $exists: false } },
        { "meta.isDemo": { $ne: true } },
      ],
    },
  };

  const groupStage = {
    $group: {
      _id: null,
      totalMinutes: { $sum: "$minutes" },
    },
  };

  const agg = await prisma.usage.aggregateRaw({
    pipeline: [matchStage, groupStage],
  });

  const usedMinutes =
    Array.isArray(agg) && agg.length > 0 ? agg[0].totalMinutes || 0 : 0;
  const totalMinutes = plan.minutesPerMonth;
  const remainingMinutes = totalMinutes - usedMinutes;

  // 4. Check if user has exceeded limit
  if (remainingMinutes <= 0) {
    return {
      allowed: false,
      reason: `Monthly limit of ${totalMinutes} minutes exceeded. Used: ${usedMinutes} minutes.`,
      remainingMinutes: 0,
      totalMinutes,
      usedMinutes,
      planName: plan.name,
      requiresUpgrade: true,
    };
  }

  // 5. Check if this request would exceed limit
  if (remainingMinutes < estimatedMinutes) {
    return {
      allowed: false,
      reason: `Insufficient minutes. Required: ${estimatedMinutes}, Available: ${remainingMinutes}`,
      remainingMinutes,
      totalMinutes,
      usedMinutes,
      planName: plan.name,
      requiresUpgrade: false,
    };
  }

  // All checks passed
  return {
    allowed: true,
    remainingMinutes,
    totalMinutes,
    usedMinutes,
    planName: plan.name,
  };
}

/**
 * Get overage rate per minute based on plan
 */
export function getOverageRate(planName: PlanName): number {
  const rates: Record<PlanName, number> = {
    [PlanName.FREE]: 0.07,
    [PlanName.STARTER]: 0.05,
    [PlanName.PRO]: 0.03,
    [PlanName.ENTERPRISE]: 0, // No overage for enterprise
    [PlanName.MAINTENANCE]: 0, // No usage allowed
  };

  return rates[planName] || 0;
}

/**
 * Check agent limit based on subscription
 */
export async function checkAgentLimit(
  userId: string,
): Promise<AgentLimitResult> {
  // Check if user is admin - admins bypass all limits
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role === "ADMIN") {
    const currentAgents = await prisma.knowledgeBase.count({
      where: { userId },
    });

    return {
      allowed: true,
      limit: 999, // Virtually unlimited
      current: currentAgents,
      planName: PlanName.ENTERPRISE,
    };
  }

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
    include: {
      plan: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // No active subscription = blocked
  if (!subscription) {
    return {
      allowed: false,
      reason:
        "No active subscription found. Please subscribe to a plan to create agents.",
      requiresUpgrade: true,
    };
  }

  const plan = subscription.plan;

  // MAINTENANCE plan doesn't allow agents
  if (plan.name === PlanName.MAINTENANCE) {
    return {
      allowed: false,
      reason:
        "Maintenance plan does not include agent creation. Please upgrade to a paid plan.",
      limit: 0,
      current: 0,
      requiresUpgrade: true,
      planName: plan.name,
    };
  }

  const agentLimit = plan.agents;

  // Count current agents (knowledge bases)
  const currentAgents = await prisma.knowledgeBase.count({
    where: {
      userId,
    },
  });

  if (currentAgents >= agentLimit) {
    return {
      allowed: false,
      reason: `Agent limit reached. Your ${plan.name} plan allows ${agentLimit} agent(s). You currently have ${currentAgents}.`,
      limit: agentLimit,
      current: currentAgents,
      requiresUpgrade: true,
      planName: plan.name,
    };
  }

  return {
    allowed: true,
    limit: agentLimit,
    current: currentAgents,
    planName: plan.name,
  };
}

/**
 * Get agent limit info without blocking
 */
export async function getAgentLimitInfo(userId: string): Promise<{
  limit: number;
  current: number;
  canCreateMore: boolean;
  planName?: PlanName;
}> {
  const result = await checkAgentLimit(userId);

  return {
    limit: result.limit || 0,
    current: result.current || 0,
    canCreateMore: result.allowed,
    planName: result.planName,
  };
}
