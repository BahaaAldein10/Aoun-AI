import AdminDashboardClient from "@/components/admin/AdminDashboardClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";

interface AdminOverviewPageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const MONTHS_TO_SHOW = 6;

function formatMonthLabel(date: Date, lang: SupportedLang) {
  // map SupportedLang to a valid locale
  const locale = lang === "ar" ? "ar-EG" : "en-US";
  return date.toLocaleString(locale, { month: "short" });
}

const AdminOverviewPage = async ({ params }: AdminOverviewPageProps) => {
  const { lang } = await params;
  const { dict } = await getLangAndDict(params);

  const now = new Date();
  const startDate = new Date(
    now.getFullYear(),
    now.getMonth() - (MONTHS_TO_SHOW - 1),
    1,
  );

  // fetch counts and recent rows in parallel
  const [
    totalUsers,
    totalBots,
    recentUsers,
    recentSubscriptions,
    botsSince,
    usersSince,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.bot.count(),
    prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        image: true,
      },
    }),
    prisma.subscription.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        plan: { select: { id: true, title: true, price: true } },
      },
      where: {
        status: {
          in: ["ACTIVE"],
        },
      },
    }),
    // items for Agents Created Over Time aggregation
    prisma.bot.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    // items for New User Growth aggregation
    prisma.user.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Build month buckets
  const monthBuckets = Array.from({ length: MONTHS_TO_SHOW }).map((_, i) => {
    const d = new Date(
      now.getFullYear(),
      now.getMonth() - (MONTHS_TO_SHOW - 1 - i),
      1,
    );
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: formatMonthLabel(d, lang), agents: 0, newUsers: 0 };
  });

  // aggregate agents (bots)
  for (const b of botsSince) {
    const d = new Date(b.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthBuckets.find((m) => m.key === key);
    if (bucket) bucket.agents += 1;
  }

  // aggregate new users
  for (const u of usersSince) {
    const d = new Date(u.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthBuckets.find((m) => m.key === key);
    if (bucket) bucket.newUsers += 1;
  }

  const agentsSeries = monthBuckets.map((m) => ({
    month: m.label,
    agents: m.agents,
  }));
  const newUsersSeries = monthBuckets.map((m) => ({
    month: m.label,
    newUsers: m.newUsers || 0,
  }));

  const stats = {
    totalUsers,
    totalBots,
    avgResponseTime: 100,
    serverStatus: "Online",
  };

  // Map recentSubscriptions to serializable shape
  const recentSubscriptionsSerialized = recentSubscriptions.map((s) => ({
    id: s.id,
    user: s.user
      ? {
          id: s.user.id,
          name: s.user.name ?? s.user.email ?? "—",
          email: s.user.email,
          image: s.user.image,
        }
      : null,
    plan: s.plan
      ? { id: s.plan.id, title: s.plan.title, price: s.plan.price }
      : null,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <AdminDashboardClient
      lang={lang}
      dict={dict}
      stats={stats}
      recentUsers={recentUsers.map((u) => ({
        id: u.id,
        name: u.name ?? "—",
        email: u.email,
        createdAt: u.createdAt.toISOString(),
        image: u.image,
      }))}
      recentSubscriptions={recentSubscriptionsSerialized}
      agentsSeries={agentsSeries}
      newUsersSeries={newUsersSeries}
    />
  );
};

export default AdminOverviewPage;
