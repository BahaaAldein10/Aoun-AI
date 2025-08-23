"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlanName, Subscription, SubscriptionStatus } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Avatar, AvatarImage } from "../ui/avatar";

export type SubscriptionWithUserWithPlan = Subscription & {
  user: { name: string; email: string; image: string };
  plan: { name: PlanName; priceAmount: number; interval: string };
};

interface ColumnsProps {
  t: Record<string, string>;
  locale: string;
}

export function columns({
  t,
  locale,
}: ColumnsProps): ColumnDef<SubscriptionWithUserWithPlan>[] {
  return [
    {
      id: "user",
      accessorFn: (row) => `${row.user.name ?? ""} ${row.user.email ?? ""}`,
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_user}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
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
      ),
      enableGlobalFilter: true,
    },
    {
      id: "plan",
      accessorFn: (row) => row.plan?.name ?? "—",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_plan}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.original.plan?.name ?? "—"}</div>
      ),
      filterFn: "equalsString",
    },
    {
      id: "price",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_price}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const raw = (row.original.plan?.priceAmount ?? 0) / 100;
        const amount = Number(raw) || 0;
        const currency = "USD";
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
      id: "interval",
      accessorFn: (row) => row.plan.interval ?? "—",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_cycle}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.original.plan?.interval ?? "—"}</div>
      ),
    },
    {
      accessorKey: "status",
      header: t.th_status,
      cell: ({ row }) => {
        const status = String(row.getValue("status") ?? "");
        const statusVariantMap: Record<
          SubscriptionStatus,
          "default" | "secondary" | "destructive" | "outline"
        > = {
          ACTIVE: "default",
          TRIALING: "secondary",
          PAST_DUE: "destructive",
          CANCELED: "outline",
          UNPAID: "destructive",
          FAILED: "destructive",
        };

        return (
          <Badge
            variant={statusVariantMap[status as SubscriptionStatus]}
            className="capitalize"
          >
            {t[`status_${status}`] ?? status}
          </Badge>
        );
      },
      filterFn: "equalsString",
    },
    {
      accessorKey: "currentPeriodStart",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_started_at}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const raw = row.getValue("currentPeriodStart") as string | Date | null;
        const date = raw ? new Date(raw) : null;
        return date && !isNaN(date.getTime())
          ? date.toLocaleString(locale)
          : "—";
      },
    },
    {
      accessorKey: "currentPeriodEnd",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_expires_at}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const raw = row.getValue("currentPeriodEnd") as string | Date | null;
        const date = raw ? new Date(raw) : null;
        return date && !isNaN(date.getTime())
          ? date.toLocaleString(locale)
          : "—";
      },
    },
  ];
}
