/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/upstash.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Index } from "@upstash/vector";
import crypto from "crypto";
import { CacheAnalytics } from "./cache-analytics";

// Initialize Upstash services
export const redis = Redis.fromEnv();

// Rate limiters for different use cases
export const rateLimiters = {
  // Chat API - 60 requests per minute per user
  chat: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    analytics: true,
  }),

  // Voice API - 10 requests per minute per user (more expensive)
  voice: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    analytics: true,
  }),

  // Widget token generation - 5 per minute per IP
  widgetToken: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    analytics: true,
  }),

  // General API - 100 requests per minute per API key
  api: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "1 m"),
    analytics: true,
  }),

  // File upload - 3 per minute per user
  upload: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, "1 m"),
    analytics: true,
  }),
};

// Vector search index
export const vectorIndex = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
});

// Cache keys generator
export const cacheKeys = {
  chatResponse: (kbId: string, messageHash: string) =>
    `chat:${kbId}:${messageHash}`,
  embedding: (text: string) => `embed:${createHash(text)}`,
  kbMetadata: (kbId: string) => `kb:${kbId}:meta`,
  userPlan: (userId: string) => `user:${userId}:plan`,
  voiceProfile: (profileId: string) => `voice:${profileId}`,
  transcription: (audioHash: string) => `transcript:${audioHash}`,
  ttsAudio: (textHash: string, voiceId: string) => `tts:${textHash}:${voiceId}`,
} as const;

// Cache service with TTL management
export class CacheService {
  private static instance: CacheService;
  private analytics = CacheAnalytics.getInstance();

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  // Generic cache get/set with compression for large data
  async get<T>(key: string): Promise<T | null> {
    const start = Date.now();
    try {
      const cached = await redis.get(key);
      const responseTime = Date.now() - start;

      // record
      if (cached != null) {
        this.analytics.recordCacheHit(
          key.split(":")[0] || "generic",
          responseTime,
        );
      } else {
        this.analytics.recordCacheMiss(
          key.split(":")[0] || "generic",
          responseTime,
        );
      }

      if (cached == null) return null;
      if (typeof cached === "string") {
        try {
          return JSON.parse(cached) as T;
        } catch {
          return cached as unknown as T;
        }
      }
      return cached as T;
    } catch (error) {
      this.analytics.recordError();
      console.warn(`Cache get failed for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      const payload = typeof value === "string" ? value : JSON.stringify(value);
      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, payload);
      } else {
        await redis.set(key, payload);
      }
      return true;
    } catch (error) {
      console.warn(`Cache set failed for key ${key}:`, error);
      return false;
    }
  }

  // Batch operations for efficiency
  async mget(keys: string[]) {
    try {
      const results = await redis.mget(...keys); // array of string | null
      // parse each entry
      return (results ?? []).map((r) => {
        if (r == null) return null;
        if (typeof r === "string") {
          try {
            return JSON.parse(r);
          } catch {
            return r;
          }
        }
        return r;
      });
    } catch (error) {
      console.warn("Batch get failed:", error);
      return keys.map(() => null);
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.warn(`Cache delete failed for key ${key}:`, error);
      return false;
    }
  }

  // Specialized cache methods with appropriate TTLs
  async getChatResponse(kbId: string, messageHash: string) {
    return this.get<{ text: string; sources: any[]; timestamp: number }>(
      cacheKeys.chatResponse(kbId, messageHash),
    );
  }

  async setChatResponse(
    kbId: string,
    messageHash: string,
    response: { text: string; sources: any[] },
  ) {
    return this.set(
      cacheKeys.chatResponse(kbId, messageHash),
      { ...response, timestamp: Date.now() },
      3600, // 1 hour
    );
  }

  async getEmbedding(text: string) {
    return this.get<number[]>(cacheKeys.embedding(text));
  }

  async setEmbedding(text: string, embedding: number[]) {
    return this.set(
      cacheKeys.embedding(text),
      embedding,
      86400, // 24 hours - embeddings are stable
    );
  }

  async getKbMetadata(kbId: string) {
    return this.get<any>(cacheKeys.kbMetadata(kbId));
  }

  async setKbMetadata(kbId: string, metadata: any) {
    return this.set(
      cacheKeys.kbMetadata(kbId),
      metadata,
      1800, // 30 minutes - metadata can change
    );
  }

  async getUserPlan(userId: string) {
    return this.get<any>(cacheKeys.userPlan(userId));
  }

  async setUserPlan(userId: string, plan: any) {
    return this.set(
      cacheKeys.userPlan(userId),
      plan,
      3600, // 1 hour - plans don't change often
    );
  }

  async getTranscription(audioHash: string) {
    return this.get<string>(cacheKeys.transcription(audioHash));
  }

  async setTranscription(audioHash: string, transcript: string) {
    return this.set(
      cacheKeys.transcription(audioHash),
      transcript,
      86400, // 24 hours - transcriptions are deterministic
    );
  }

  async getTtsAudio(textHash: string, voiceId: string) {
    return this.get<string>(cacheKeys.ttsAudio(textHash, voiceId));
  }

  async setTtsAudio(textHash: string, voiceId: string, audioDataUrl: string) {
    return this.set(
      cacheKeys.ttsAudio(textHash, voiceId),
      audioDataUrl,
      7200, // 2 hours - TTS is expensive but audio files are large
    );
  }

  async mset(keyValues: Record<string, any>, ttl?: number) {
    try {
      const pipeline = redis.pipeline();

      Object.entries(keyValues).forEach(([key, value]) => {
        if (ttl) {
          pipeline.setex(key, ttl, JSON.stringify(value));
        } else {
          pipeline.set(key, JSON.stringify(value));
        }
      });

      await pipeline.exec();
      return true;
    } catch (error) {
      console.warn("Batch set failed:", error);
      return false;
    }
  }

  // Cache warming for frequently accessed data
  async warmCache(kbId: string) {
    try {
      // Pre-load KB metadata if not cached
      const metaKey = cacheKeys.kbMetadata(kbId);
      const cached = await this.get(metaKey);

      if (!cached) {
        // This would trigger a DB call to warm the cache
        console.log(`Warming cache for KB: ${kbId}`);
        // Implementation would depend on your data layer
      }
    } catch (error) {
      console.warn("Cache warming failed:", error);
    }
  }

  // Add helper methods for analytics that need cache access
  async persistAnalytics() {
    await this.analytics.persistMetrics(this);
  }

  async getAnalyticsHistory(days?: number) {
    return await this.analytics.getHistoricalMetrics(this, days);
  }
}

// Rate limiting helper function
export async function checkRateLimit(
  identifier: string,
  type: keyof typeof rateLimiters,
): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
}> {
  try {
    const result = await rateLimiters[type].limit(identifier);

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: new Date(result.reset),
    };
  } catch (error) {
    console.warn(`Rate limit check failed for ${type}:`, error);
    // Fail open - allow request but log the error
    return {
      success: true,
      limit: 0,
      remaining: 0,
      reset: new Date(),
    };
  }
}

// Hash helper for creating cache keys
export function createHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

// Utility to get user identifier for rate limiting
export function getUserIdentifier(req: Request, widgetPayload?: any): string {
  if (widgetPayload?.kbId) {
    return `widget:${widgetPayload.kbId}`;
  }

  const authHeader = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/, "");
  if (authHeader) {
    return `api:${createHash(authHeader)}`;
  }

  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `ip:${ip}`;
}
