"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SupportedLang } from "@/lib/dictionaries";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";

export type PostRow = {
  id: string;
  title: string;
  slug: string;
  status: "published" | "draft" | string;
  authorName?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

interface ColumnsProps {
  t: Record<string, string>;
  lang: SupportedLang;
  locale: string;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function columns({
  t,
  lang,
  locale,
  onView,
  onEdit,
  onDelete,
}: ColumnsProps): ColumnDef<PostRow>[] {
  const isRtl = lang === "ar";

  return [
    {
      id: "post",
      accessorFn: (r) =>
        `${r.title ?? ""} ${r.slug ?? ""} ${r.authorName ?? ""} ${r.id}`,
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_title}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.original.title}</div>
      ),
      enableGlobalFilter: true,
    },
    {
      accessorKey: "slug",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_slug}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => row.getValue("slug") ?? "—",
    },
    {
      accessorKey: "authorName",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_author}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => row.getValue("authorName") ?? "—",
    },
    {
      accessorKey: "status",
      header: t.th_status,
      cell: ({ row }) => <div>{String(row.getValue("status") ?? "—")}</div>,
      filterFn: "equalsString",
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_created_at}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const raw = row.getValue("createdAt") as string | Date | null;
        const date = raw ? new Date(raw) : null;
        return date && !isNaN(date.getTime())
          ? date.toLocaleString(locale)
          : "—";
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">
                  {lang === "ar" ? "فتح القائمة" : "Open menu"}
                </span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align={isRtl ? "start" : "end"}>
              <DropdownMenuItem onClick={() => onView(p.id)}>
                {t.view_button}
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => onEdit(p.id)}>
                {t.edit_button}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onDelete(p.id)}
                className="text-destructive"
              >
                {t.delete_button}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
