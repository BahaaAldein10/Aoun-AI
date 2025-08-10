"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Dictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import {
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type StatShape = {
  totalUsers: number;
  totalBots: number;
  totalLeads: number;
  totalKnowledgeBases: number;
};

type RecentUser = {
  id: string;
  name?: string;
  email?: string;
  createdAt: string;
};
type RecentLead = {
  id: string;
  name?: string;
  contact?: string;
  status?: string;
  createdAt: string;
};

const AdminDashboardClient = ({
  lang,
  dict,
  stats,
  recentUsers,
  recentLeads,
}: {
  lang: SupportedLang;
  dict: Dictionary;
  stats: StatShape;
  recentUsers: RecentUser[];
  recentLeads: RecentLead[];
}) => {
  const t = dict.admin_dashboard;
  const isRtl = lang === "ar";

  // placeholder series for chart (replace with server-provided series)
  const monthlySeries = [
    { month: "Jan", interactions: 1200 },
    { month: "Feb", interactions: 2100 },
    { month: "Mar", interactions: 800 },
    { month: "Apr", interactions: 1600 },
    { month: "May", interactions: 1900 },
    { month: "Jun", interactions: 2300 },
  ];

  return (
    <div className={cn("space-y-6", isRtl && "rtl")}>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground text-sm">{t.overview}</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <CardHeader>
            <CardTitle className="text-sm">{t.total_users}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalUsers.toLocaleString()}
            </div>
            <div className="text-muted-foreground text-sm">
              {t.total_users_desc}
            </div>
          </CardContent>
        </Card>

        <Card className="p-4">
          <CardHeader>
            <CardTitle className="text-sm">{t.bots}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalBots}</div>
            <div className="text-muted-foreground text-sm">{t.bots_desc}</div>
          </CardContent>
        </Card>

        <Card className="p-4">
          <CardHeader>
            <CardTitle className="text-sm">{t.leads}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalLeads.toLocaleString()}
            </div>
            <div className="text-muted-foreground text-sm">{t.leads_desc}</div>
          </CardContent>
        </Card>

        <Card className="p-4">
          <CardHeader>
            <CardTitle className="text-sm">{t.knowledge_bases}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalKnowledgeBases}
            </div>
            <div className="text-muted-foreground text-sm">
              {t.knowledge_bases_desc}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts + lists */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly Interactions Line Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.monthly_interactions}</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 260 }} dir="ltr">
              <ResponsiveContainer>
                <LineChart
                  data={monthlySeries}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <XAxis
                    dataKey="month"
                    stroke="var(--muted-foreground)"
                    fontSize={13}
                    tickLine={false}
                    axisLine={false}
                    padding={{ left: 10, right: 10 }}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={13}
                    tickLine={false}
                    axisLine={false}
                    tickCount={6}
                    domain={["dataMin", "dataMax"]}
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
                    itemStyle={{ color: "var(--primary)" }}
                  />
                  <Legend
                    wrapperStyle={{
                      color: "var(--muted-foreground)",
                      fontWeight: "600",
                    }}
                    verticalAlign="top"
                    height={36}
                  />
                  <Line
                    type="monotone"
                    dataKey="interactions"
                    stroke="var(--primary)"
                    strokeWidth={3}
                    activeDot={{
                      r: 6,
                      stroke: "var(--accent)",
                      strokeWidth: 2,
                    }}
                    dot={{ r: 3 }}
                  />
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
          <CardContent>
            <div style={{ width: "100%", height: 260 }} dir="ltr">
              <ResponsiveContainer>
                <BarChart
                  data={monthlySeries}
                  margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                >
                  <XAxis
                    dataKey="month"
                    stroke="var(--muted-foreground)"
                    fontSize={13}
                    tickLine={false}
                    axisLine={false}
                    padding={{ left: 10, right: 10 }}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={13}
                    tickLine={false}
                    axisLine={false}
                    tickCount={6}
                    domain={["dataMin", "dataMax"]}
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
                    itemStyle={{ color: "var(--primary)" }}
                  />
                  <Bar
                    dataKey="interactions"
                    fill="var(--primary)"
                    radius={[6, 6, 0, 0]}
                    barSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.recent_users}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {recentUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {u.email}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {new Date(u.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.recent_leads}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {recentLeads.map((l) => (
                <li key={l.id} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{l.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {l.contact}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge
                      variant={l.status === "new" ? "default" : "secondary"}
                    >
                      {l.status === "new" ? t.status_new : t.status_contacted}
                    </Badge>
                    <div className="text-muted-foreground text-xs">
                      {new Date(l.createdAt).toLocaleString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboardClient;
