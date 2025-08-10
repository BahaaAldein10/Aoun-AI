"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table"; // adjust path if needed
import type { Dictionary } from "@/contexts/dictionary-context";
import type { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import { Table } from "@tanstack/react-table";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { AdminUser, columns as makeColumns } from "./UsersColumns";

const UsersClient = ({
  initialUsers = [],
  lang,
  dict,
}: {
  initialUsers?: AdminUser[];
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const [tableInstance, setTableInstance] = useState<Table<AdminUser> | null>(
    null,
  );

  const t: Record<string, string> = dict.admin_users;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  function downloadCsv() {
    const dataToExport = tableInstance
      ? tableInstance.getFilteredRowModel().rows.map((r) => r.original)
      : initialUsers;

    const header = [
      t.th_name,
      t.th_email,
      t.th_role,
      t.th_status,
      t.th_created_at,
    ];
    const csvRows = [header.join(",")];

    for (const u of dataToExport) {
      const line = [
        u.name ?? "",
        u.email ?? "",
        u.role ?? "",
        u.status ?? "",
        u.createdAt ? new Date(u.createdAt).toLocaleString(locale) : "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      csvRows.push(line.join(","));
    }

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aoun-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.toast_exported);
  }

  // Action handlers (for now local UI-only changes + toasts)
  function handleView(id: string) {
    toast(t.view_user_placeholder);
  }

  function handleEdit(id: string) {
    toast(t.edit_user_placeholder);
  }

  function handleToggleStatus(id: string) {
    toast.success(t.toast_status_toggled);
  }

  return (
    <div className="space-y-6">
      <div className="flex w-full items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>

        <div>
          <Button onClick={downloadCsv}>{t.export_csv}</Button>
        </div>
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
              onToggleStatus: handleToggleStatus,
            })}
            data={initialUsers}
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

export default UsersClient;
