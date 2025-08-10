"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table"; // adjust path if needed
import type { Dictionary } from "@/contexts/dictionary-context";
import type { SupportedLang } from "@/lib/dictionaries";
import { Table } from "@tanstack/react-table";
import { useState } from "react";
import toast from "react-hot-toast";
import { columns as makeColumns, PostRow } from "./BlogsColumns";

const BlogsClient = ({
  initialPosts = [],
  lang,
  dict,
}: {
  initialPosts?: PostRow[];
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const [tableInstance, setTableInstance] = useState<Table<PostRow> | null>(
    null,
  );
  const [rows, setRows] = useState<PostRow[]>(initialPosts ?? []);

  const t: Record<string, string> = dict.admin_blogs;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  function downloadCsv() {
    const dataToExport = tableInstance
      ? tableInstance.getFilteredRowModel().rows.map((r) => r.original)
      : rows;

    const header = [
      t.th_title,
      t.th_slug,
      t.th_author,
      t.th_status,
      t.th_created_at,
    ];
    const csvRows = [header.join(",")];

    for (const r of dataToExport) {
      const line = [
        r.title,
        r.slug,
        r.authorName ?? "",
        r.status,
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
    a.download = `aoun-posts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.toast_exported);
  }

  function handleCreate() {
    toast.success(t.toast_create_placeholder);
  }

  function handleEdit(id: string) {
    toast.success(t.toast_edit_placeholder?.replace("{id}", id) ?? "Edit");
  }

  function handleDelete(id: string) {
    if (!confirm(t.confirm_delete)) return;
    setRows((prev) => prev.filter((p) => p.id !== id));
    toast.success(t.toast_deleted);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={downloadCsv}>{t.export_csv}</Button>
          <Button onClick={handleCreate}>{t.create_post}</Button>
        </div>
      </div>

      <Card className={isRtl ? "rtl:text-right" : ""}>
        <CardHeader>
          <CardTitle>{t.table_title}</CardTitle>
          <CardDescription>{t.table_description}</CardDescription>
        </CardHeader>

        <CardContent>
          <DataTable
            columns={makeColumns({
              t,
              lang,
              locale,
              onView: (id: string) => toast(t.view_post_placeholder ?? "View"),
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
            getStatus={(r: PostRow) => r.status ?? "draft"}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default BlogsClient;
