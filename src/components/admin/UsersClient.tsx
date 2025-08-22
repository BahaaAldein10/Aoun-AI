"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import type { Dictionary } from "@/contexts/dictionary-context";
import { deleteUser } from "@/lib/actions/user";
import type { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import { CacheType } from "@prisma/client";
import { Table } from "@tanstack/react-table";
import { useState } from "react";
import toast from "react-hot-toast";
import Swal from "sweetalert2";
import { Button } from "../ui/button";
import EditUserDialog from "./EditUserDialog";
import {
  columns as makeColumns,
  UserWithSubscriptionWithUsage,
} from "./UsersColumns";

/**
 * Helper: sum usage minutes array safely
 */
function sumUsageMinutes(usage?: { minutes?: number | null }[]) {
  if (!usage || usage.length === 0) return 0;
  return usage.reduce((acc, u) => acc + (Number(u?.minutes ?? 0) || 0), 0);
}

/**
 * Helper: count cache entries by type
 */
function countCacheEntriesByType(
  cacheEntries?: { type: CacheType }[],
  type?: CacheType,
) {
  if (!cacheEntries || cacheEntries.length === 0) return 0;
  if (type) {
    return cacheEntries.filter((entry) => entry.type === type).length;
  }
  return cacheEntries.length;
}

/**
 * Helper: format date safely
 */
function formatDate(date: string | Date | null | undefined) {
  if (!date) return "";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().slice(0, 10); // YYYY-MM-DD format for CSV
  } catch {
    return "";
  }
}

const UsersClient = ({
  initialUsers = [],
  lang,
  dict,
}: {
  initialUsers: UserWithSubscriptionWithUsage[];
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const [tableInstance, setTableInstance] =
    useState<Table<UserWithSubscriptionWithUsage> | null>(null);

  const [user, setUser] = useState<UserWithSubscriptionWithUsage | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const t: Record<string, string> = dict.admin_users;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  function downloadCsv() {
    const dataToExport = tableInstance
      ? tableInstance.getFilteredRowModel().rows.map((r) => r.original)
      : initialUsers;

    // CSV Headers - include all columns
    const headers = [
      t.th_name || "Name",
      t.th_email || "Email",
      t.th_role || "Role",
      t.th_status || "Status",
      t.th_plan || "Plan",
      t.th_usage_minutes || "Usage Minutes",
      t.th_plan_minutes || "Plan Minutes",
      t.th_usage_percentage || "Usage %",
      t.th_total_cache || "Total Cache Entries",
      t.th_llm_cache || "LLM Cache",
      t.th_embedding_cache || "Embedding Cache",
      t.th_tts_cache || "TTS Cache",
      t.th_crawl_cache || "Crawl Cache",
      t.th_generic_cache || "Generic Cache",
      t.th_created_at || "Created At",
    ];

    const csvRows = [headers.join(",")];

    for (const u of dataToExport) {
      // Calculate usage metrics
      const usageTotal = sumUsageMinutes(u.usage);
      const planMinutes = Number(
        u.subscriptions?.[0]?.plan?.minutesPerMonth ?? 0,
      );
      const usagePercentage =
        planMinutes > 0
          ? Math.min((usageTotal / planMinutes) * 100, 100).toFixed(1)
          : "0";

      // Calculate cache metrics
      const cacheEntries = u.cacheEntries ?? [];
      const totalCache = cacheEntries.length;
      const llmCache = countCacheEntriesByType(cacheEntries, "LLM_RESPONSE");
      const embeddingCache = countCacheEntriesByType(cacheEntries, "EMBEDDING");
      const ttsCache = countCacheEntriesByType(cacheEntries, "TTS_AUDIO");
      const crawlCache = countCacheEntriesByType(cacheEntries, "CRAWL_RESULT");
      const genericCache = countCacheEntriesByType(cacheEntries, "GENERIC");

      // Get subscription status
      const status = u.subscriptions?.[0]?.status ?? "UNPAID";

      // Create row data
      const rowData = [
        u.name ?? "",
        u.email ?? "",
        u.role ?? "",
        status,
        u.subscriptions?.[0]?.plan?.name ?? "",
        usageTotal.toString(),
        planMinutes.toString(),
        usagePercentage,
        totalCache.toString(),
        llmCache.toString(),
        embeddingCache.toString(),
        ttsCache.toString(),
        crawlCache.toString(),
        genericCache.toString(),
        formatDate(u.createdAt),
      ];

      // Escape CSV values
      const escapedRow = rowData.map(
        (value) => `"${String(value).replace(/"/g, '""')}"`,
      );

      csvRows.push(escapedRow.join(","));
    }

    // Create and download CSV file
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aoun-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(t.toast_exported || "Users exported successfully");
  }

  async function handleDelete(id: string) {
    const user = initialUsers.find((user) => user.id === id);
    const user_name = user?.name;

    const result = await Swal.fire({
      title: t.confirm_title,
      text: `${t.confirm_delete} "${user_name}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: t.delete,
      cancelButtonText: t.cancel,
      focusCancel: true, // 👈 ensures Cancel is focused by default
      reverseButtons: true, // 👈 places Cancel on the left, safer UX
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
    });

    if (result.isConfirmed) {
      try {
        await deleteUser({ id, lang });
        toast.success(t.toast_deleted);
      } catch (error) {
        console.log(error);
        toast.error(t.toast_error);
      }
    }
  }

  function handleEdit(user: UserWithSubscriptionWithUsage) {
    setUser(user);
    setIsOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex w-full items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title || "Users"}</h1>
          <p className="text-muted-foreground text-sm">
            {t.description || "Manage your users and their subscriptions"}
          </p>
        </div>
        <div>
          <Button onClick={downloadCsv}>{t.export_csv || "Export CSV"}</Button>
        </div>
      </div>

      <Card className={cn("w-full", isRtl && "rtl:text-right")}>
        <CardHeader>
          <CardTitle>{t.table_title || "Users Table"}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={makeColumns({
              t,
              lang,
              locale,
              onDelete: handleDelete,
              onEdit: handleEdit,
            })}
            data={initialUsers}
            lang={lang}
            emptyMessage={t.empty || "No users found"}
            searchPlaceholder={t.search_placeholder || "Search users..."}
            previousButton={t.previous_button || "Previous"}
            nextButton={t.next_button || "Next"}
            onTableReady={setTableInstance}
            initialPageSize={20}
            showStatusFilter={true}
            getStatus={(u) => (u.subscriptions ?? [])[0]?.status}
          />
        </CardContent>
      </Card>

      <EditUserDialog
        user={user}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        t={t}
      />
    </div>
  );
};

export default UsersClient;
