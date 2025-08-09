"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dictionary } from "@/contexts/dictionary-context";
import type { SupportedLang } from "@/lib/dictionaries";
import { useMemo, useState } from "react";

type Lead = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  source?: string;
  createdAt: string;
};

const LeadsClient = ({
  initialLeads,
  lang,
  dict,
}: {
  initialLeads: Lead[];
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const t = dict.dashboard_leads;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rows] = useState<Lead[]>(initialLeads ?? []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.name ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  const locale = lang === "ar" ? "ar" : "en-US";

  function downloadCsv() {
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

    for (const r of filtered) {
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
  }

  return (
    <div className="space-y-6">
      {/* Header: title + actions. Actions become stacked on small screens */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold rtl:text-right">{t.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.subtitle ?? t.description ?? "View and manage captured leads"}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
          {/* Controls: search, select, buttons - responsive widths */}
          <div className="flex w-full gap-2 sm:w-auto">
            <Input
              className="w-full"
              placeholder={t.search_placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v)}
              dir={lang === "ar" ? "rtl" : "ltr"}
            >
              <SelectTrigger className="min-w-[140px] cursor-pointer">
                <SelectValue placeholder={t.filter_all} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.filter_all}</SelectItem>
                <SelectItem value="new">{t.filter_new}</SelectItem>
                <SelectItem value="contacted">{t.filter_contacted}</SelectItem>
                <SelectItem value="qualified">{t.filter_qualified}</SelectItem>
                <SelectItem value="converted">{t.filter_converted}</SelectItem>
                <SelectItem value="lost">{t.filter_lost}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button onClick={downloadCsv}>{t.download_csv}</Button>

            <Button
              variant="outline"
              onClick={() => alert(t.connect_crm_placeholder)}
            >
              {t.connect_crm}
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {t.table_title ?? t.captured_leads ?? "Captured Leads"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Desktop / tablet table (md and up) */}
          <div className="hidden md:block">
            <div className="max-h-[60vh] overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-left text-xs rtl:text-right">
                    <th className="p-2">{t.th_name}</th>
                    <th className="p-2">{t.th_contact}</th>
                    <th className="p-2">{t.th_status}</th>
                    <th className="p-2">{t.th_source}</th>
                    <th className="p-2">{t.th_captured_at}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-muted-foreground p-4 text-center"
                      >
                        {t.empty ?? "No leads yet"}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">{row.name ?? "—"}</td>
                        <td className="p-2">{row.email ?? row.phone ?? "—"}</td>
                        <td className="p-2">{row.status}</td>
                        <td className="p-2">{row.source ?? "—"}</td>
                        <td className="p-2">
                          {new Date(row.createdAt).toLocaleString(locale)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile list view (under md) */}
          <div className="max-h-[60vh] space-y-2 overflow-auto md:hidden">
            {filtered.length === 0 ? (
              <div className="text-muted-foreground p-4 text-center">
                {t.empty}
              </div>
            ) : (
              filtered.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border p-3 shadow-sm"
                  dir={lang === "ar" ? "rtl" : "ltr"}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{row.name ?? "—"}</div>
                    <div className="text-muted-foreground text-xs">
                      {row.status}
                    </div>
                  </div>

                  <div className="text-muted-foreground mt-2 grid gap-1 text-sm">
                    <div>
                      <strong className="inline-block w-20">
                        {t.th_contact}:
                      </strong>
                      <span className="ml-1">
                        {row.email ?? row.phone ?? "—"}
                      </span>
                    </div>
                    <div>
                      <strong className="inline-block w-20">
                        {t.th_source}:
                      </strong>
                      <span className="ml-1">{row.source ?? "—"}</span>
                    </div>
                    <div>
                      <strong className="inline-block w-20">
                        {t.th_captured_at}:
                      </strong>
                      <span className="ml-1">
                        {new Date(row.createdAt).toLocaleString(locale)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadsClient;
