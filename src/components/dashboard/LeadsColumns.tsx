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
import toast from "react-hot-toast";

export type Lead = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  source?: string;
  createdAt: string;
};

interface ColumnsProps {
  t: Record<string, string>;
  lang: SupportedLang;
  locale: string;
  onView: (row: Lead) => void;
  onContact: (row: Lead) => void;
  onDelete: (id: string) => void;
}

export function columns({
  t,
  lang,
  locale,
  onView,
  onContact,
  onDelete,
}: ColumnsProps): ColumnDef<Lead>[] {
  const isRtl = lang === "ar";

  return [
    {
      id: "lead",
      accessorFn: (r: Lead) =>
        `${r.name ?? ""} ${r.email ?? ""} ${r.phone ?? ""} ${r.id}`,
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
      id: "contact",
      accessorFn: (r: Lead) => r.email ?? r.phone ?? "",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_contact}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.email ?? row.original.phone ?? "—"}
        </div>
      ),
      enableGlobalFilter: true,
    },
    {
      accessorKey: "status",
      header: t.th_status,
      cell: ({ row }) => <div>{String(row.getValue("status") ?? "—")}</div>,
      filterFn: "equalsString",
    },
    {
      accessorKey: "source",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_source}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => row.getValue("source") ?? "—",
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_captured_at}
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
        const lead = row.original;
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
              <DropdownMenuItem onClick={() => onView(lead)}>
                {t.view_button}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onContact(lead)}>
                {t.contact_button ?? t.connect_crm ?? "Contact"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard.writeText(lead.id);
                  toast.success(t.toast_copied);
                }}
              >
                {t.copy_button}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onDelete(lead.id)}
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
