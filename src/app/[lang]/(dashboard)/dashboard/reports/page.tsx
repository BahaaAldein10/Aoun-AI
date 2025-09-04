// app/[lang]/dashboard/reports/page.tsx
import ReportsClient from "@/components/dashboard/ReportsClient";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLangAndDict, SupportedLang } from "@/lib/dictionaries";
import { redirect } from "next/navigation";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

type ReportsPageProps = {
  params: Promise<{ lang: SupportedLang }>;
};

// Types for the data we'll pass to the client
export type MonthlyData = {
  month: string;
  interactions: number;
  users: number;
};

export type BotPerformance = {
  id: string;
  name: string;
  interactions: number;
  accuracy: number;
  status: "Active" | "Inactive";
};

const ReportsPage = async ({ params }: ReportsPageProps) => {
  const { lang, dict } = await getLangAndDict(params);

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${lang}/auth/login`);
  }

  // Get the last 6 months for monthly performance
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(new Date(), 5 - i);
    return {
      date,
      start: startOfMonth(date),
      end: endOfMonth(date),
      monthName: date.toLocaleDateString(lang === "ar" ? "ar" : "en-US", {
        month: "short",
      }),
    };
  });

  // Fetch monthly usage data
  const monthlyUsagePromises = last6Months.map(
    async ({ start, end, monthName }) => {
      const usage = await prisma.usage.aggregate({
        where: {
          userId: session.user.id,
          date: {
            gte: start,
            lte: end,
          },
        },
        _sum: {
          interactions: true,
        },
      });

      // Count unique users (conversations) for this month
      // Since we don't have a direct user count in Usage, we'll use a placeholder
      // You might want to track this differently based on your conversation model
      const uniqueUsers = await prisma.conversation.count({
        where: {
          userId: session.user.id,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      return {
        month: monthName,
        interactions: usage._sum.interactions || 0,
        users: uniqueUsers,
      };
    },
  );

  const monthlyData: MonthlyData[] = await Promise.all(monthlyUsagePromises);

  // Fetch bot performance data
  const bots = await prisma.bot.findMany({
    where: {
      userId: session.user.id,
    },
    include: {
      usage: {
        where: {
          date: {
            gte: subMonths(new Date(), 1), // Last 30 days
          },
        },
      },
    },
  });

  const botPerformance: BotPerformance[] = bots.map((bot) => {
    const totalInteractions = bot.usage.reduce(
      (sum, usage) => sum + usage.interactions,
      0,
    );

    // Calculate accuracy based on some logic
    // This is a placeholder - you'll need to implement based on your business logic
    // For example, you might track successful vs failed interactions
    const accuracy = Math.floor(Math.random() * 10) + 90; // Placeholder: 90-99%

    return {
      id: bot.id,
      name: bot.name,
      interactions: totalInteractions,
      accuracy,
      status: bot.status === "DEPLOYED" ? "Active" : "Inactive",
    };
  });

  // Fetch additional metrics for overview cards
  const totalLeads = await prisma.lead.count({
    where: { userId: session.user.id },
  });

  const totalBots = await prisma.bot.count({
    where: { userId: session.user.id },
  });

  const activeBots = await prisma.bot.count({
    where: {
      userId: session.user.id,
      status: "DEPLOYED",
    },
  });

  // Get current month's total interactions
  const currentMonthStart = startOfMonth(new Date());
  const currentMonthUsage = await prisma.usage.aggregate({
    where: {
      userId: session.user.id,
      date: {
        gte: currentMonthStart,
      },
    },
    _sum: {
      interactions: true,
      minutes: true,
    },
  });

  const overviewStats = {
    totalInteractions: currentMonthUsage._sum.interactions || 0,
    totalMinutes: currentMonthUsage._sum.minutes || 0,
    totalLeads,
    totalBots,
    activeBots,
  };

  return (
    <ReportsClient
      lang={lang}
      dict={dict}
      monthlyData={monthlyData}
      botPerformance={botPerformance}
      overviewStats={overviewStats}
    />
  );
};

export default ReportsPage;
