// src/lib/admin/monitoring.ts
"use server";

import { prisma } from "@/lib/prisma";

/**
 * Compute average response time (ms) from usage.meta.responseTimeMs for a user.
 * - minutesWindow: lookback window in minutes (default 60*24 = last 24h)
 * - returns null if no measurements found
 */
export async function getAvgResponseTime(
  userId: string,
  minutesWindow = 60 * 24,
) {
  if (!userId) return null;

  try {
    const since = new Date(Date.now() - minutesWindow * 60 * 1000);

    // Fetch usage rows in window that have meta.responseTimeMs set.
    // We fetch meta and compute average client-side (Prisma cannot aggregate JSON fields easily).
    const rows = await prisma.usage.findMany({
      where: {
        userId,
        date: { gte: since },
      },
      select: {
        meta: true,
      },
      orderBy: { date: "desc" },
      take: 5000, // safety cap
    });

    let sum = 0;
    let count = 0;
    for (const r of rows) {
      try {
        const meta = (r.meta as Record<string, unknown>) ?? {};
        const v = meta?.["responseTimeMs"];
        const n =
          typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
        if (!Number.isNaN(n) && Number.isFinite(n)) {
          sum += n;
          count++;
        }
      } catch {
        continue;
      }
    }

    if (count === 0) return null;
    return Math.round(sum / count); // average ms, rounded
  } catch (err) {
    console.warn("getAvgResponseTime error:", err);
    return null;
  }
}

/**
 * Lightweight server/service health checks returned as an object.
 * - db: boolean + message
 * - cache: boolean + message (uses CacheService if available)
 * - openai: boolean + message (simple models query)
 * - vector: best-effort boolean + message (if upstash/pinecone client exists)
 *
 * This is non-blocking best-effort — any failed check returns a helpful message.
 */
export async function getServerStatus() {
  const status: Record<string, { ok: boolean; details?: string }> = {
    db: { ok: false, details: "unknown" },
    cache: { ok: false, details: "unknown" },
    openai: { ok: false, details: "unknown" },
    vector: { ok: false, details: "unknown" },
  };

  // 1) DB check (Prisma)
  try {
    // cheap read to ensure DB connection is alive
    await prisma.user.findFirst({ select: { id: true }, take: 1 });
    status.db = { ok: true, details: "Connected" };
  } catch (err: unknown) {
    status.db = {
      ok: false,
      details: `DB error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 2) Cache (upstash / redis) — try dynamic import to avoid hard dependency
  try {
    const upstash = await import("@/lib/upstash");
    const { CacheService } = upstash;
    const cache = CacheService.getInstance();

    // try a very small set/get - some cache backends implement .get/.setTtsAudio etc.
    if (typeof cache.get === "function" && typeof cache.set === "function") {
      const hk = `health:${Date.now()}`;
      await cache.set(hk, "ok", 5); // 5s TTL
      const v = await cache.get(hk);
      if (v === "ok") {
        status.cache = { ok: true, details: "Cache OK" };
      } else {
        status.cache = { ok: false, details: "Cache read/write mismatch" };
      }
    } else {
      status.cache = { ok: false, details: "Cache client missing get/set" };
    }
  } catch (err: unknown) {
    status.cache = {
      ok: false,
      details: `Cache error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 3) OpenAI check (best-effort, small request)
  try {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      status.openai = { ok: false, details: "No OPENAI_API_KEY configured" };
    } else {
      // Query the models list (lightweight) - if rate-limited this may still return 200 with info
      const res = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      });
      if (res.ok) {
        status.openai = { ok: true, details: "OpenAI reachable" };
      } else {
        const txt = await res.text().catch(() => "");
        status.openai = {
          ok: false,
          details: `OpenAI error ${res.status}: ${txt.slice(0, 200)}`,
        };
      }
    }
  } catch (err: unknown) {
    status.openai = {
      ok: false,
      details: `OpenAI error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4) Vector DB (best-effort)
  try {
    const upstashVectorModule = await import("@/lib/upstash-vector").catch(
      () => null,
    );
    if (upstashVectorModule && upstashVectorModule.default) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = (upstashVectorModule as any).default;
      // try to call a light method if available
      if (typeof client.health === "function") {
        const info = await client.health();
        status.vector = { ok: true, details: `Vector OK: ${String(info)}` };
      } else if (typeof client.info === "function") {
        const info = await client.info();
        status.vector = { ok: true, details: "Vector OK" };
      } else {
        // fallback: mark unknown but reachable (client loaded)
        status.vector = {
          ok: true,
          details: "Vector client loaded (no health method)",
        };
      }
    } else {
      status.vector = { ok: false, details: "Vector client not configured" };
    }
  } catch (err: unknown) {
    status.vector = {
      ok: false,
      details: `Vector error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // derive overall status
  const allOk = Object.values(status).every((s) => s.ok);
  return {
    status: allOk ? "Online" : "Degraded",
    details: status,
  };
}
