/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/cache-analytics.ts

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  avgResponseTime: number;
  keysByType: Record<string, number>;
  rateLimitHits: Record<string, number>;
  errorRate: number;
}

export class CacheAnalytics {
  private static instance: CacheAnalytics;

  // Metrics tracking
  private metrics = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
    responseTimeSum: 0,
    errors: 0,
    rateLimitHits: new Map<string, number>(),
    keysByType: new Map<string, number>(),
  };

  private constructor() {
    // Remove the circular dependency - don't initialize cache here
  }

  static getInstance(): CacheAnalytics {
    if (!CacheAnalytics.instance) {
      CacheAnalytics.instance = new CacheAnalytics();
    }
    return CacheAnalytics.instance;
  }

  // Track cache hit/miss
  recordCacheHit(keyType: string, responseTime: number) {
    this.metrics.hits++;
    this.metrics.totalRequests++;
    this.metrics.responseTimeSum += responseTime;

    const currentCount = this.metrics.keysByType.get(keyType) || 0;
    this.metrics.keysByType.set(keyType, currentCount + 1);
  }

  recordCacheMiss(keyType: string, responseTime: number) {
    this.metrics.misses++;
    this.metrics.totalRequests++;
    this.metrics.responseTimeSum += responseTime;

    const currentCount = this.metrics.keysByType.get(keyType) || 0;
    this.metrics.keysByType.set(keyType, currentCount + 1);
  }

  recordRateLimitHit(limiterType: string) {
    const current = this.metrics.rateLimitHits.get(limiterType) || 0;
    this.metrics.rateLimitHits.set(limiterType, current + 1);
  }

  recordError() {
    this.metrics.errors++;
  }

  // Get current metrics
  getMetrics(): CacheMetrics {
    const hitRate =
      this.metrics.totalRequests > 0
        ? (this.metrics.hits / this.metrics.totalRequests) * 100
        : 0;

    const avgResponseTime =
      this.metrics.totalRequests > 0
        ? this.metrics.responseTimeSum / this.metrics.totalRequests
        : 0;

    const errorRate =
      this.metrics.totalRequests > 0
        ? (this.metrics.errors / this.metrics.totalRequests) * 100
        : 0;

    return {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      hitRate: Number(hitRate.toFixed(2)),
      totalRequests: this.metrics.totalRequests,
      avgResponseTime: Number(avgResponseTime.toFixed(2)),
      keysByType: Object.fromEntries(this.metrics.keysByType),
      rateLimitHits: Object.fromEntries(this.metrics.rateLimitHits),
      errorRate: Number(errorRate.toFixed(2)),
    };
  }

  // Reset metrics (useful for periodic reporting)
  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      responseTimeSum: 0,
      errors: 0,
      rateLimitHits: new Map(),
      keysByType: new Map(),
    };
  }

  // Get cache health status
  async getCacheHealth(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    details: Record<string, unknown>;
  }> {
    const metrics = this.getMetrics();

    // Define health thresholds
    const healthyHitRate = 60; // 60% hit rate is good
    const healthyErrorRate = 5; // 5% error rate is acceptable
    const healthyResponseTime = 100; // 100ms average response time

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    const issues: string[] = [];

    if (metrics.hitRate < healthyHitRate) {
      status = "degraded";
      issues.push(
        `Low cache hit rate: ${metrics.hitRate}% (target: ${healthyHitRate}%)`,
      );
    }

    if (metrics.errorRate > healthyErrorRate) {
      status = "unhealthy";
      issues.push(
        `High error rate: ${metrics.errorRate}% (limit: ${healthyErrorRate}%)`,
      );
    }

    if (metrics.avgResponseTime > healthyResponseTime) {
      status = status === "unhealthy" ? "unhealthy" : "degraded";
      issues.push(
        `Slow response time: ${metrics.avgResponseTime}ms (target: <${healthyResponseTime}ms)`,
      );
    }

    return {
      status,
      details: {
        metrics,
        issues,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Store metrics in Redis for persistence - now takes cache as parameter
  async persistMetrics(cache: any) {
    try {
      const metrics = this.getMetrics();
      const timestamp = new Date().toISOString();

      await cache.set(
        `metrics:${timestamp.split("T")[0]}`, // daily metrics
        {
          ...metrics,
          timestamp,
        },
        86400, // 24 hours
      );

      // Also store latest metrics
      await cache.set(
        "metrics:latest",
        {
          ...metrics,
          timestamp,
        },
        3600,
      ); // 1 hour
    } catch (error) {
      console.warn("Failed to persist metrics:", error);
    }
  }

  // Get historical metrics for dashboard - now takes cache as parameter
  async getHistoricalMetrics(
    cache: any,
    days: number = 7,
  ): Promise<CacheMetrics[]> {
    try {
      const dates = Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        return date.toISOString().split("T")[0];
      });

      const keys = dates.map((date) => `metrics:${date}`);
      const results = (await cache.mget(keys)) as (string | null)[];

      return results
        .filter((result): result is string => result !== null)
        .map((result) => JSON.parse(result) as CacheMetrics);
    } catch (error) {
      console.warn("Failed to get historical metrics:", error);
      return [];
    }
  }

  // Cache warming strategies - now takes cache as parameter
  async warmPopularContent(cache: any) {
    try {
      // Get most accessed KBs from recent usage
      const popularKbs = await this.getPopularKnowledgeBases();

      for (const kbId of popularKbs) {
        await cache.warmCache(kbId);
      }

      console.log(`Cache warmed for ${popularKbs.length} knowledge bases`);
    } catch (error) {
      console.warn("Cache warming failed:", error);
    }
  }

  private async getPopularKnowledgeBases(): Promise<string[]> {
    // This would query your usage table to find most active KBs
    // For now, return empty array - implement based on your usage patterns
    return [];
  }

  // Cleanup expired cache entries (run periodically)
  async cleanup() {
    try {
      // This is handled automatically by Redis TTL, but you could
      // implement custom cleanup logic here if needed
      console.log("Cache cleanup completed");
    } catch (error) {
      console.warn("Cache cleanup failed:", error);
    }
  }
}

