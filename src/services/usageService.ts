// services/usageService.ts
export type UserUsage = {
  // minimal fields used by dashboard; extend as needed
  userId?: string;
  minutesUsed: number;
  monthlyQuota: number;
  botCount: number;
  botLimit: number;
  planName?: string;
  totalInteractions?: number;
  responseAccuracy?: string | number;
};

// Placeholder: replace with a real server action (Prisma / MongoDB)
export async function getUserUsage(userId: string): Promise<UserUsage | null> {
  // TODO: replace with actual DB fetch with Prisma/Mongo
  // Example mocked response:
  return {
    userId,
    minutesUsed: 120,
    monthlyQuota: 1000,
    botCount: 3,
    botLimit: 10,
    planName: "Pro",
    totalInteractions: 12234,
    responseAccuracy: "94.2%",
  };
}
