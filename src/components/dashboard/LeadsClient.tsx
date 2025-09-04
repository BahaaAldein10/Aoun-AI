"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import type { Dictionary } from "@/contexts/dictionary-context";
import type { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import { Integration, Lead } from "@prisma/client";
import { Table } from "@tanstack/react-table";
import { useState } from "react";
import toast from "react-hot-toast";
import { SpreadsheetSelectionModal } from "../shared/SpreadsheetSelectionModal";
import { columns as makeColumns } from "./LeadsColumns";

const LeadsClient = ({
  initialLeads = [],
  lang,
  dict,
  integrations = [], // Add integrations prop
}: {
  initialLeads?: Lead[];
  lang: SupportedLang;
  dict: Dictionary;
  integrations?: Integration[]; // Add this
}) => {
  const [tableInstance, setTableInstance] = useState<Table<Lead> | null>(null);
  const [rows, setRows] = useState<Lead[]>(initialLeads ?? []);
  const [isSpreadsheetModalOpen, setIsSpreadsheetModalOpen] = useState(false);

  const t: Record<string, string> = dict.dashboard_leads;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  // Check if Google Sheets integration exists and if it needs configuration
  const googleSheetsIntegration = integrations.find(
    (integration) =>
      integration.type === "GOOGLE_SHEETS" && integration.enabled,
  );

  const needsSpreadsheetConfig =
    googleSheetsIntegration &&
    !(googleSheetsIntegration.meta as { spreadsheetId: string })?.spreadsheetId;

  /** Export visible/filtered rows */
  function downloadCsv() {
    const dataToExport = tableInstance
      ? tableInstance.getFilteredRowModel().rows.map((r) => r.original)
      : rows;

    const headers = [
      t.th_name ?? "Name",
      t.th_contact ?? "Contact",
      t.th_status ?? "Status",
      t.th_source ?? "Source",
      t.th_captured_by ?? "Captured By",
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
      const updatedAt = r.updatedAt
        ? new Date(r.updatedAt).toLocaleString(locale)
        : "";
      const metaString = r.meta ? JSON.stringify(r.meta) : "";

      const cols = [
        r.name ?? "",
        contact,
        r.status,
        r.source ?? "",
        r.capturedBy ?? "",
        metaString,
        capturedAt,
        updatedAt,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      csvRows.push(cols.join(","));
    }

    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const datePart = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `aoun-leads-${datePart}-${lang}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.toast_exported ?? t.downloaded_csv ?? "Downloaded");
  }

  const handleSpreadsheetConfigured = () => {
    // Refresh the page or update the integration state
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={downloadCsv}>{t.download_csv}</Button>

          {/* Show Configure Spreadsheet button if Google Sheets needs config */}
          {needsSpreadsheetConfig ? (
            <Button
              variant="outline"
              onClick={() => setIsSpreadsheetModalOpen(true)}
              className="border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
            >
              {t.configure_spreadsheet ?? "Configure Spreadsheet"}
            </Button>
          ) : googleSheetsIntegration ? (
            <Button
              variant="outline"
              onClick={() => toast(t.sync_crm_placeholder ?? "Sync with CRM")}
            >
              {t.sync_crm ?? "Sync with Google Sheets"}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => toast(t.connect_crm_placeholder ?? "Connect CRM")}
            >
              {t.connect_crm}
            </Button>
          )}
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
            })}
            data={rows}
            lang={lang}
            emptyMessage={t.empty}
            searchPlaceholder={t.search_placeholder}
            previousButton={t.previous_button}
            nextButton={t.next_button}
            onTableReady={setTableInstance}
            initialPageSize={20}
            showStatusFilter
            getStatus={(r: Lead) => r.status ?? "NEW"}
          />
        </CardContent>
      </Card>

      {/* Spreadsheet Selection Modal */}
      <SpreadsheetSelectionModal
        isOpen={isSpreadsheetModalOpen}
        onClose={() => setIsSpreadsheetModalOpen(false)}
        onSuccess={handleSpreadsheetConfigured}
        t={t}
        lang={lang}
      />
    </div>
  );
};

export default LeadsClient;
