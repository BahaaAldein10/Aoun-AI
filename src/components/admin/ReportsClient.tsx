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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Dictionary } from "@/contexts/dictionary-context";
import type { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { useMemo } from "react";
import toast from "react-hot-toast";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type BotStat = {
  id: string;
  name: string;
  interactions: number;
  accuracy: number;
  status: "Active" | "Inactive" | "Disabled";
};

const ReportsClient = ({
  lang,
  dict,
  stats,
  monthlySeries,
  topBots,
}: {
  lang: SupportedLang;
  dict: Dictionary;
  stats: {
    totalUsers: number;
    totalBots: number;
    totalLeads: number;
    totalKnowledgeBases: number;
  };
  monthlySeries: { month: string; interactions: number; users?: number }[];
  topBots: BotStat[];
}) => {
  const t = dict.admin_reports;
  const isRtl = lang === "ar";
  const locale = lang === "ar" ? "ar" : "en-US";

  type CsvRow = Record<string, string | number | Date | undefined | null>;
  const csvDownload = (rows: CsvRow[], filename: string, header: string[]) => {
    const csvRows = [header.join(",")];
    for (const r of rows) {
      const line = header.map((h) => {
        // map header key to value if object, fallback to empty
        const key = h;
        let value = r[key] ?? "";
        // if Date
        if (value instanceof Date) value = value.toLocaleString(locale);
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(line.join(","));
    }
    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.exported_csv ?? "Exported");
  };

  const exportBotsCsv = () => {
    const header = [
      t.th_bot_name,
      t.th_interactions_30d,
      t.th_accuracy,
      t.th_status,
    ];
    const rows = topBots.map((b) => ({
      [t.th_bot_name]: b.name,
      [t.th_interactions_30d]: b.interactions,
      [t.th_accuracy]: `${b.accuracy}%`,
      [t.th_status]: b.status,
    }));
    // pass header labels as keys and map by those labels (csvDownload expects header keys matching object keys)
    csvDownload(
      rows,
      `aoun-top-bots-${new Date().toISOString().slice(0, 10)}.csv`,
      header,
    );
  };

  const monthlyTooltipFormatter = (
    value: number | string,
    name: string,
  ): [number | string, string] => {
    return [value, name];
  };

  const summaryCards = useMemo(
    () => [
      { id: "users", title: t.total_users, value: stats.totalUsers },
      { id: "bots", title: t.total_bots, value: stats.totalBots },
      { id: "leads", title: t.total_leads, value: stats.totalLeads },
      { id: "kbs", title: t.total_kbs, value: stats.totalKnowledgeBases },
    ],
    [stats, t],
  );

  return (
    <div className={cn("space-y-6", isRtl && "rtl")}>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground text-sm">{t.description}</p>
      </div>

      {/* summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((c) => (
          <Card key={c.id} className="p-4">
            <CardHeader>
              <CardTitle className="text-sm">{c.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(c.value ?? 0).toLocaleString(locale)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly Interactions Line Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.monthly_interactions}</CardTitle>
            <CardDescription>{t.monthly_interactions_desc}</CardDescription>
          </CardHeader>
          <CardContent dir="ltr">
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <LineChart
                  data={monthlySeries}
                  margin={{
                    top: 10,
                    right: 30,
                    left: isRtl ? 10 : 0,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
                  <XAxis
                    dataKey="month"
                    stroke="var(--muted-foreground)"
                    fontSize={13}
                    tickLine={false}
                    axisLine={false}
                    padding={{ left: 8, right: 8 }}
                    reversed={isRtl}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={13}
                    tickLine={false}
                    axisLine={false}
                    tickCount={6}
                    orientation={isRtl ? "right" : "left"}
                  />
                  <Tooltip
                    formatter={monthlyTooltipFormatter}
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
                  />
                  <Legend
                    wrapperStyle={{
                      color: "var(--muted-foreground)",
                      fontWeight: 600,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="interactions"
                    stroke="var(--primary)"
                    strokeWidth={3}
                    name={t.interactions}
                    activeDot={{
                      r: 6,
                      stroke: "var(--accent)",
                      strokeWidth: 2,
                    }}
                    dot={{ r: 3 }}
                  />
                  {monthlySeries[0]?.users !== undefined && (
                    <Line
                      type="monotone"
                      dataKey="users"
                      stroke="var(--accent)"
                      strokeWidth={3}
                      name={t.unique_users}
                      activeDot={{
                        r: 6,
                        stroke: "var(--primary)",
                        strokeWidth: 2,
                      }}
                      dot={{ r: 3 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Interactions Breakdown Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{t.interactions_breakdown}</CardTitle>
          </CardHeader>
          <CardContent dir="ltr">
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <BarChart
                  data={monthlySeries}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
                  <XAxis
                    dataKey="month"
                    stroke="var(--muted-foreground)"
                    fontSize={13}
                    tickLine={false}
                    axisLine={false}
                    padding={{ left: 8, right: 8 }}
                    reversed={isRtl}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={13}
                    tickLine={false}
                    axisLine={false}
                    orientation={isRtl ? "right" : "left"}
                  />
                  <Tooltip
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
                  />
                  <Bar
                    dataKey="interactions"
                    fill="var(--primary)"
                    name={t.interactions}
                    radius={[6, 6, 0, 0]}
                    barSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* top bots */}
      <Card>
        <CardHeader>
          <CardTitle>{t.top_bots_title}</CardTitle>
          <CardDescription>{t.top_bots_desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-muted-foreground text-sm">
              {t.top_bots_subtitle}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => exportBotsCsv()}>
                <Download className="mr-2 h-4 w-4" /> {t.export_button}
              </Button>
            </div>
          </div>

          <div className="max-h-[48vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.th_bot_name}</TableHead>
                  <TableHead>{t.th_interactions_30d}</TableHead>
                  <TableHead>{t.th_accuracy}</TableHead>
                  <TableHead>{t.th_status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topBots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center">
                      {t.empty_state}
                    </TableCell>
                  </TableRow>
                ) : (
                  topBots.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell>
                        {b.interactions.toLocaleString(locale)}
                      </TableCell>
                      <TableCell>{b.accuracy}%</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            b.status === "Active" ? "default" : "destructive"
                          }
                        >
                          {b.status === "Active" ? t.active : t.inactive}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsClient;
