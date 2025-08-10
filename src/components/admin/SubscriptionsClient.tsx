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
import { columns } from "./SubscriptionsColumns";

type SubscriptionRow = {
  id: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  plan: string;
  price: number | string;
  currency?: string | null;
  billingCycle: "monthly" | "yearly";
  status: "active" | "past_due" | "canceled" | "trialing" | string;
  startedAt: string | Date | null;
  expiresAt?: string | Date | null;
};

const SubscriptionsClient = ({
  initialSubscriptions,
  lang,
  dict,
}: {
  initialSubscriptions: SubscriptionRow[];
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const [tableInstance, setTableInstance] =
    useState<Table<SubscriptionRow> | null>(null);

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
      const line = [
        s.id,
        `${s.userName ?? ""} <${s.userEmail ?? ""}>`,
        s.plan,
        `${s.price} ${s.currency}`,
        s.billingCycle,
        s.status,
        s.startedAt ? new Date(s.startedAt).toLocaleString(locale) : "",
        s.expiresAt ? new Date(s.expiresAt).toLocaleString(locale) : "",
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

  function handleChangePlan(id: string) {
    toast.success(t.toast_change_plan_placeholder);
    // wire real action later
  }

  function handleCancel(id: string) {
    if (!confirm(t.confirm_cancel)) return;
    toast.success(t.toast_canceled);
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
            columns={columns({
              t,
              lang,
              locale,
              onChangePlan: handleChangePlan,
              onCancel: handleCancel,
            })}
            data={initialSubscriptions}
            lang={lang}
            emptyMessage={t.empty}
            searchPlaceholder={t.search_placeholder}
            previousButton={t.previous_button}
            nextButton={t.next_button}
            onTableReady={setTableInstance}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionsClient;
