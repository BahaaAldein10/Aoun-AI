// components/admin/ReportsClient.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Dictionary } from "@/contexts/dictionary-context";
import type { SupportedLang } from "@/lib/dictionaries";
import { Download } from "lucide-react";
import { useMemo } from "react";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AIFlow = {
  name: string;
  invocations: number;
  avgLatencyMs: number;
  successRate: number;
};
type ApiTime = { endpoint: string; p95: number };
type KPIProps = {
  cpuUsagePercent: number;
  memoryUsedGB: number;
  memoryTotalGB: number;
  apiCalls24h: number;
  apiCallsDeltaPercent: number;
  errorRatePercent: number;
  errorRateDeltaPercent: number;
  genAiCostsUSD: number;
  cacheHitRatePercent: number;
  responseTime95thMs: number;
};

export default function ReportsClient({
  lang,
  dict,
  kpis,
  aiFlows,
  apiResponseTimes,
  dauSeries,
}: {
  lang: SupportedLang;
  dict: Dictionary;
  kpis: KPIProps;
  aiFlows: AIFlow[];
  apiResponseTimes: ApiTime[];
  dauSeries: { date: string; label: string; dau: number }[];
}) {
  const t = dict.admin_analytics;
  const isRtl = lang === "ar";
  const locale = lang === "ar" ? "ar-EG" : undefined;

  const currencyFormatter = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);

  const numberFormatter = (v: number) =>
    new Intl.NumberFormat(locale).format(v);

  const exportFlowsCsv = () => {
    const header = [
      "Flow Name",
      "Invocations",
      "Avg Latency (ms)",
      "Success Rate",
    ];
    const rows = aiFlows.map((f) => [
      f.name,
      f.invocations,
      f.avgLatencyMs,
      `${f.successRate}%`,
    ]);
    const csvRows = [header.join(",")].concat(
      rows.map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      ),
    );
    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-flows-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.exported_csv ?? "Exported");
  };

  const summaryCards = useMemo(
    () => [
      {
        id: "cpu",
        title: t.cpu_usage ?? "CPU Usage",
        value: `${kpis.cpuUsagePercent}%`,
        desc: t.cpu_usage_desc ?? "System CPU utilization",
      },
      {
        id: "memory",
        title: t.memory_usage ?? "Memory Usage",
        value: `${kpis.memoryUsedGB} GB`,
        desc: `${kpis.memoryUsedGB} GB of ${kpis.memoryTotalGB} GB total`,
      },
      {
        id: "api",
        title: t.api_calls_24h ?? "API Calls (24h)",
        value: numberFormatter(kpis.apiCalls24h),
        desc: `${kpis.apiCallsDeltaPercent >= 0 ? "+" : ""}${kpis.apiCallsDeltaPercent}% ${t.from_previous_day ?? "from previous day"}`,
      },
      {
        id: "error",
        title: t.error_rate ?? "Error Rate",
        value: `${kpis.errorRatePercent}%`,
        desc: `${kpis.errorRateDeltaPercent >= 0 ? "+" : ""}${kpis.errorRateDeltaPercent}% ${t.from_previous_day ?? "from previous day"}`,
      },
      {
        id: "genai",
        title: t.genai_costs ?? "GenAI Costs",
        value: currencyFormatter(kpis.genAiCostsUSD),
        desc: t.genai_month_to_date ?? "Estimated month-to-date",
      },
      {
        id: "cache",
        title: t.cache_hit_rate ?? "Cache Hit Rate",
        value: `${kpis.cacheHitRatePercent}%`,
        desc: t.cache_hit_rate_desc ?? "Reduced database lookups",
      },
    ],
    [kpis, t],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {t.title ?? "Advanced Performance Analytics"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t.description ?? "Live system & AI performance metrics"}
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaryCards.map((c) => (
          <Card key={c.id} className="p-4">
            <CardHeader className="p-0">
              <CardTitle className="text-sm">{c.title}</CardTitle>
            </CardHeader>
            <CardContent className="mt-2 p-0">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <div className="text-2xl font-bold">{c.value}</div>
                  <div className="text-muted-foreground text-sm">{c.desc}</div>
                </div>
                {/* small spark/gauge placeholder */}
                <div className="text-muted-foreground text-xs">
                  {/* optional small chart / sparkline */}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main charts area */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: API Response Times (Bar) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>
              {t.api_response_times_title ?? "API Response Times (95th %ile)"}
            </CardTitle>
            <CardDescription>
              {t.api_response_times_desc ??
                "95th percentile response times (ms) across key endpoints."}
            </CardDescription>
          </CardHeader>
          <CardContent dir="ltr">
            <div style={{ width: "100%", height: 320 }} dir="ltr">
              <ResponsiveContainer>
                <BarChart
                  data={apiResponseTimes}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 40, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
                  <XAxis type="number" stroke="var(--muted-foreground)" />
                  <YAxis
                    type="category"
                    dataKey="endpoint"
                    stroke="var(--muted-foreground)"
                    width={200}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value} ms`}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderRadius: "0.625rem",
                      borderColor: "var(--border)",
                      boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                    }}
                    labelStyle={{
                      color: "var(--foreground)",
                      fontWeight: "bold",
                    }}
                    itemStyle={{ color: "var(--primary)" }}
                  />
                  <Bar
                    dataKey="p95"
                    fill="var(--primary)"
                    barSize={18}
                    radius={[6, 6, 6, 6]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Right: Response Time KPI + DAU */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {t.response_time_overview ?? "Response Time (ms)"}
            </CardTitle>
            <CardDescription>
              {t.response_time_desc ??
                "95th percentile response times across key endpoints"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="text-3xl font-bold">
                {kpis.responseTime95thMs} ms
              </div>
              <div className="text-muted-foreground text-sm">
                {t.response_time_sub ?? "95th percentile"}
              </div>
            </div>

            <div style={{ width: "100%", height: 180 }} dir="ltr">
              <ResponsiveContainer>
                <LineChart
                  data={dauSeries.map((d) => ({ label: d.label, dau: d.dau }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" />
                  <YAxis stroke="var(--muted-foreground)" />
                  <Tooltip
                    formatter={(v: number) => numberFormatter(v)}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderRadius: "0.625rem",
                      borderColor: "var(--border)",
                      boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                    }}
                    labelStyle={{
                      color: "var(--foreground)",
                      fontWeight: "bold",
                    }}
                    itemStyle={{ color: "var(--primary)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="dau"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Flow Performance table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t.ai_flow_performance_title ?? "AI Flow Performance"}
          </CardTitle>
          <CardDescription>
            {t.ai_flow_performance_desc ??
              "Breakdown of performance for each flow."}
          </CardDescription>
        </CardHeader>
        <CardContent dir={isRtl ? "rtl" : "ltr"}>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-muted-foreground text-sm">
              {t.ai_flow_sub ?? "Flow invocations and latency"}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={exportFlowsCsv}>
                <Download className="mr-2 h-4 w-4" />{" "}
                {t.export_button ?? "Export CSV"}
              </Button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full">
              <thead className={isRtl ? "text-right" : "text-left"}>
                <tr className="text-muted-foreground text-xs">
                  <th className="py-2">{t.flow_name ?? "Flow Name"}</th>
                  <th className="py-2">{t.invocations ?? "Invocations"}</th>
                  <th className="py-2">{t.avg_latency ?? "Avg. Latency"}</th>
                  <th className="py-2">{t.success_rate ?? "Success Rate"}</th>
                </tr>
              </thead>
              <tbody>
                {aiFlows.map((f) => (
                  <tr key={f.name} className="border-t">
                    <td className="py-3 font-medium">{f.name}</td>
                    <td className="py-3">{numberFormatter(f.invocations)}</td>
                    <td className="py-3">{f.avgLatencyMs} ms</td>
                    <td className="py-3">
                      <Badge
                        variant={f.successRate >= 99 ? "default" : "secondary"}
                      >{`${f.successRate}%`}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
