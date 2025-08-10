"use client";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
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

export type AdminUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: "ADMIN" | "USER" | "MODERATOR" | string;
  status?: "active" | "suspended" | string;
  createdAt: string;
  image?: string | null;
};

interface ColumnsProps {
  t: Record<string, string>;
  lang: SupportedLang;
  locale: string;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onToggleStatus: (id: string) => void;
}

export function columns({
  t,
  lang,
  locale,
  onView,
  onEdit,
  onToggleStatus,
}: ColumnsProps): ColumnDef<AdminUser>[] {
  const isRtl = lang === "ar";

  return [
    {
      id: "user",
      accessorFn: (row) => `${row.name ?? ""} ${row.email ?? ""}`,
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_name}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={row.original.image ?? "/images/avatar.png"}
              alt={row.original.name ?? "User"}
            />
          </Avatar>
          <div>
            <div className="font-medium">{row.original.name ?? "—"}</div>
            <div className="text-muted-foreground text-xs">
              {row.original.email ?? "—"}
            </div>
          </div>
        </div>
      ),
      enableGlobalFilter: true,
    },
    {
      accessorKey: "role",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_role}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) =>
        t[`role_${String(row.getValue("role") ?? "").toLowerCase()}`] ??
        row.getValue("role") ??
        "—",
    },
    {
      accessorKey: "status",
      header: t.th_status,
      cell: ({ row }) => {
        const status = String(row.getValue("status") ?? "");
        return (
          <Badge
            variant={
              status === "active"
                ? "default"
                : status === "suspended"
                  ? "destructive"
                  : "outline"
            }
          >
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
        const user = row.original;
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
              <DropdownMenuItem onClick={() => onView(user.id)}>
                {t.view_button}
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => onEdit(user.id)}>
                {t.edit_button}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard.writeText(user.id);
                  toast.success(t.toast_copied);
                }}
              >
                {t.copy_button}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onToggleStatus(user.id)}
                className="text-destructive"
              >
                {user.status === "active" ? t.disable_button : t.enable_button}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
