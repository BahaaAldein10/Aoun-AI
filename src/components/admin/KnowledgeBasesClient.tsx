// components/admin/KnowledgeBasesClient.tsx
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
import { KBWithOwner, columns as makeColumns } from "./KnowledgeBasesColumns";

interface Props {
  initialKbs?: KBWithOwner[];
  lang: SupportedLang;
  dict: Dictionary;
  stats?: {
    totalCachedItems?: number;
    totalRequests?: number;
    hitCount?: number;
    cacheHitRate?: number;
    totalAudioBytes?: number;
    totalKnowledgeBases?: number;
    totalDocuments?: number;
  };
}

const KnowledgeBasesClient = ({
  initialKbs = [],
  lang,
  dict,
  stats = {},
}: Props) => {
  const [tableInstance, setTableInstance] = useState<Table<KBWithOwner> | null>(
    null,
  );
  const [rows, setRows] = useState<KBWithOwner[]>(initialKbs);

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

  // ---------- STATS (real values passed from server) ----------
  const totalCachedItems = stats.totalCachedItems ?? 0;
  const totalRequests = stats.totalRequests ?? 0;
  const hitCount = stats.hitCount ?? 0;
  const cacheHitRate =
    typeof stats.cacheHitRate === "number"
      ? stats.cacheHitRate
      : totalRequests > 0
        ? hitCount / totalRequests
        : 0;
  const totalAudioBytes = stats.totalAudioBytes ?? 0;

  function formatBytesToMB(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2);
  }

  function formatPercent(frac: number) {
    return `${(frac * 100).toFixed(0)}%`;
  }
  // ---------------------------------------

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>

        <Button onClick={exportJson}>{t.export_json}</Button>
      </div>

      {/* ---------- STATS CARDS ---------- */}
      <div
        className={cn(
          "grid gap-4",
          "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
          isRtl && "rtl:text-right",
        )}
      >
        {/* Total Cached Items */}
        <Card className="p-4">
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-medium">
              {t.cache_total_items_title ?? "Total Cached Items"}
            </CardTitle>
          </CardHeader>
          <CardContent className="mt-2 p-0">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-semibold">
                {new Intl.NumberFormat(locale).format(totalCachedItems)}
              </div>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {t.cache_total_items_desc ??
                "Unique cached entries (best-effort)"}
            </p>
          </CardContent>
        </Card>

        {/* Cache Hit Rate */}
        <Card className="p-4">
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-medium">
              {t.cache_hit_rate_title ?? "Cache Hit Rate"}
            </CardTitle>
          </CardHeader>
          <CardContent className="mt-2 p-0">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-semibold">
                {formatPercent(cacheHitRate)}
              </div>
              <div className="text-muted-foreground text-sm">
                {new Intl.NumberFormat(locale).format(totalRequests)}{" "}
                {t.cache_requests_label ?? "requests"}
              </div>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {t.cache_hit_rate_desc ??
                "Ratio of cache hits to total requests (in-memory analytics)"}
            </p>
          </CardContent>
        </Card>

        {/* Total Audio Size */}
        <Card className="p-4">
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-medium">
              {t.cache_audio_size_title ?? "Total Audio Size"}
            </CardTitle>
          </CardHeader>
          <CardContent className="mt-2 p-0">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-semibold">
                {formatBytesToMB(totalAudioBytes)} MB
              </div>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {t.cache_audio_size_desc ??
                "Total size of cached audio files (UploadedFile)"}
            </p>
          </CardContent>
        </Card>
      </div>
      {/* ---------- /STATS CARDS ---------- */}

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
            getStatus={(r: KBWithOwner) => r.status}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default KnowledgeBasesClient;
