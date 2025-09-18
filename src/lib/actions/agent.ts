"use server";

import { auth } from "../auth";
import { prisma } from "../prisma";

export async function canCreateMoreAgents(): Promise<boolean> {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) throw new Error("Not authenticated");

    // Get user's subscription to check limits
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ["ACTIVE", "TRIALING"] },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });

    // Get all user's knowledge bases/agents
    const knowledgeBases = await prisma.knowledgeBase.findMany({
      where: { userId },
      include: {
        documents: {
          select: {
            id: true,
            filename: true,
            createdAt: true,
          },
        },
        embeddings: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const allowedAgenst = subscription?.plan?.agents || 1;
    const canCreateMore = knowledgeBases.length < allowedAgenst;

    return canCreateMore;
  } catch (error) {
    console.log(error);
    throw error;
  }
}
