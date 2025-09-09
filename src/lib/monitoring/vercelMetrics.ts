// src/lib/monitoring/vercelMetrics.ts
"use server";

/**
 * Simple Vercel-friendly invocation metric recorder.
 *
 * - Records: timestamp, memoryRssBytes, memoryRssGB, memoryLimitGB (from env),
 *   cpuPercentSingleCore (estimate for this invocation), elapsedMs, llmResponseMs (if provided),
 *   userId, botId (optional).
 *
 * - Persists last N records in your CacheService under key "admin:metrics:recent".
 *   The CacheService is assumed to expose get(key) and set(key, value, ttlSec).
 *
 * Usage pattern:
 *   const ctx = startInvocation();
 *   // ... do LLM call ...
 *   await recordInvocationMetrics(ctx, { llmResponseMs, userId, botId });
 */

const METRICS_KEY = "admin:metrics:recent";
const MAX_SAMPLES = Number(process.env.ADMIN_METRICS_SAMPLES ?? 120); // default keep ~120 samples
const TTL_SECONDS = Number(process.env.ADMIN_METRICS_TTL_SEC ?? 60 * 60 * 6); // keep 6 hours by default

export async function startInvocation() {
  return {
    startWallMs: Date.now(),
    startCpu: process.cpuUsage(), // snapshot to compute delta later (microseconds)
  };
}

/** bytes -> GB */
function bytesToGb(b: number) {
  return Number((b / 1024 ** 3).toFixed(4));
}

/**
 * Estimate CPU percent for this invocation (single-core estimate).
 * - procDeltaMicro = (user+system) microseconds from process.cpuUsage delta
 * - elapsedMs = wall clock elapsed
 * cpuPercentSingleCore = (procDeltaMs / elapsedMs) * 100
 *
 * Note: this is per-invocation and approximates % of a single core used during the time window.
 */
function estimateCpuPercent(startCpu: NodeJS.CpuUsage, elapsedMs: number) {
  const delta = process.cpuUsage(startCpu);
  const procDeltaMicros = (delta.user ?? 0) + (delta.system ?? 0); // microseconds
  const procDeltaMs = procDeltaMicros / 1000;
  if (!isFinite(procDeltaMs) || elapsedMs <= 0) return 0;
  const percentSingleCore = (procDeltaMs / elapsedMs) * 100;
  // clamp and round
  const p = Math.max(0, Math.min(1000, percentSingleCore));
  return Math.round(p * 100) / 100; // two decimals
}

/**
 * Record a metric sample and persist to cache (Upstash CacheService).
 * extra: { llmResponseMs?: number, userId?: string, botId?: string, tag?: string }
 */
export async function recordInvocationMetrics(
  ctx: { startWallMs: number; startCpu: NodeJS.CpuUsage },
  extra: {
    llmResponseMs?: number;
    userId?: string;
    botId?: string;
    tag?: string;
  } = {},
) {
  // dynamic import to avoid circulars / keep module lazy
  const upstash = await import("@/lib/upstash").catch(() => null);
  if (!upstash) {
    // nothing to persist; return the sample for caller to do whatever they want
    return buildSample(ctx, extra);
  }

  const { CacheService } = upstash;
  const cache = CacheService.getInstance?.() ?? CacheService;

  const elapsedMs = Date.now() - ctx.startWallMs;
  const cpuPercent = estimateCpuPercent(ctx.startCpu, elapsedMs);

  // process memory
  const mem = process.memoryUsage();
  const rss = mem.rss ?? 0;
  const rssGb = bytesToGb(rss);

  // memory limit — serverless: read from env (recommended to set in Vercel)
  // You should set ADMIN_FUNCTION_MEMORY_MB or use known configured memory (see Vercel settings).
  const configuredMb = Number(
    process.env.ADMIN_FUNCTION_MEMORY_MB ?? process.env.FUNCTION_MEMORY_MB ?? 0,
  );
  const memoryLimitGB =
    configuredMb > 0 ? Number((configuredMb / 1024).toFixed(3)) : null;

  const sample = {
    ts: new Date().toISOString(),
    elapsedMs,
    cpuPercentSingleCore: cpuPercent,
    memoryRssBytes: rss,
    memoryRssGB: rssGb,
    memoryLimitGB,
    llmResponseMs:
      typeof extra.llmResponseMs === "number" ? extra.llmResponseMs : null,
    userId: extra.userId ?? null,
    botId: extra.botId ?? null,
    tag: extra.tag ?? null,
  };

  // Persist recent samples array (get -> push -> slice -> set)
  try {
    const key = METRICS_KEY;
    const existing = await cache.get(key);
    let arr = Array.isArray(existing) ? existing : [];
    arr.unshift(sample); // newest first
    if (arr.length > MAX_SAMPLES) arr = arr.slice(0, MAX_SAMPLES);
    await cache.set(key, arr, TTL_SECONDS);
  } catch (err) {
    // non-fatal: log and continue
    try {
      console.warn("recordInvocationMetrics: failed to save metrics:", err);
    } catch {}
  }

  return sample;
}

/** build a sample without persisting (fallback) */
export async function buildSample(
  ctx: { startWallMs: number; startCpu: NodeJS.CpuUsage },
  extra: Record<string, unknown> = {},
) {
  const elapsedMs = Date.now() - ctx.startWallMs;
  const cpuPercent = estimateCpuPercent(ctx.startCpu, elapsedMs);
  const mem = process.memoryUsage();
  const rss = mem.rss ?? 0;
  const rssGb = bytesToGb(rss);
  const configuredMb = Number(
    process.env.ADMIN_FUNCTION_MEMORY_MB ?? process.env.FUNCTION_MEMORY_MB ?? 0,
  );
  const memoryLimitGB =
    configuredMb > 0 ? Number((configuredMb / 1024).toFixed(3)) : null;

  return {
    ts: new Date().toISOString(),
    elapsedMs,
    cpuPercentSingleCore: cpuPercent,
    memoryRssBytes: rss,
    memoryRssGB: rssGb,
    memoryLimitGB,
    llmResponseMs:
      typeof extra.llmResponseMs === "number" ? extra.llmResponseMs : null,
    userId: extra.userId ?? null,
    botId: extra.botId ?? null,
    tag: extra.tag ?? null,
  };
}

/** read recent samples (for admin UI) */
export async function getRecentInvocationMetrics() {
  const upstash = await import("@/lib/upstash").catch(() => null);
  if (!upstash) return [];
  const { CacheService } = upstash;
  const cache = CacheService.getInstance?.() ?? CacheService;
  try {
    const arr = await cache.get(METRICS_KEY);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.warn("getRecentInvocationMetrics failed:", err);
    return [];
  }
}
