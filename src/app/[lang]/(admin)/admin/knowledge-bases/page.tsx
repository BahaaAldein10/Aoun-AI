// app/(admin)/knowledge-bases/page.tsx
import KnowledgeBasesClient from "@/components/admin/KnowledgeBasesClient";
import { KbMetadata } from "@/components/dashboard/KnowledgeBaseClient";
import { getLangAndDict, type SupportedLang } from "@/lib/dictionaries";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/upstash";

interface PageProps {
  params: Promise<{ lang: SupportedLang }>;
}

/**
 * Helper: compute total cached TTS audio bytes by scanning redis keys `tts:*`.
 * - Batches mget in groups to avoid huge single calls.
 * - Parses data URLs (data:audio/...;base64,...) to get actual binary size.
 * - Falls back gracefully to 0 if something fails.
 */
async function getCachedTtsTotalBytes(): Promise<number> {
  try {
    // NOTE: redis.keys can be expensive on very large keyspaces.
    // This is intended for admin pages (occasional use). If you expect
    // millions of keys, consider storing a daily aggregate in Redis/DB
    // when you setTtsAudio.
    const keys = (await redis.keys("tts:*")) as string[] | null;
    if (!Array.isArray(keys) || keys.length === 0) return 0;

    const BATCH = 200; // safe batch size for mget
    let total = 0;

    for (let i = 0; i < keys.length; i += BATCH) {
      const batch = keys.slice(i, i + BATCH);
      // upstash redis.mget accepts spread args
      const values = (await redis.mget(...batch)) as (string | null)[];

      for (const v of values) {
        if (!v) continue;

        // If value looks like a data URL (data:audio/...;base64,AAA...), extract base64 and compute bytes
        if (typeof v === "string") {
          const s = v.trim();
          if (s.startsWith("data:") && s.includes(",")) {
            const idx = s.indexOf(",");
            const b64 = s.slice(idx + 1);
            try {
              const buf = Buffer.from(b64, "base64");
              total += buf.length;
            } catch {
              // fallback to utf8 byte length if base64 parsing fails
              total += Buffer.byteLength(s, "utf8");
            }
          } else {
            // not a data URL — assume string payload (maybe JSON); measure string bytes
            total += Buffer.byteLength(s, "utf8");
          }
        }
      }
    }

    return total;
  } catch (err) {
    // non-fatal: return 0 and log server-side; admin UI will show best-effort number
    console.warn("getCachedTtsTotalBytes failed:", err);
    return 0;
  }
}

export default async function AdminKnowledgeBasesPage({ params }: PageProps) {
  const { lang, dict } = await getLangAndDict(params);

  // 1) fetch KB rows with owner
  const kbs = await prisma.knowledgeBase.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const initialKbs = kbs.map((kb) => ({
    ...kb,
    status: (kb.metadata as KbMetadata)?.url
      ? "URL"
      : ("UPLOAD" as "URL" | "UPLOAD"),
  }));

  // ----- Compute stats -----
  // Cache analytics (best-effort via in-process analytics singleton)
  let totalCachedItems = 0;
  let totalRequests = 0;
  let hitCount = 0;
  let cacheHitRate = 0;

  try {
    // lazy import to avoid potential circular import issues
    const { CacheAnalytics } = await import("@/lib/cache-analytics");
    const analytics = CacheAnalytics.getInstance();
    const metrics = analytics.getMetrics();
    hitCount = metrics.hits ?? 0;
    totalRequests = metrics.totalRequests ?? 0;
    cacheHitRate = metrics.hitRate ?? 0;
    totalCachedItems = Object.values(metrics.keysByType ?? {}).reduce(
      (s, n) => s + (Number(n) || 0),
      0,
    );
  } catch (err) {
    totalCachedItems = 0;
    totalRequests = 0;
    hitCount = 0;
    cacheHitRate = 0;
  }

  // Uploaded audio bytes (files you saved to UploadedFile)
  const audioSumAgg = await prisma.uploadedFile.aggregate({
    where: {
      OR: [
        { fileType: { contains: "audio", mode: "insensitive" } },
        { filename: { endsWith: ".mp3", mode: "insensitive" } },
        { filename: { endsWith: ".wav", mode: "insensitive" } },
        { filename: { endsWith: ".webm", mode: "insensitive" } },
        { filename: { endsWith: ".m4a", mode: "insensitive" } },
        { filename: { endsWith: ".ogg", mode: "insensitive" } },
      ],
    },
    _sum: { size: true },
  });
  const uploadedAudioBytes = Number(audioSumAgg._sum.size ?? 0);

  // Cached TTS audio bytes (from redis tts keys)
  const cachedAudioBytesFromCache = await getCachedTtsTotalBytes();

  const totalAudioBytes = uploadedAudioBytes + cachedAudioBytesFromCache;

  // other derived stats
  const totalKnowledgeBases = initialKbs.length;
  const totalDocumentsAgg = await prisma.document.aggregate({
    _count: { id: true },
  });
  const totalDocuments = Number(totalDocumentsAgg._count.id ?? 0);

  const stats = {
    totalCachedItems,
    totalRequests,
    hitCount,
    cacheHitRate,
    totalAudioBytes,
    uploadedAudioBytes,
    cachedAudioBytesFromCache,
    totalKnowledgeBases,
    totalDocuments,
  };

  return (
    <KnowledgeBasesClient
      initialKbs={initialKbs}
      lang={lang}
      dict={dict}
      stats={stats}
    />
  );
}
