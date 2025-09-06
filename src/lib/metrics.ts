// lib/metrics.ts
import os from "os";

/**
 * Simple synchronous snapshot of memory + CPU estimate.
 * Suitable for server-side pages / server functions.
 */
export async function getSimpleHostMetrics() {
  // memory (bytes -> GB)
  const mem = process.memoryUsage();
  const memoryUsedGB = +(mem.rss / 1024 / 1024 / 1024).toFixed(3);
  const memoryTotalGB = +(os.totalmem() / 1024 / 1024 / 1024).toFixed(3);

  // CPU estimate using 1-minute load average normalized by CPU count
  // Note: loadavg is Unix-specific; on Windows it returns [0,0,0].
  const cpus = os.cpus()?.length || 1;
  const load1 = os.loadavg()[0] ?? 0; // 1-minute load average
  const cpuUsagePercentByLoad = Math.min(
    100,
    +((load1 / cpus) * 100).toFixed(2),
  );

  // Optional: sample process.cpuUsage() for a short interval for process-level %
  // (see sampleProcessCpuPercent function below if you want that)

  return {
    memoryUsedGB,
    memoryTotalGB,
    cpuUsagePercent: cpuUsagePercentByLoad,
    cpus,
    load1,
  };
}

/**
 * Optional: more accurate process-level CPU % by sampling over a short interval.
 * Returns percent of total CPU (0-100). Uses process.cpuUsage diffs.
 */
export async function sampleProcessCpuPercent(intervalMs = 200) {
  const start = process.cpuUsage();
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, intervalMs));
  const diff = process.cpuUsage(start);
  const elapsedMs = Date.now() - t0;
  const userSysMicros = diff.user + diff.system; // microseconds
  const cpus = os.cpus()?.length || 1;

  // Convert microseconds -> milliseconds: /1000
  // Percent = (cpu-ms / (elapsed-ms * numCPUs)) * 100
  const cpuPercent = Math.min(
    100,
    (userSysMicros / 1000 / (elapsedMs * cpus)) * 100,
  );

  return Number(cpuPercent.toFixed(2));
}
