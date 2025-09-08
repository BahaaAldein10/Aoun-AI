// src/lib/actions/getReportsData.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getBotAccuracy } from "@/lib/analytics/getAccuracy";

type MonthlyPoint = { month: string; interactions: number; users: number };
type BotReport = {
  id: string;
  name: string;
  status: string;
  interactions30d: number;
  accuracy30d: number | string;
};

export type ReportsData = {
  monthlyData: MonthlyPoint[]; // last 6 months
  bots: BotReport[];
};

/**
 * Returns:
 * - monthlyData: last 6 months interaction totals
 * - bots: list of bots with interactions in last 30 days + accuracy (30d)
 */
export async function getReportsData(userId: string): Promise<ReportsData> {
  if (!userId) {
    return { monthlyData: [], bots: [] };
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Build last 6 months keys (YYYY-MM) and labels
  const months: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-based
    const key = `${year}-${String(month + 1).padStart(2, "0")}`; // YYYY-MM
    const label = d.toLocaleString("en", { month: "short" }); // "Jan"
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0); // last day of month
    months.push({ key, label, start, end });
  }

  // Query aggregatedUsage for earliest month start to now
  const earliest = months[0].start.toISOString().slice(0, 10); // YYYY-MM-DD
  const aggs = await prisma.aggregatedUsage.findMany({
    where: {
      userId,
      day: { gte: earliest },
    },
    select: { day: true, interactions: true },
  });

  // reduce to month buckets
  const monthlyMap = new Map<string, number>();
  months.forEach((m) => monthlyMap.set(m.key, 0));
  aggs.forEach((r) => {
    // r.day -> "YYYY-MM-DD" -> month key = r.day.slice(0,7)
    const key = r.day.slice(0, 7);
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + (r.interactions ?? 0));
  });

  const monthlyData: MonthlyPoint[] = months.map((m) => ({
    month: m.label,
    interactions: monthlyMap.get(m.key) ?? 0,
    users: 0, // unique end-users not tracked in current schema; set 0 or compute if you add user tracking
  }));

  // Build bots list and compute interactions + accuracy for last 30 days
  const start30 = new Date();
  start30.setDate(now.getDate() - 29); // last 30 days inclusive
  const start30Str = start30.toISOString().slice(0, 10);

  const bots = await prisma.bot.findMany({
    where: { userId },
    select: { id: true, name: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  const botReports: BotReport[] = await Promise.all(
    bots.map(async (b) => {
      const acc = await getBotAccuracy(userId, b.id, start30Str, todayStr);
      return {
        id: b.id,
        name: b.name ?? "Untitled",
        status: b.status ?? "UNKNOWN",
        interactions30d: acc.total ?? 0,
        accuracy30d: acc.accuracySimple ?? "—",
      };
    }),
  );

  return {
    monthlyData,
    bots: botReports,
  };
}
