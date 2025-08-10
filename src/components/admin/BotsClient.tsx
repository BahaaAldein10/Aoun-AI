"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Dictionary } from "@/contexts/dictionary-context";
import type { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import { Table } from "@tanstack/react-table";
import { useState } from "react";
import toast from "react-hot-toast";
import { BotRow, columns as makeColumns } from "./BotsColumns";

const BotsClient = ({
  initialBots,
  lang,
  dict,
}: {
  initialBots?: BotRow[];
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const [tableInstance, setTableInstance] = useState<Table<BotRow> | null>(
    null,
  );
  const t: Record<string, string> = dict.admin_bots;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  function downloadCsv() {
    const dataToExport = tableInstance
      ? tableInstance.getFilteredRowModel().rows.map((r) => r.original)
      : initialBots;

    const header = [t.th_name, t.th_owner, t.th_status, t.th_created_at];
    const csvRows = [header.join(",")];

    for (const r of dataToExport ?? []) {
      const line = [
        r.name ?? "",
        r.ownerName ?? "",
        r.status ?? "",
        r.createdAt ? new Date(r.createdAt).toLocaleString(locale) : "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      csvRows.push(line.join(","));
    }

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aoun-bots-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.toast_exported);
  }

  function handleDelete(botId: string) {
    toast.success(t.toast_deleted);
  }

  function handleView(id: string) {
    toast(t.view_bot_placeholder);
  }

  function handleEdit(id: string) {
    toast(t.edit_bot_placeholder);
  }

  return (
    <div className={isRtl ? "rtl" : ""}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>

        <Button onClick={downloadCsv}>{t.export_csv}</Button>
      </div>

      <Card className={cn(isRtl ? "mt-4 rtl:text-right" : "mt-4")}>
        <CardHeader>
          <CardTitle>{t.table_title}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={makeColumns({
              t,
              lang,
              locale,
              onView: handleView,
              onEdit: handleEdit,
              onDelete: handleDelete,
            })}
            data={initialBots || []}
            lang={lang}
            emptyMessage={t.empty}
            searchPlaceholder={t.search_placeholder}
            previousButton={t.previous_button}
            nextButton={t.next_button}
            onTableReady={setTableInstance}
            initialPageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default BotsClient;
