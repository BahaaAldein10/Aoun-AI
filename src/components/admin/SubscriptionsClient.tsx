"use client";

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
import { cn } from "@/lib/utils";
import { Table } from "@tanstack/react-table";
import { useState } from "react";
import toast from "react-hot-toast";
import { DataTable } from "../ui/data-table";
import { columns, SubscriptionWithUserWithPlan } from "./SubscriptionsColumns";

const SubscriptionsClient = ({
  initialSubscriptions,
  lang,
  dict,
}: {
  initialSubscriptions: SubscriptionWithUserWithPlan[];
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const [tableInstance, setTableInstance] =
    useState<Table<SubscriptionWithUserWithPlan> | null>(null);

  const t = dict.admin_subscriptions;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  function downloadCsv() {
    // Get filtered and sorted data from table
    const dataToExport = tableInstance
      ? tableInstance.getFilteredRowModel().rows.map((row) => row.original)
      : initialSubscriptions;

    const header = [
      t.th_subscription_id,
      t.th_user,
      t.th_plan,
      t.th_price,
      t.th_cycle,
      t.th_status,
      t.th_started_at,
      t.th_expires_at,
    ];

    const csvRows = [header.join(",")];

    for (const s of dataToExport) {
      const planName = s.plan?.name ?? "";
      const planPrice = s.plan?.priceAmount ?? 0;
      const planInterval = s.plan?.interval ?? "";

      const line = [
        s.id,
        `${s.user?.name ?? ""} <${s.user?.email ?? ""}>`,
        planName,
        planPrice ? `${planPrice} USD` : "",
        planInterval,
        s.status ?? "",
        s.currentPeriodStart
          ? new Date(s.currentPeriodStart).toLocaleString(locale)
          : "",
        s.currentPeriodEnd
          ? new Date(s.currentPeriodEnd).toLocaleString(locale)
          : "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      csvRows.push(line.join(","));
    }

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aoun-subscriptions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.toast_exported);
  }

  return (
    <div className="space-y-6">
      <div className={`flex w-full items-center justify-between`}>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>

        <Button onClick={downloadCsv}>{t.export_csv}</Button>
      </div>

      <Card className={cn("w-full", isRtl && "rtl:text-right")}>
        <CardHeader>
          <CardTitle>{t.table_title}</CardTitle>
          <CardDescription>{t.table_description}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns({ t, locale })}
            data={initialSubscriptions}
            lang={lang}
            emptyMessage={t.empty}
            searchPlaceholder={t.search_placeholder}
            previousButton={t.previous_button}
            nextButton={t.next_button}
            onTableReady={setTableInstance}
            showStatusFilter={true}
            getStatus={(s) => s.status}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionsClient;
