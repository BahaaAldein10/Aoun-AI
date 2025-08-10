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

export type BotRow = {
  id: string;
  name?: string | null;
  status?: string | undefined;
  ownerId?: string | null;
  ownerName?: string | null;
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
}: ColumnsProps): ColumnDef<BotRow>[] {
  const isRtl = lang === "ar";

  return [
    {
      id: "bot",
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
        return (
          <Badge variant={status === "deployed" ? "default" : "secondary"}>
            {t[`status_${status}`] ?? status}
          </Badge>
        );
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
        const bot = row.original;
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
              <DropdownMenuItem onClick={() => onView(bot.id)}>
                {t.view_button}
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => onEdit(bot.id)}>
                {t.edit_bot}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onDelete(bot.id)}
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
