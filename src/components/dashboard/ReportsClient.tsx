"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Dictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { cssVar } from "@/lib/utils";
import { Crown, Lock } from "lucide-react";
import Link from "next/link";
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
  hasPaidPlan: boolean;
}

const ReportsClient = ({
  lang,
  dict,
  monthlyData,
  bots,
  hasPaidPlan,
}: ReportsClientProps) => {
  const t = dict.dashboard_reports;
  const isRTL = lang === "ar";

  // Mock data for free users to show the structure
  const mockMonthlyData = [
    { month: "Jan", interactions: 0, users: 0 },
    { month: "Feb", interactions: 0, users: 0 },
    { month: "Mar", interactions: 0, users: 0 },
    { month: "Apr", interactions: 0, users: 0 },
    { month: "May", interactions: 0, users: 0 },
    { month: "Jun", interactions: 0, users: 0 },
  ];

  const mockBots = [
    {
      id: "1",
      name: "---",
      status: "---",
      interactions30d: 0,
      accuracy30d: "---",
    },
    {
      id: "2",
      name: "---",
      status: "---",
      interactions30d: 0,
      accuracy30d: "---",
    },
  ];

  const displayData = hasPaidPlan ? monthlyData : mockMonthlyData;
  const displayBots = hasPaidPlan ? bots : mockBots;

  const UpgradeButton = () => (
    <Link href={`/${lang}/pricing`}>
      <Button className="gap-2">
        <Crown className="h-4 w-4" />
        {lang === "ar" ? "ترقية الخطة" : "Upgrade Plan"}
      </Button>
    </Link>
  );

  return (
    <div className="space-y-6">
      <div
        className={`flex items-center justify-between ${isRTL ? "rtl:text-right" : ""}`}
      >
        <h1 className="font-headline text-2xl font-bold">{t.title}</h1>
        {!hasPaidPlan && <UpgradeButton />}
      </div>

      {/* Free Plan Warning */}
      {!hasPaidPlan && (
        <Alert className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
          <Lock className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-800 dark:text-orange-200">
            {lang === "ar" ? "ميزة محدودة" : "Limited Feature"}
          </AlertTitle>
          <AlertDescription className="text-orange-700 dark:text-orange-300">
            {lang === "ar"
              ? "تقارير مفصلة متوفرة فقط للخطط المدفوعة. قم بالترقية للوصول إلى تحليلات شاملة لروبوتاتك."
              : "Detailed reports are available for paid plans only. Upgrade to access comprehensive analytics for your bots."}
          </AlertDescription>
        </Alert>
      )}

      <Card
        className={`${isRTL ? "rtl:text-right" : ""} ${!hasPaidPlan ? "opacity-60" : ""}`}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {t.monthly_performance}
                {!hasPaidPlan && (
                  <Lock className="text-muted-foreground h-4 w-4" />
                )}
              </CardTitle>
              <CardDescription>{t.monthly_performance_desc}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent dir="ltr">
          <div style={{ width: "100%", height: 350 }} className="relative">
            {!hasPaidPlan && (
              <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
                <div className="space-y-4 text-center">
                  <Lock className="text-muted-foreground mx-auto h-12 w-12" />
                  <div>
                    <p className="text-foreground font-medium">
                      {lang === "ar" ? "ميزة مميزة" : "Premium Feature"}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {lang === "ar"
                        ? "قم بالترقية لعرض التحليلات المفصلة"
                        : "Upgrade to view detailed analytics"}
                    </p>
                  </div>
                  <UpgradeButton />
                </div>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={displayData}
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

      <Card
        className={`${isRTL ? "rtl:text-right" : ""} ${!hasPaidPlan ? "opacity-60" : ""}`}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {t.bot_performance_details}
                {!hasPaidPlan && (
                  <Lock className="text-muted-foreground h-4 w-4" />
                )}
              </CardTitle>
              <CardDescription>{t.bot_performance_desc}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative">
          {!hasPaidPlan && (
            <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center rounded-lg backdrop-blur-sm">
              <div className="space-y-4 text-center">
                <Lock className="text-muted-foreground mx-auto h-12 w-12" />
                <div>
                  <p className="text-foreground font-medium">
                    {lang === "ar"
                      ? "تفاصيل الأداء المميزة"
                      : "Premium Performance Details"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {lang === "ar"
                      ? "احصل على تفاصيل أداء شاملة لجميع روبوتاتك"
                      : "Get comprehensive performance details for all your bots"}
                  </p>
                </div>
                <UpgradeButton />
              </div>
            </div>
          )}
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
              {displayBots.map((bot) => (
                <TableRow key={bot.id}>
                  <TableCell
                    className={
                      isRTL ? "font-medium rtl:text-right" : "font-medium"
                    }
                  >
                    {bot.name}
                  </TableCell>
                  <TableCell className={isRTL ? "rtl:text-right" : ""}>
                    {bot.status === "---" ? (
                      <span className="text-muted-foreground">---</span>
                    ) : (
                      <Badge
                        variant={
                          bot.status === "Active" ? "default" : "destructive"
                        }
                      >
                        {bot.status === "Active" ? t.active : t.inactive}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className={isRTL ? "rtl:text-right" : ""}>
                    {typeof bot.interactions30d === "number" &&
                    bot.interactions30d > 0
                      ? bot.interactions30d.toLocaleString()
                      : "---"}
                  </TableCell>
                  <TableCell className={isRTL ? "rtl:text-right" : ""}>
                    {bot.accuracy30d === "---" ? "---" : `${bot.accuracy30d}%`}
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
