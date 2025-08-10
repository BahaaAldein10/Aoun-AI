"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { cn, cssVar } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Bot,
  Clock,
  MessageSquare,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SeriesPoint = { date: string; value: number };

export type UserUsage = {
  totalInteractions?: number;
  botCount: number;
  botLimit: number;
  planName?: string;
  minutesUsed: number;
  monthlyQuota: number;
  responseAccuracy?: string | number;
  interactionsSeries?: SeriesPoint[];
  channelCounts?: {
    website?: number;
    whatsapp?: number;
    facebook?: number;
    voice?: number;
  };
};

const DashboardClient = ({
  usage,
  lang,
  dict,
}: {
  usage: UserUsage;
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const t = dict.dashboard_home;
  const isRTL = lang === "ar";

  // Defensive defaults
  const interactionsData: SeriesPoint[] =
    usage.interactionsSeries && usage.interactionsSeries.length > 0
      ? usage.interactionsSeries
      : [
          // placeholder series (won't be used when real data is provided)
          { date: "Mon", value: 15 },
          { date: "Tue", value: 30 },
          { date: "Wed", value: 20 },
          { date: "Thu", value: 10 },
          { date: "Fri", value: 25 },
          { date: "Sat", value: 35 },
          { date: "Sun", value: 40 },
        ];

  const channelCounts = usage.channelCounts ?? {
    website: 5,
    whatsapp: 3,
    facebook: 2,
    voice: 12,
  };

  const totalInteractions = usage.totalInteractions ?? 0;

  const usagePercentage =
    usage.monthlyQuota > 0
      ? Math.round((usage.minutesUsed / usage.monthlyQuota) * 100)
      : 0;
  const showUsageWarning = usagePercentage >= 80;

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total interactions */}
        <Card className={cn(isRTL && "rtl:text-right")}>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t.total_interactions}
            </CardTitle>
            <MessageSquare className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInteractions}</div>
            <p className="text-muted-foreground mt-1 text-xs">
              {t.overview_summary ?? ""} {/* optional small helper text */}
            </p>
          </CardContent>
        </Card>

        {/* Active bots */}
        <Card className={cn(isRTL && "rtl:text-right")}>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t.active_bots}
            </CardTitle>
            <Bot className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage.botCount} / {usage.botLimit}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {usage.planName ?? t.plan}
            </p>
          </CardContent>
        </Card>

        {/* Monthly usage */}
        <Card className={cn(isRTL && "rtl:text-right")}>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t.monthly_usage}
            </CardTitle>
            <Clock className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage.minutesUsed} / {usage.monthlyQuota} {t.minutes}
            </div>

            <Progress
              value={usagePercentage}
              dir={isRTL ? "rtl" : "ltr"}
              className="mt-4 h-2"
            />

            {showUsageWarning && (
              <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" /> {t.usage_warning}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Optional response accuracy (kept minimal) */}
        <Card className={cn(isRTL && "rtl:text-right")}>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t.response_accuracy}
            </CardTitle>
            <Activity className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage.responseAccuracy ?? "—"}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {t.from_last_week}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Interactions over time */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{t.interactions_overview}</CardTitle>
                <CardDescription className="mt-2">
                  {t.interactions_last_7_days}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent dir="ltr">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={interactionsData}
                margin={{ left: isRTL ? 0 : 12, right: isRTL ? 12 : 0 }}
              >
                <XAxis
                  dataKey="date"
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
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={t.interactions}
                  stroke={cssVar("--chart-1")}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Channel breakdown */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t.channel_breakdown}</CardTitle>
            <CardDescription className="mt-1">
              {t.channel_breakdown_desc}
            </CardDescription>
          </CardHeader>
          <CardContent dir="ltr">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  { name: t.website, value: channelCounts.website ?? 0 },
                  { name: t.whatsapp, value: channelCounts.whatsapp ?? 0 },
                  { name: t.facebook, value: channelCounts.facebook ?? 0 },
                  { name: t.voice, value: channelCounts.voice ?? 0 },
                ]}
                layout="vertical"
              >
                <XAxis type="number" hide reversed={isRTL} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={cssVar("--muted-foreground")}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                  orientation={isRTL ? "right" : "left"}
                />
                <Tooltip
                  cursor={{ fill: cssVar("--muted") }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    return (
                      <div
                        style={{
                          backgroundColor: cssVar("--card"),
                          border: `1px solid ${cssVar("--border")}`,
                          padding: "8px 12px",
                          borderRadius: "6px",
                        }}
                      >
                        <p
                          style={{
                            color: cssVar("--foreground"),
                            marginBottom: "4px",
                          }}
                        >
                          {label}
                        </p>
                        {payload.map((entry, index) => (
                          <p
                            key={`value-${index}`}
                            style={{
                              color: cssVar("--primary"),
                              fontWeight: 500,
                            }}
                          >
                            {entry.value}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="value"
                  barSize={20}
                  radius={isRTL ? [0, 6, 6, 0] : [6, 0, 0, 6]}
                >
                  {["--chart-1", "--chart-2", "--chart-3", "--chart-4"].map(
                    (varName, index) => (
                      <Cell key={`cell-${index}`} fill={cssVar(varName)} />
                    ),
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardClient;
