"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SupportedLang } from "@/lib/dictionaries";
import { KnowledgeBase, KnowledgeBaseSource } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { KbMetadata } from "../dashboard/KnowledgeBaseClient";
import { Avatar, AvatarImage } from "../ui/avatar";

export type KBWithOwner = KnowledgeBase & {
  user: {
    id: string;
    name: string | null;
    image: string | null;
    email: string;
  };
} & { status: "URL" | "UPLOAD" };

interface ColumnsProps {
  t: Record<string, string>;
  lang: SupportedLang;
  locale: string;
}

export function columns({
  t,
  lang,
  locale,
}: ColumnsProps): ColumnDef<KBWithOwner>[] {
  const isRtl = lang === "ar";

  return [
    {
      id: "kb",
      accessorFn: (row) =>
        `${row.title ?? ""} ${row.user.name ?? ""} ${row.id ?? ""}`,
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_name}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.original.title ?? "—"}</div>
      ),
      enableGlobalFilter: true,
    },
    {
      id: "owner",
      accessorFn: (row) => `${row.user.name ?? ""} ${row.user.email}`,
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_owner}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={row.original.user.image ?? "/images/avatar.png"}
                alt={row.original.user.name ?? "User"}
              />
            </Avatar>
            <div>
              <div className="font-medium">{row.original.user.name ?? "—"}</div>
              <div className="text-muted-foreground text-xs">
                {row.original.user.email ?? "—"}
              </div>
            </div>
          </div>
        );
      },
      enableGlobalFilter: true,
    },
    {
      accessorKey: "status",
      header: t.th_source,
      cell: ({ row }) => {
        const metadata = row.original.metadata as KbMetadata;
        const source = metadata?.url ? "URL" : "UPLOAD";
        return <Badge variant="outline">{source}</Badge>;
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
  ];
}