// Middleware wrapper for tracking cache performance
export function withCacheTracking<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyType: string,
): T {
  return (async (...args: any[]) => {
    const analytics = CacheAnalytics.getInstance();
    const startTime = Date.now();

    try {
      const result = await fn(...args);
      const responseTime = Date.now() - startTime;

      // Determine if this was a cache hit or miss based on the result
      // This is a simplified check - adjust based on your implementation
      const wasCacheHit = result?.cached === true;

      if (wasCacheHit) {
        analytics.recordCacheHit(keyType, responseTime);
      } else {
        analytics.recordCacheMiss(keyType, responseTime);
      }

      return result;
    } catch (error) {
      analytics.recordError();
      throw error;
    }
  }) as T;
}

// API endpoint for cache metrics (add to your routes)
export async function getCacheMetricsAPI(cache: any) {
  const analytics = CacheAnalytics.getInstance();
  const metrics = analytics.getMetrics();
  const health = await analytics.getCacheHealth();
  const historical = await analytics.getHistoricalMetrics(cache, 7);

  return {
    current: metrics,
    health,
    historical,
    recommendations: generateOptimizationRecommendations(metrics),
  };
}

function generateOptimizationRecommendations(metrics: CacheMetrics): string[] {
  const recommendations: string[] = [];

  if (metrics.hitRate < 60) {
    recommendations.push(
      "Consider increasing cache TTL values for frequently accessed data",
    );
    recommendations.push(
      "Review cache invalidation strategy - may be too aggressive",
    );
  }

  if (metrics.avgResponseTime > 100) {
    recommendations.push(
      "Consider using Redis pipelining for batch operations",
    );
    recommendations.push("Review cache key complexity and size");
  }

  if (metrics.errorRate > 5) {
    recommendations.push(
      "Implement circuit breaker pattern for cache failures",
    );
    recommendations.push("Add fallback mechanisms when cache is unavailable");
  }

  const totalRateLimitHits = Object.values(metrics.rateLimitHits).reduce(
    (a, b) => a + b,
    0,
  );
  if (totalRateLimitHits > metrics.totalRequests * 0.1) {
    recommendations.push("Consider adjusting rate limit thresholds");
    recommendations.push("Implement rate limit bypass for trusted clients");
  }

  return recommendations;
}
