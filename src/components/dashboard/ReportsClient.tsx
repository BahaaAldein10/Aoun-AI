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

interface ReportsClientProps {
  lang: SupportedLang;
  dict: Dictionary;
}

const sampleMonthly = [
  { month: "Jan", interactions: 4000, users: 2400 },
  { month: "Feb", interactions: 3000, users: 1398 },
  { month: "Mar", interactions: 2000, users: 980 },
  { month: "Apr", interactions: 2780, users: 3908 },
  { month: "May", interactions: 1890, users: 4800 },
  { month: "Jun", interactions: 2390, users: 3800 },
];

const sampleBots = [
  {
    id: "BOT-001",
    name: "Support Bot",
    interactions: 1250,
    accuracy: 95,
    status: "Active",
  },
  {
    id: "BOT-002",
    name: "Sales Bot",
    interactions: 870,
    accuracy: 92,
    status: "Active",
  },
  {
    id: "BOT-003",
    name: "FAQ Bot",
    interactions: 2100,
    accuracy: 98,
    status: "Active",
  },
  {
    id: "BOT-004",
    name: "Internal HR",
    interactions: 450,
    accuracy: 88,
    status: "Inactive",
  },
];

const ReportsClient = ({ lang, dict }: ReportsClientProps) => {
  const t = dict.dashboard_reports;
  const isRTL = lang === "ar";

  const monthlyData = useMemo(() => sampleMonthly, []);
  const bots = useMemo(() => sampleBots, []);

  return (
    <div className="space-y-6">
      <h1
        className={`font-headline text-2xl font-bold ${
          isRTL ? "rtl:text-right" : ""
        }`}
      >
        {t.title}
      </h1>

      <Card className={isRTL ? "rtl:text-right" : ""}>
        <CardHeader>
          <CardTitle>{t.monthly_performance}</CardTitle>
          <CardDescription>{t.monthly_performance_desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ width: "100%", height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyData}
                margin={{ left: isRTL ? 10 : 0, right: isRTL ? 0 : 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  reversed={isRTL}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  orientation={isRTL ? "right" : "left"}
                />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="interactions"
                  fill="hsl(var(--primary))"
                  name={t.interactions}
                  radius={isRTL ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                />
                <Bar
                  dataKey="users"
                  fill="hsl(var(--accent))"
                  name={t.unique_users}
                  radius={isRTL ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className={isRTL ? "rtl:text-right" : ""}>
        <CardHeader>
          <CardTitle>{t.bot_performance_details}</CardTitle>
          <CardDescription>{t.bot_performance_desc}</CardDescription>
        </CardHeader>
        <CardContent>
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
                    {bot.interactions.toLocaleString()}
                  </TableCell>
                  <TableCell className={isRTL ? "rtl:text-right" : ""}>
                    {bot.accuracy}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsClient;
