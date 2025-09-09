"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Avatar, AvatarImage } from "../ui/avatar";

type StatShape = {
  totalUsers: number;
  totalBots: number;
  avgResponseTime: number | string;
  serverStatus: string;
};

type RecentUser = {
  id: string;
  name?: string;
  email?: string;
  createdAt: string;
  image: string | null;
};
type RecentSubscription = {
  id: string;
  user: {
    id: string;
    name?: string;
    email?: string;
    image: string | null;
  } | null;
  plan: { id: string; title?: string; price?: string } | null;
  status?: string;
  createdAt: string;
};

const AdminDashboardClient = ({
  lang,
  dict,
  stats,
  recentUsers,
  recentSubscriptions,
  agentsSeries,
  newUsersSeries,
}: {
  lang: SupportedLang;
  dict: Dictionary;
  stats: StatShape;
  recentUsers: RecentUser[];
  recentSubscriptions: RecentSubscription[];
  agentsSeries: { month: string; agents: number }[];
  newUsersSeries: { month: string; newUsers: number }[];
}) => {
  const t = dict.admin_dashboard;
  const isRtl = lang === "ar";

  return (
    <div className={cn("space-y-6", isRtl && "rtl")}>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t.title ?? "Admin Dashboard"}</h1>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Avg. Response Time */}
        <Card className="p-4">
          <CardHeader>
            <CardTitle className="text-sm">{t.avg_response_time}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.avgResponseTime} {lang === "ar" ? "مللي ثانية" : "ms"}
            </div>
            <div className="text-muted-foreground text-sm">
              {t.avg_response_time_desc}
            </div>
          </CardContent>
        </Card>

        {/* Server Status */}
        <Card className="p-4">
          <CardHeader>
            <CardTitle className="text-sm">{t.server_status}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.serverStatus}</div>
            <div className="text-muted-foreground text-sm">
              {t.server_status_desc}
            </div>
          </CardContent>
        </Card>

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
            <CardTitle className="text-sm">{t.bots ?? "Agents"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalBots}</div>
            <div className="text-muted-foreground text-sm">{t.bots_desc}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts + lists */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Agents Created Over Time (Line Chart) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t.agents_created_over_time}</CardTitle>
            <CardDescription>{t.agents_created_over_time_desc}</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 260 }} dir="ltr">
              <ResponsiveContainer>
                <LineChart
                  data={agentsSeries}
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
                    dataKey="agents"
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

        {/* New User Growth (Bar Chart) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.new_user_growth}</CardTitle>
            <CardDescription>{t.new_user_growth_desc}</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 260 }} dir="ltr">
              <ResponsiveContainer>
                <BarChart
                  data={newUsersSeries}
                  margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                >
                  <XAxis
                    dataKey="month"
                    stroke="var(--muted-foreground)"
                    fontSize={13}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={13}
                    tickLine={false}
                    axisLine={false}
                    tickCount={6}
                    domain={[0, "dataMax"]}
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
                    dataKey="newUsers"
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

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.recent_users}</CardTitle>
            <CardDescription>{t.recent_users_desc}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {recentUsers.length === 0 ? (
                <div className="text-muted-foreground text-sm">
                  {t.no_recent_items}
                </div>
              ) : (
                recentUsers.map((u) => (
                  <li key={u.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar>
                        <AvatarImage
                          src={u.image ?? "/images/avatar.png"}
                          alt={u.name ?? "User"}
                          loading="lazy"
                        />
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {u.name ?? "Unknown user"}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {u.email ?? "—"}
                        </div>
                      </div>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {new Date(u.createdAt).toLocaleString(
                        lang === "ar" ? "ar-EG" : undefined,
                        {
                          dateStyle: "medium",
                          timeStyle: "short",
                        },
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Recent Subscriptions */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t.recent_subscriptions}</CardTitle>
            <CardDescription>{t.recent_subscriptions_desc}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {recentSubscriptions.length === 0 ? (
                <div className="text-muted-foreground text-sm">
                  {t.no_recent_items}
                </div>
              ) : (
                recentSubscriptions.map((s) => (
                  <li
                    key={s.id}
                    className="bg-card flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    {/* User info */}
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarImage
                          src={s.user?.image ?? "/images/avatar.png"}
                          alt={s.user?.name ?? "User"}
                          loading="lazy"
                        />
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {s.user?.name ?? "Unknown user"}
                        </div>
                        <div className="text-muted-foreground truncate text-xs">
                          {s.user?.email ?? "—"}
                        </div>
                      </div>
                    </div>

                    {/* Plan + Price + Date */}
                    <div className="flex flex-shrink-0 flex-col items-start gap-2 text-sm sm:items-end">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {s.plan?.title ?? "N/A"}
                        </Badge>
                        {s.plan?.price && (
                          <span className="text-primary font-medium">
                            {s.plan.price}
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {new Date(s.createdAt).toLocaleString(
                          lang === "ar" ? "ar-EG" : undefined,
                          {
                            dateStyle: "medium",
                            timeStyle: "short",
                          },
                        )}
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboardClient;
