// app/(admin)/reports/page.tsx
import ReportsClient from "@/components/admin/ReportsClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { getRecentInvocationMetrics } from "@/lib/monitoring/vercelMetrics";
import { prisma } from "@/lib/prisma";

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

/** percentile helper (linear interpolation) */
function percentile(values: number[], p: number) {
  if (!values || values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return Math.round(sorted[lo] * (1 - weight) + sorted[hi] * weight);
}

/** safe average */
function avg(values: number[]) {
  if (!values || values.length === 0) return 0;
  const s = values.reduce((a, b) => a + b, 0);
  return Math.round(s / values.length);
}

/** format endpoint stats for ReportsClient */
type EndpointStat = { endpoint: string; p95: number };

/**
 * Admin Reports page (server component)
 * - Uses aggregatedUsage (fast sums) + usage (detailed rows)
 * - Reads invocation-level samples from getRecentInvocationMetrics() for CPU/memory
 * - Estimates genAI costs using environment variables and available usage meta.
 */
export default async function AdminReportsPage({ params }: PageProps) {
  const { lang } = await params;
  const { dict } = await getLangAndDict(params);

  const now = new Date();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // helper to convert Date -> YYYY-MM-DD for aggregatedUsage day column
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // --- Use aggregatedUsage for quick site-wide sums (fast) ---
  const interactions24hAgg = await prisma.aggregatedUsage.aggregate({
    where: { day: { gte: dayKey(since24h) } },
    _sum: {
      interactions: true,
      website: true,
      whatsapp: true,
      facebook: true,
      voice: true,
      fallbackCount: true,
      negativeResponses: true,
      minutes: true,
    },
  });

  // Get previous 24h data for delta calculations
  const interactionsPrev24hAgg = await prisma.aggregatedUsage.aggregate({
    where: { day: { gte: dayKey(since48h), lt: dayKey(since24h) } },
    _sum: {
      interactions: true,
      fallbackCount: true,
      negativeResponses: true,
      minutes: true,
    },
  });

  const apiCalls24h = Number(interactions24hAgg._sum.interactions ?? 0);
  const prev24h = Number(interactionsPrev24hAgg._sum.interactions ?? 0);
  const apiCallsDeltaPercent =
    prev24h === 0
      ? apiCalls24h === 0
        ? 0
        : 100
      : Math.round(((apiCalls24h - prev24h) / prev24h) * 1000) / 10;

  const fallbackCount24h = Number(interactions24hAgg._sum.fallbackCount ?? 0);
  const negativeCount24h = Number(
    interactions24hAgg._sum.negativeResponses ?? 0,
  );
  const errorRatePercent =
    apiCalls24h === 0
      ? 0
      : Math.round(
          ((fallbackCount24h + negativeCount24h) / apiCalls24h) * 10000,
        ) / 100;

  // Calculate previous 24h error rate for delta
  const prevFallbackCount24h = Number(
    interactionsPrev24hAgg._sum.fallbackCount ?? 0,
  );
  const prevNegativeCount24h = Number(
    interactionsPrev24hAgg._sum.negativeResponses ?? 0,
  );
  const prevErrorRatePercent =
    prev24h === 0
      ? 0
      : Math.round(
          ((prevFallbackCount24h + prevNegativeCount24h) / prev24h) * 10000,
        ) / 100;

  const errorRateDeltaPercent =
    prevErrorRatePercent === 0
      ? errorRatePercent === 0
        ? 0
        : 100
      : Math.round(
          ((errorRatePercent - prevErrorRatePercent) / prevErrorRatePercent) *
            1000,
        ) / 10;

  // --- collect detailed recent usage rows (last 30 days) ---
  // Keep a cap to avoid huge memory usage; adjust `take` if you need more rows.
  const usageRows = await prisma.usage.findMany({
    where: { date: { gte: since30d } },
    select: { date: true, interactions: true, minutes: true, meta: true },
    orderBy: { date: "desc" },
    take: 20000,
  });

  // Collect response times and per-endpoint arrays
  const responseTimesAll: number[] = [];
  const responseTimesByEndpoint = new Map<string, number[]>();
  const responseTimesByChannel = new Map<string, number[]>();
  let cacheHits = 0;
  let cacheTotal = 0;

  // DAU buckets (last 7 days)
  const dauBuckets: Record<string, Set<string> | number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dauBuckets[d.toISOString().slice(0, 10)] = new Set<string>();
  }

  // Totals for token-based cost estimation (if present in usage.meta)
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalEmbeddingTokens = 0;
  let totalTtsOutputTokens = 0;
  let totalTtsChars = 0;
  let voiceMinutesFromRows = 0;
  let totalInteractionsFromRows = 0;

  for (const r of usageRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (r.meta ?? {}) as Record<string, any>;

    // Collect token counters if present in meta (support multiple key names)
    const addIfNumber = (val: unknown) =>
      typeof val === "number" && Number.isFinite(val) ? Number(val) : 0;

    // input tokens: try common keys
    totalInputTokens +=
      addIfNumber(meta.inputTokens) ||
      addIfNumber(meta.input_tokens) ||
      addIfNumber(meta.promptTokens) ||
      addIfNumber(meta.prompt_tokens) ||
      0;

    // output tokens
    totalOutputTokens +=
      addIfNumber(meta.outputTokens) ||
      addIfNumber(meta.output_tokens) ||
      addIfNumber(meta.completionTokens) ||
      addIfNumber(meta.completion_tokens) ||
      0;

    // embedding tokens
    totalEmbeddingTokens +=
      addIfNumber(meta.embeddingTokens) ||
      addIfNumber(meta.embedding_tokens) ||
      0;

    // TTS tokens or chars (may be present as replyLength)
    totalTtsOutputTokens +=
      addIfNumber(meta.ttsOutputTokens) ||
      addIfNumber(meta.tts_output_tokens) ||
      0;
    totalTtsChars +=
      addIfNumber(meta.replyLength) || addIfNumber(meta.reply_length) || 0;

    // minutes for voice (prefer meta.channel === 'voice' marker)
    const ch = typeof meta?.channel === "string" ? meta.channel : null;
    if (ch === "voice") {
      voiceMinutesFromRows += Number(r.minutes ?? 0);
    }

    // response time
    const rt =
      typeof meta?.responseTimeMs === "number"
        ? meta.responseTimeMs
        : undefined;
    if (typeof rt === "number" && Number.isFinite(rt)) {
      responseTimesAll.push(rt);

      const path =
        (typeof meta?.requestPath === "string" && meta.requestPath) ||
        (typeof meta?.endpoint === "string" && meta.endpoint) ||
        (typeof meta?.path === "string" && meta.path) ||
        "/unknown";

      const arr = responseTimesByEndpoint.get(path) ?? [];
      arr.push(rt);
      responseTimesByEndpoint.set(path, arr);

      const carrKey = ch ?? "unknown";
      const carr = responseTimesByChannel.get(carrKey) ?? [];
      carr.push(rt);
      responseTimesByChannel.set(carrKey, carr);
    }

    // cache flags
    if (meta?.cached) cacheHits++;
    cacheTotal++;

    // DAU identifiers: prefer hashed userIdentifier or clientId/session
    const dKey = new Date(r.date).toISOString().slice(0, 10);
    const bucket = dauBuckets[dKey];
    const uid =
      (typeof meta?.userIdentifier === "string" && meta.userIdentifier) ||
      (typeof meta?.clientId === "string" && meta.clientId) ||
      (typeof meta?.sessionId === "string" && meta.sessionId) ||
      null;

    if (bucket instanceof Set) {
      if (uid) bucket.add(uid);
      // else leave set; fall back later to interactions count
    }

    totalInteractionsFromRows += Number(r.interactions ?? 0);
  }

  const cacheHitRatePercent =
    cacheTotal === 0 ? 0 : Math.round((cacheHits / cacheTotal) * 10000) / 100;
  const responseTime95thMs = responseTimesAll.length
    ? percentile(responseTimesAll, 95)
    : 0;

  // --- AI Flow metrics (approx from aggregated channel counts + latencies) ---
  const websiteInvocations = Number(interactions24hAgg._sum.website ?? 0);
  const whatsappInvocations = Number(interactions24hAgg._sum.whatsapp ?? 0);
  const facebookInvocations = Number(interactions24hAgg._sum.facebook ?? 0);
  const voiceInvocations = Number(interactions24hAgg._sum.voice ?? 0);

  const voiceLatencies = responseTimesByChannel.get("voice") ?? [];
  const websiteLatencies = responseTimesByChannel.get("website") ?? [];
  const whatsappLatencies = responseTimesByChannel.get("whatsapp") ?? [];
  const facebookLatencies = responseTimesByChannel.get("facebook") ?? [];

  const totalInvocationsText =
    websiteInvocations + whatsappInvocations + facebookInvocations;

  const aiFlows = [
    {
      name: "voiceFlow",
      invocations: voiceInvocations,
      avgLatencyMs: voiceLatencies.length ? Math.round(avg(voiceLatencies)) : 0,
      successRate:
        voiceInvocations === 0
          ? 100
          : Math.round(
              (1 -
                (fallbackCount24h + negativeCount24h) /
                  Math.max(1, apiCalls24h)) *
                10000,
            ) / 100,
    },
    {
      name: "textChatFlow",
      invocations: totalInvocationsText,
      avgLatencyMs:
        totalInvocationsText === 0
          ? 0
          : Math.round(
              avg([
                ...websiteLatencies,
                ...whatsappLatencies,
                ...facebookLatencies,
              ]),
            ),
      successRate:
        totalInvocationsText === 0
          ? 100
          : Math.round(
              (1 -
                (fallbackCount24h + negativeCount24h) /
                  Math.max(1, apiCalls24h)) *
                10000,
            ) / 100,
    },
  ];

  // --- API response times: top endpoints by invocation (p95) ---
  const endpointStats = Array.from(responseTimesByEndpoint.entries())
    .map(([path, arr]) => ({
      endpoint: path,
      invocations: arr.length,
      p95: percentile(arr, 95),
    }))
    .sort((a, b) => b.invocations - a.invocations)
    .slice(0, 8);

  // --- DAU series (last 7 days) ---
  const dauSeries: { date: string; label: string; dau: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const bucket = dauBuckets[key];
    let dau = 0;
    if (bucket instanceof Set) {
      dau = bucket.size;
    }
    if (dau === 0) {
      // fallback to interactions count for that day
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const interactionsForDay = usageRows
        .filter((r) => {
          const dd = new Date(r.date);
          return dd >= dayStart && dd < dayEnd;
        })
        .reduce((s, r) => s + (r.interactions ?? 0), 0);
      dau = interactionsForDay;
    }

    dauSeries.push({
      date: key,
      label: d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
        month: "short",
        day: "numeric",
      }),
      dau,
    });
  }

  // ---------------------------
  // Gen-AI cost estimation (no provider-based payment lookup)
  // ---------------------------
  // Environment driven rates (set these in Vercel for best accuracy)
  // Defaults chosen as reasonable starting points (override in ENV)
  const COST_GPT4O_INPUT_PER_M = Number(
    process.env.ESTIMATED_COST_GPT4O_MINI_INPUT_PER_MILLION_TOKENS_USD ?? 0.15,
  );
  const COST_GPT4O_OUTPUT_PER_M = Number(
    process.env.ESTIMATED_COST_GPT4O_MINI_OUTPUT_PER_MILLION_TOKENS_USD ?? 0.6,
  );
  const COST_EMBEDDING_PER_M = Number(
    process.env
      .ESTIMATED_COST_EMBEDDINGS_TEXT_EMBEDDING_3_SMALL_PER_MILLION_TOKENS_USD ??
      0.02,
  );
  const COST_WHISPER_PER_MIN = Number(
    process.env.ESTIMATED_COST_WHISPER_PER_AUDIO_MINUTE_USD ?? 0.006,
  );
  const COST_TTS_PER_M = Number(
    process.env.ESTIMATED_COST_TTS_GPT4O_MINI_PER_MILLION_OUTPUT_TOKENS_USD ??
      12.0,
  );
  const COST_PER_INTERACTION = Number(
    process.env.ESTIMATED_OPENAI_COST_PER_INTERACTION_USD ?? 0.0005,
  );

  // Sum available token/minute counters:
  // - totals from usageRows we computed above
  // - voice minutes: prefer voiceMinutesFromRows (from per-row minutes when channel === 'voice')
  // - if tokens are missing, fallback to interactions * cost per interaction
  const totalInputTokensNormalized = Math.max(0, totalInputTokens);
  const totalOutputTokensNormalized = Math.max(0, totalOutputTokens);
  const totalEmbeddingTokensNormalized = Math.max(0, totalEmbeddingTokens);

  // TTS tokens: prefer explicit, otherwise derive from replyLength/characters
  let ttsTokens = Math.max(0, totalTtsOutputTokens);
  if (ttsTokens === 0 && totalTtsChars > 0) {
    // approximate tokens from chars (~4 chars per token)
    ttsTokens = Math.ceil(totalTtsChars / 4);
  }

  // voice minutes: prefer our computed voiceMinutesFromRows; fallback to aggregatedUsage minutes for last 30d
  const minutesAgg30d = await prisma.aggregatedUsage.aggregate({
    where: { day: { gte: dayKey(since30d) } },
    _sum: { minutes: true, interactions: true },
  });
  const totalMinutesAgg = Number(minutesAgg30d._sum.minutes ?? 0);
  const totalInteractionsAgg = Number(
    minutesAgg30d._sum.interactions ?? totalInteractionsFromRows,
  );

  const voiceMinutes =
    voiceMinutesFromRows > 0 ? voiceMinutesFromRows : totalMinutesAgg;

  // compute costs
  let genAiCostsUSD = 0;

  // text generation (input + output tokens)
  genAiCostsUSD +=
    (totalInputTokensNormalized / 1_000_000) * COST_GPT4O_INPUT_PER_M;
  genAiCostsUSD +=
    (totalOutputTokensNormalized / 1_000_000) * COST_GPT4O_OUTPUT_PER_M;

  // embeddings
  genAiCostsUSD +=
    (totalEmbeddingTokensNormalized / 1_000_000) * COST_EMBEDDING_PER_M;

  // STT (Whisper) on voice minutes
  genAiCostsUSD += voiceMinutes * COST_WHISPER_PER_MIN;

  // TTS
  genAiCostsUSD += (ttsTokens / 1_000_000) * COST_TTS_PER_M;

  // If we found nothing to base estimate on, fallback to per-interaction estimate
  const hasMeaningfulTokenOrMinutes =
    totalInputTokensNormalized > 0 ||
    totalOutputTokensNormalized > 0 ||
    totalEmbeddingTokensNormalized > 0 ||
    ttsTokens > 0 ||
    voiceMinutes > 0;

  if (!hasMeaningfulTokenOrMinutes) {
    // fallback to interactions-based estimate for 30d window
    const interactionsFor30d =
      totalInteractionsAgg || totalInteractionsFromRows || 0;
    genAiCostsUSD = Number(
      (interactionsFor30d * COST_PER_INTERACTION).toFixed(2),
    );
  } else {
    genAiCostsUSD = Number(genAiCostsUSD.toFixed(2));
  }

  // --- Invocation-level metrics (Vercel-friendly) ---
  // read recent invocation samples stored by recordInvocationMetrics()
  let invocationSamples: Array<Record<string, number>> = [];
  try {
    invocationSamples = (await getRecentInvocationMetrics()) ?? [];
  } catch (err) {
    // non-fatal — keep empty
    console.warn("Failed to read invocation samples:", err);
    invocationSamples = [];
  }

  // compute cpu p50/p95 from samples (single-core estimates)
  const cpuArr = invocationSamples
    .map((s) =>
      typeof s?.cpuPercentSingleCore === "number" ? s.cpuPercentSingleCore : 0,
    )
    .filter((n) => typeof n === "number" && !Number.isNaN(n));
  const cpuP95 = cpuArr.length ? percentile(cpuArr, 95) : 0;
  const latestSample = invocationSamples.length ? invocationSamples[0] : null;
  const memoryUsedGB = latestSample ? (latestSample.memoryRssGB ?? 0) : 0;
  const memoryTotalGB = latestSample
    ? (latestSample.memoryLimitGB ??
      Number(
        process.env.ADMIN_FUNCTION_MEMORY_MB
          ? Number(process.env.ADMIN_FUNCTION_MEMORY_MB) / 1024
          : 0,
      ))
    : 0;

  // Build KPI object
  const kpis = {
    cpuUsagePercent: cpuP95, // show p95 single-core estimate
    memoryUsedGB,
    memoryTotalGB,
    apiCalls24h,
    apiCallsDeltaPercent,
    errorRatePercent,
    errorRateDeltaPercent,
    genAiCostsUSD,
    cacheHitRatePercent,
    responseTime95thMs,
  };

  // Format endpoint stats for client
  const apiResponseTimes: EndpointStat[] = endpointStats.map((e) => ({
    endpoint: e.endpoint,
    p95: e.p95,
  }));

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
}
