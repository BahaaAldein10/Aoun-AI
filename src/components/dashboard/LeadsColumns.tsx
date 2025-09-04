"use client";

import { Button } from "@/components/ui/button";
import type { SupportedLang } from "@/lib/dictionaries";
import { Lead } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";

interface ColumnsProps {
  t: Record<string, string>;
  lang: SupportedLang;
  locale: string;
}

export function columns({ t, locale }: ColumnsProps): ColumnDef<Lead>[] {
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
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_status}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div>{String(row.getValue("status") ?? "—")}</div>,
      filterFn: "equalsString",
    },
    {
      accessorKey: "source",
      header: t.th_source,
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
  ];
}
