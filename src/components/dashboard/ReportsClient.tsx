"use client";

import { Badge } from "@/components/ui/badge";
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
import { Dictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { cssVar } from "@/lib/utils";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type MonthlyData = {
  month: string;
  interactions: number;
  users: number;
};

export type BotPerformance = {
  id: string;
  name: string;
  interactions: number;
  accuracy: number;
  status: "Active" | "Inactive";
};

export type OverviewStats = {
  totalInteractions: number;
  totalMinutes: number;
  totalLeads: number;
  totalBots: number;
  activeBots: number;
};

interface ReportsClientProps {
  lang: SupportedLang;
  dict: Dictionary;
  monthlyData: MonthlyData[];
  botPerformance: BotPerformance[];
  overviewStats: OverviewStats;
}

const ReportsClient = ({
  lang,
  dict,
  monthlyData,
  botPerformance,
  overviewStats,
}: ReportsClientProps) => {
  const t = dict.dashboard_reports;
  const isRTL = lang === "ar";

  const chartData = useMemo(() => monthlyData, [monthlyData]);
  const bots = useMemo(() => botPerformance, [botPerformance]);
  const stats = useMemo(() => overviewStats, [overviewStats]);

  // Format numbers for locale
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat(lang === "ar" ? "ar" : "en-US").format(num);
  };

  return (
    <div className="space-y-6">
      <h1
        className={`font-headline text-2xl font-bold ${
          isRTL ? "rtl:text-right" : ""
        }`}
      >
        {t.title}
      </h1>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className={isRTL ? "rtl:text-right" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {t.total_interactions || "Total Interactions"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats.totalInteractions)}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {t.current_month || "This month"}
            </p>
          </CardContent>
        </Card>

        <Card className={isRTL ? "rtl:text-right" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {t.total_minutes || "Total Minutes"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats.totalMinutes)}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {t.current_month || "This month"}
            </p>
          </CardContent>
        </Card>

        <Card className={isRTL ? "rtl:text-right" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {t.active_bots || "Active Bots"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.activeBots} / {stats.totalBots}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {t.deployed_bots || "Deployed bots"}
            </p>
          </CardContent>
        </Card>

        <Card className={isRTL ? "rtl:text-right" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {t.total_leads || "Total Leads"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats.totalLeads)}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {t.all_time || "All time"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Performance Chart */}
      <Card className={isRTL ? "rtl:text-right" : ""}>
        <CardHeader>
          <CardTitle>{t.monthly_performance}</CardTitle>
          <CardDescription>{t.monthly_performance_desc}</CardDescription>
        </CardHeader>
        <CardContent dir="ltr">
          <div style={{ width: "100%", height: 350 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ left: isRTL ? 10 : 0, right: isRTL ? 0 : 10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={cssVar("--muted")}
                  />
                  <XAxis
                    dataKey="month"
                    stroke={cssVar("--muted-foreground")}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    reversed={isRTL}
                  />
                  <YAxis
                    stroke={cssVar("--muted-foreground")}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    orientation={isRTL ? "right" : "left"}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: cssVar("--card"),
                      borderColor: cssVar("--border"),
                      color: cssVar("--foreground"),
                    }}
                    cursor={{ fill: cssVar("--muted") }}
                    formatter={(value: number) => [formatNumber(value), ""]}
                  />
                  <Legend />
                  <Bar
                    dataKey="interactions"
                    fill={cssVar("--chart-1")}
                    name={t.interactions}
                    radius={isRTL ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="users"
                    fill={cssVar("--chart-2")}
                    name={t.unique_users}
                    radius={isRTL ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-muted-foreground">
                  {t.no_data || "No data available for the selected period"}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bot Performance Table */}
      <Card className={isRTL ? "rtl:text-right" : ""}>
        <CardHeader>
          <CardTitle>{t.bot_performance_details}</CardTitle>
          <CardDescription>{t.bot_performance_desc}</CardDescription>
        </CardHeader>
        <CardContent>
          {bots.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={isRTL ? "rtl:text-right" : ""}>
                    {t.bot_name}
                  </TableHead>
                  <TableHead className={isRTL ? "rtl:text-right" : ""}>
                    {t.status}
                  </TableHead>
                  <TableHead className={isRTL ? "rtl:text-right" : ""}>
                    {t.interactions_30d}
                  </TableHead>
                  <TableHead className={isRTL ? "rtl:text-right" : ""}>
                    {t.accuracy}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bots.map((bot) => (
                  <TableRow key={bot.id}>
                    <TableCell
                      className={
                        isRTL ? "font-medium rtl:text-right" : "font-medium"
                      }
                    >
                      {bot.name}
                    </TableCell>
                    <TableCell className={isRTL ? "rtl:text-right" : ""}>
                      <Badge
                        variant={
                          bot.status === "Active" ? "default" : "destructive"
                        }
                      >
                        {bot.status === "Active" ? t.active : t.inactive}
                      </Badge>
                    </TableCell>
                    <TableCell className={isRTL ? "rtl:text-right" : ""}>
                      {formatNumber(bot.interactions)}
                    </TableCell>
                    <TableCell className={isRTL ? "rtl:text-right" : ""}>
                      {bot.accuracy}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">
                {t.no_bots ||
                  "No bots found. Create your first bot to see performance data."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsClient;
