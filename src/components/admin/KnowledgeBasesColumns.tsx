"use client";

import { Badge } from "@/components/ui/badge";
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
import toast from "react-hot-toast";

export type KBRow = {
  id: string;
  name?: string | null;
  status: "published" | "draft" | "archived" | string;
  ownerId?: string | null;
  ownerName?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

interface ColumnsProps {
  t: Record<string, string>;
  lang: SupportedLang;
  locale: string;
  onView: (row: KBRow) => void;
  onEdit: (row: KBRow) => void;
  onDelete: (id: string) => void;
}

function statusBadge(t: Record<string, string>, status: string) {
  switch (status) {
    case "published":
      return (
        <Badge variant="default">{t.status_published ?? "Published"}</Badge>
      );
    case "draft":
      return <Badge>{t.status_draft ?? "Draft"}</Badge>;
    case "archived":
      return (
        <Badge variant="secondary">{t.status_archived ?? "Archived"}</Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
}

export function columns({
  t,
  lang,
  locale,
  onView,
  onEdit,
  onDelete,
}: ColumnsProps): ColumnDef<KBRow>[] {
  const isRtl = lang === "ar";

  return [
    {
      id: "kb",
      accessorFn: (row) =>
        `${row.name ?? ""} ${row.ownerName ?? ""} ${row.id ?? ""}`,
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_name}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.original.name ?? "—"}</div>
      ),
      enableGlobalFilter: true,
    },
    {
      accessorKey: "ownerName",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_owner}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => row.getValue("ownerName") ?? "—",
    },
    {
      accessorKey: "status",
      header: t.th_status,
      cell: ({ row }) => {
        const status = String(row.getValue("status") ?? "draft");
        return statusBadge(t, status);
      },
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
        const kb = row.original;
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
              <DropdownMenuItem onClick={() => onView(kb)}>
                {t.view_button}
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => onEdit(kb)}>
                {t.edit_button}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard.writeText(kb.id);
                  toast.success(t.toast_copied);
                }}
              >
                {t.copy_button}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onDelete(kb.id)}
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
