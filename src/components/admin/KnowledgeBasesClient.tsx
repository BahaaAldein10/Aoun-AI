"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table"; // adjust path if needed
import type { Dictionary } from "@/contexts/dictionary-context";
import type { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import { Table } from "@tanstack/react-table";
import { useState } from "react";
import toast from "react-hot-toast";
import { KBRow, columns as makeColumns } from "./KnowledgeBasesColumns";

interface Props {
  initialKbs?: KBRow[];
  lang: SupportedLang;
  dict: Dictionary;
}

const KnowledgeBasesClient = ({ initialKbs = [], lang, dict }: Props) => {
  const [tableInstance, setTableInstance] = useState<Table<KBRow> | null>(null);
  const [rows, setRows] = useState<KBRow[]>(initialKbs);

  const t: Record<string, string> = dict.admin_knowledge_bases;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  function exportJson() {
    const dataToExport = tableInstance
      ? tableInstance.getFilteredRowModel().rows.map((r) => r.original)
      : rows;

    const filename = `aoun-kbs-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.toast_exported);
  }

  function handleView(kb: KBRow) {
    toast(t.toast_view_placeholder.replace("{name}", kb.name ?? kb.id));
  }

  function handleEdit(kb: KBRow) {
    toast(t.toast_edit_placeholder.replace("{name}", kb.name ?? kb.id));
  }

  function handleDelete(kbId: string) {
    setRows((prev) => prev.filter((r) => r.id !== kbId));
    toast.success(t.toast_deleted);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>

        <Button onClick={exportJson}>{t.export_json}</Button>
      </div>

      <Card className={cn("w-full", isRtl && "rtl:text-right")}>
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
            data={rows}
            lang={lang}
            emptyMessage={t.empty}
            searchPlaceholder={t.search_placeholder}
            previousButton={t.previous_button}
            nextButton={t.next_button}
            onTableReady={setTableInstance}
            initialPageSize={20}
            getStatus={(r: KBRow) => r.status ?? "draft"}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default KnowledgeBasesClient;
