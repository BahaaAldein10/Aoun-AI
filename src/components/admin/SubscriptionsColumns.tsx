"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SupportedLang } from "@/lib/dictionaries";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import toast from "react-hot-toast";

export type Subscription = {
  id: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  plan: string;
  price: number | string;
  currency?: string | null;
  billingCycle: "monthly" | "yearly";
  status: "active" | "past_due" | "canceled" | "trialing" | string;
  startedAt: string | Date | null;
  expiresAt?: string | Date | null;
};

interface ColumnsProps {
  t: Record<string, string>;
  lang: SupportedLang;
  locale: string;
  onChangePlan: (id: string) => void;
  onCancel: (id: string) => void;
}

export function columns({
  t,
  lang,
  locale,
  onChangePlan,
  onCancel,
}: ColumnsProps): ColumnDef<Subscription>[] {
  return [
    {
      accessorKey: "id",
      header: t.th_subscription_id,
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("id")}</div>
      ),
    },
    {
      id: "user",
      accessorFn: (row) => `${row.userName ?? ""} ${row.userEmail ?? ""}`,
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_user}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.userName}</div>
          <div className="text-muted-foreground text-xs">
            {row.original.userEmail}
          </div>
        </div>
      ),
      enableGlobalFilter: true,
    },
    {
      accessorKey: "plan",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_plan}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: "price",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_price}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const raw = row.original.price;
        const amount = Number(raw ?? 0);
        const currency = row.original.currency ?? "USD";
        try {
          return new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            maximumFractionDigits: 2,
          }).format(amount);
        } catch {
          return `${amount.toFixed(2)} ${currency}`;
        }
      },
    },
    {
      accessorKey: "billingCycle",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_cycle}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
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
                : status === "trialing"
                  ? "secondary"
                  : status === "past_due"
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
      accessorKey: "startedAt",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_started_at}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const raw = row.getValue("startedAt") as string | Date | null;
        const date = raw ? new Date(raw) : null;
        return date && !isNaN(date.getTime())
          ? date.toLocaleString(locale)
          : "—";
      },
    },
    {
      accessorKey: "expiresAt",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_expires_at}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const raw = row.getValue("expiresAt") as string | Date | null;
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
        const subscription = row.original;
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
            <DropdownMenuContent align={lang === "ar" ? "start" : "end"}>
              <DropdownMenuItem onClick={() => onChangePlan(subscription.id)}>
                {t.change_plan_button}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard.writeText(subscription.id);
                  toast.success(t.toast_copied);
                }}
              >
                {t.copy_button}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onCancel(subscription.id)}
                className="text-destructive"
              >
                {t.cancel_button}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
