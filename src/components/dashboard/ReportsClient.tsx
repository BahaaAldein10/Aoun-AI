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

interface ReportsClientProps {
  lang: SupportedLang;
  dict: Dictionary;
  monthlyData: {
    month: string;
    interactions: number;
    users: number;
  }[];
  bots: {
    id: string;
    name: string;
    status: string;
    interactions30d: number;
    accuracy30d: string | number;
  }[];
}


const ReportsClient = ({ lang, dict, monthlyData, bots }: ReportsClientProps) => {
  const t = dict.dashboard_reports;
  const isRTL = lang === "ar";

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
        <CardContent dir="ltr">
          <div style={{ width: "100%", height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyData}
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
                    {bot.interactions30d.toLocaleString()}
                  </TableCell>
                  <TableCell className={isRTL ? "rtl:text-right" : ""}>
                    {bot.accuracy30d}%
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
