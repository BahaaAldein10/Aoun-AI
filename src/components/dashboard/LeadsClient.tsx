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
import { Lead, columns as makeColumns } from "./LeadsColumns";

const LeadsClient = ({
  initialLeads = [],
  lang,
  dict,
}: {
  initialLeads?: Lead[];
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const [tableInstance, setTableInstance] = useState<Table<Lead> | null>(null);
  const [rows, setRows] = useState<Lead[]>(initialLeads ?? []);

  const t: Record<string, string> = dict.dashboard_leads;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  function downloadCsv() {
    const dataToExport = tableInstance
      ? tableInstance.getFilteredRowModel().rows.map((r) => r.original)
      : rows;

    const headers = [
      t.th_name ?? "Name",
      t.th_contact ?? "Contact",
      t.th_status ?? "Status",
      t.th_source ?? "Source",
      t.th_captured_at ?? "Captured At",
    ];

    const csvRows: string[] = [
      headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(","),
    ];

    for (const r of dataToExport) {
      const contact = r.email ?? r.phone ?? "";
      const capturedAt = r.createdAt
        ? new Date(r.createdAt).toLocaleString(locale)
        : "";
      const cols = [
        r.name ?? "",
        contact,
        r.status,
        r.source ?? "",
        capturedAt,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      csvRows.push(cols.join(","));
    }

    // Prepend BOM so Excel recognizes UTF-8 (important for Arabic)
    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const datePart = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `aoun-leads-${datePart}-${lang}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.toast_exported ?? t.downloaded_csv ?? "Downloaded");
  }

  // action handlers (UI-only placeholders)
  function handleView(row: Lead) {
    toast(
      t.toast_view_placeholder?.replace("{name}", row.name ?? row.id) ?? "View",
    );
  }

  function handleContact(row: Lead) {
    toast(
      t.toast_contact_placeholder?.replace("{name}", row.name ?? row.id) ??
        "Contact",
    );
  }

  function handleDelete(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success(t.toast_deleted ?? "Deleted");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={downloadCsv}>{t.download_csv}</Button>
          <Button
            variant="outline"
            onClick={() => toast(t.connect_crm_placeholder ?? "Connect CRM")}
          >
            {t.connect_crm}
          </Button>
        </div>
      </div>

      <Card className={cn("w-full", isRtl && "rtl:text-right")}>
        <CardHeader>
          <CardTitle>
            {t.table_title ?? t.captured_leads ?? "Captured Leads"}
          </CardTitle>
        </CardHeader>

        <CardContent>
          <DataTable
            columns={makeColumns({
              t,
              lang,
              locale,
              onView: handleView,
              onContact: handleContact,
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
            getStatus={(r: Lead) => r.status ?? "new"}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadsClient;
