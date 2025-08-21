"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import type { Dictionary } from "@/contexts/dictionary-context";
import { deleteBlogPost } from "@/lib/actions/blog";
import type { SupportedLang } from "@/lib/dictionaries";
import { Table } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import Swal from "sweetalert2";
import { BlogPostWithAuthor, columns as makeColumns } from "./BlogsColumns";

const BlogsClient = ({
  initialPosts = [],
  lang,
  dict,
}: {
  initialPosts: BlogPostWithAuthor[];
  lang: SupportedLang;
  dict: Dictionary;
}) => {
  const [tableInstance, setTableInstance] =
    useState<Table<BlogPostWithAuthor> | null>(null);
  const [rows, setRows] = useState<BlogPostWithAuthor[]>(initialPosts ?? []);

  const router = useRouter();

  const t: Record<string, string> = dict.admin_blogs;
  const locale = lang === "ar" ? "ar" : "en-US";
  const isRtl = lang === "ar";

  function downloadCsv() {
    const dataToExport = tableInstance
      ? tableInstance.getFilteredRowModel().rows.map((r) => r.original)
      : rows;

    const header = [
      t.th_title,
      t.th_author,
      t.th_lang || "Language",
      t.th_featured || "Featured",
      t.th_status,
      t.th_created_at,
    ];
    const csvRows = [header.join(",")];

    for (const r of dataToExport) {
      const line = [
        r.title,
        r.author.name ?? "",
        r.lang === "en" ? "English" : "Arabic",
        r.featured ? t.featured_yes : t.featured_no,
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
    a.download = `blog-posts-${lang}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.toast_exported);
  }

  function handleCreate() {
    router.push(`/${lang}/admin/blog/add`);
  }

  function handleView(slug: string, lang: string) {
    router.push(`/${lang}/blog/${slug}`);
  }

  function handleEdit(slug: string, lang: string) {
    router.push(`/${lang}/admin/blog/edit/${slug}`);
  }

  async function handleDelete(id: string) {
    const post = initialPosts.find((post) => post.id === id);
    const post_title = post?.title;

    const result = await Swal.fire({
      title: t.confirm_title,
      text: `${t.confirm_delete} "${post_title}"?`,
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
        await deleteBlogPost({ id, lang });
        setRows((prev) => prev.filter((p) => p.id !== id));
        toast.success(t.toast_deleted);
      } catch (error) {
        console.error("Delete failed:", error);
        toast.error(t.toast_delete_failed);
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.description}</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={downloadCsv} variant="outline">
            {t.export_csv}
          </Button>
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
            getStatus={(r) => r.status}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default BlogsClient;
