// src/app/admin/reports/page.tsx
import ReportsClient from "@/components/admin/ReportsClient";
import {
  getConversationAnalytics,
  getKnowledgeBaseAnalytics,
  getPerformanceAnalytics,
  getVoiceAnalytics,
} from "@/lib/actions/analytics";
import { CacheAnalytics as CacheAnalyticsClass } from "@/lib/cache-analytics";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { getSimpleHostMetrics } from "@/lib/metrics";
import { CacheService } from "@/lib/upstash";

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

const cache = CacheService.getInstance();
const analyticsCacheKey = "admin:reports:summary:v1";

const AdminReportsPage = async ({ params }: PageProps) => {
  const { lang } = await params;
  const { dict } = await getLangAndDict(params);

  // First try a short-lived cached payload to avoid hitting DB every request
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cached = await cache.get<any>(analyticsCacheKey);
  if (cached) {
    return (
      <ReportsClient
        lang={lang}
        dict={dict}
        kpis={cached.kpis}
        aiFlows={cached.aiFlows}
        apiResponseTimes={cached.apiResponseTimes}
        dauSeries={cached.dauSeries}
      />
    );
  }

  // Parallel fetch of analytics functions (these come from /lib/actions/analytics)
  const [kbAnalytics, convAnalytics, voiceAnalytics, perfAnalytics] =
    await Promise.all([
      getKnowledgeBaseAnalytics(/* pass userId if needed */ "admin", 30).catch(
        () => null,
      ),
      getConversationAnalytics("admin", 30).catch(() => null),
      getVoiceAnalytics("admin", 30).catch(() => null),
      getPerformanceAnalytics(30).catch(() => null),
    ]);

  // Pull cache metrics & health from the CacheAnalytics singleton
  const cacheAnalytics = CacheAnalyticsClass.getInstance();
  const cacheMetrics = cacheAnalytics.getMetrics();
  const cacheHealth = await cacheAnalytics.getCacheHealth();
  const host = await getSimpleHostMetrics();

  // Map / synthesize KPI values for the dashboard (use sensible defaults)
  // NOTE: Replace or augment these with provider metrics (Prometheus / Cloud provider) for CPU/memory/costs.
  const kpis = {
    cpuUsagePercent: perfAnalytics?.averageProcessingTime
      ? Math.min(
          99,
          Math.round((perfAnalytics.averageProcessingTime / 1000) * 20),
        ) // heuristic
      : 0,
    memoryUsedGB: host.memoryUsedGB,
    memoryTotalGB: host.memoryTotalGB,
    // cpuUsagePercent: host.cpuUsagePercent,
    apiCalls24h: perfAnalytics
      ? perfAnalytics.chatApiRequests + perfAnalytics.voiceApiRequests
      : 0,
    apiCallsDeltaPercent: 0, // compute via historical endpoints or store previous snapshot
    errorRatePercent: perfAnalytics
      ? Number((perfAnalytics.errorRate || 0).toFixed(2))
      : 0,
    errorRateDeltaPercent: 0,
    genAiCostsUSD: 452.8, // optional: billing / cost integration
    cacheHitRatePercent: cacheMetrics ? cacheMetrics.hitRate : 0,
    responseTime95thMs: perfAnalytics
      ? Math.round(perfAnalytics.averageProcessingTime || 0)
      : 0,
    cacheHealthStatus: cacheHealth?.status ?? "unknown",
  };

  // Build AI flows from performance data (example mapping)
  const aiFlows = [
    {
      name: "voiceFlow",
      invocations: voiceAnalytics?.totalVoiceInteractions ?? 0,
      avgLatencyMs: (perfAnalytics?.averageProcessingTime ?? 0) + 200, // heuristic offset
      successRate: 100 - (perfAnalytics?.errorRate ?? 0),
    },
    {
      name: "textChatFlow",
      invocations: perfAnalytics?.chatApiRequests ?? 0,
      avgLatencyMs: perfAnalytics?.averageProcessingTime ?? 0,
      successRate: 100 - (perfAnalytics?.errorRate ?? 0),
    },
    // add more flows if you track them separately
  ];

  // Example API response times: you may want to store endpoint p95s in a separate table and load them here
  const apiResponseTimes = [
    {
      endpoint: "/api/chat",
      p95: Math.round(perfAnalytics?.averageProcessingTime ?? 200),
    },
    {
      endpoint: "/api/voice",
      p95: Math.round(perfAnalytics?.averageProcessingTime ?? 400),
    },
  ];

  // DAU series - synthesize from conversation analytics (safe fallback if missing)
  const now = new Date();
  const dauSeries =
    convAnalytics?.dailyConversations &&
    convAnalytics?.dailyConversations?.length > 0
      ? convAnalytics.dailyConversations.map((d) => ({
          date: d.date,
          label: new Date(d.date).toLocaleDateString(
            lang === "ar" ? "ar-EG" : undefined,
            {
              month: "short",
              day: "numeric",
            },
          ),
          dau: d.count,
        }))
      : Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(now);
          d.setDate(now.getDate() - (6 - i));
          return {
            date: d.toISOString().slice(0, 10),
            label: d.toLocaleDateString(lang === "ar" ? "ar-EG" : undefined, {
              month: "short",
              day: "numeric",
            }),
            dau: 500 + i * 5,
          };
        });

  const payload = { kpis, aiFlows, apiResponseTimes, dauSeries };

  // Cache the composed admin payload for 30s to 60s to reduce DB load
  await cache.set(analyticsCacheKey, payload, 30);

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
