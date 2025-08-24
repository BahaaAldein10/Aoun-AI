import ReportsClient from "@/components/admin/ReportsClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const AdminReportsPage = async ({ params }: PageProps) => {
  const { lang } = await params;
  const { dict } = await getLangAndDict(params);

  // --- TOP KPIs (replace with real telemetry) ---
  const kpis = {
    cpuUsagePercent: 34, // %
    memoryUsedGB: 5.8,
    memoryTotalGB: 8,
    apiCalls24h: 1250345,
    apiCallsDeltaPercent: 15.2, // positive = increase
    errorRatePercent: 0.12,
    errorRateDeltaPercent: -0.05,
    genAiCostsUSD: 452.8,
    cacheHitRatePercent: 89.2,
    responseTime95thMs: 210, // an overall 95th percentile sample
  };

  // --- AI Flow Performance (replace with DB/metrics) ---
  const aiFlows = [
    {
      name: "voiceFlow",
      invocations: 12530,
      avgLatencyMs: 450,
      successRate: 99.8,
    },
    {
      name: "textChatFlow",
      invocations: 45820,
      avgLatencyMs: 210,
      successRate: 99.9,
    },
    {
      name: "generateJsonFlow",
      invocations: 1200,
      avgLatencyMs: 1850,
      successRate: 98.5,
    },
    {
      name: "performActionTool",
      invocations: 58350,
      avgLatencyMs: 85,
      successRate: 100.0,
    },
  ];

  // --- API Response Times (95th percentile ms per endpoint) ---
  const apiResponseTimes = [
    { endpoint: "/api/call", p95: 350 },
    { endpoint: "/ai/flows/generateJson", p95: 700 },
    { endpoint: "/ai/flows/textChat", p95: 210 },
    { endpoint: "/api/auth/login", p95: 1400 },
    { endpoint: "/api/users", p95: 320 },
  ];

  // --- Daily Active Users (last 7 days) - example series (descending date order optional) ---
  const now = new Date();
  const dauSeries = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i)); // oldest -> newest
    // Example synthetic numbers — replace by real query to your analytics DB
    const offset = i === 6 ? 0 : Math.round(Math.random() * 200 - 50);
    const base = 520 + i * 10;
    return {
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(lang === "ar" ? "ar-EG" : undefined, {
        month: "short",
        day: "numeric",
      }),
      dau: base + offset,
    };
  });

  // optional: fetch top bots / other data via prisma here
  // const topBots = await prisma.bot.findMany({ take: 10, orderBy: [{ interactions: 'desc' }] });

  return (
    <ReportsClient
      lang={lang}
      dict={dict}
      kpis={kpis}
      aiFlows={aiFlows}
      apiResponseTimes={apiResponseTimes}
      dauSeries={dauSeries}
    />
  );
};

export default AdminReportsPage;
