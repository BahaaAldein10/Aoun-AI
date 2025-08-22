"use client";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SupportedLang } from "@/lib/dictionaries";
import {
  CacheType,
  PlanName,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";

interface ColumnsProps {
  t: Record<string, string>;
  lang: SupportedLang;
  locale: string;
  onDelete: (id: string) => void;
  onEdit: (user: UserWithSubscriptionWithUsage) => void;
  onToggleStatus?: (id: string) => void;
}

export type UserWithSubscriptionWithUsage = {
  name?: string | null;
  id: string;
  email?: string | null;
  image?: string | null;
  role?: UserRole | null;
  createdAt?: string | Date | null;
  usage?: { minutes?: number | null }[];
  subscriptions?: {
    id?: string;
    status: SubscriptionStatus;
    currentPeriodStart?: string | Date | null;
    currentPeriodEnd?: string | Date | null;
    plan?: {
      name?: PlanName | null;
      minutesPerMonth?: number | null;
    } | null;
  }[];
  cacheEntries?: {
    id: string;
    type: CacheType;
    key: string;
    createdAt: string | Date;
  }[];
};

/**
 * Helper: sum usage minutes array safely
 */
function sumUsageMinutes(usage?: { minutes?: number | null }[]) {
  if (!usage || usage.length === 0) return 0;
  return usage.reduce((acc, u) => acc + (Number(u?.minutes ?? 0) || 0), 0);
}

/**
 * Helper: count cache entries by type
 */
function countCacheEntriesByType(
  cacheEntries?: { type: CacheType }[],
  type?: CacheType,
) {
  if (!cacheEntries || cacheEntries.length === 0) return 0;
  if (type) {
    return cacheEntries.filter((entry) => entry.type === type).length;
  }
  return cacheEntries.length;
}

/**
 * Helper: format date safely
 */
function formatDate(date: string | Date | null | undefined, locale: string) {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return "—";
  }
}

export function columns({
  t,
  lang,
  locale,
  onDelete,
  onEdit,
}: ColumnsProps): ColumnDef<UserWithSubscriptionWithUsage>[] {
  const isRtl = lang === "ar";

  const numberFormatter = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);

  return [
    {
      id: "user",
      accessorFn: (row) => `${row.name ?? ""} ${row.email ?? ""}`,
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_name || "Name"}
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
          {t.th_role || "Role"}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) =>
        t[`role_${String(row.getValue("role") ?? "").toLowerCase()}`] ??
        row.getValue("role") ??
        "—",
    },

    {
      id: "status",
      accessorFn: (row) =>
        (row.subscriptions && row.subscriptions[0]?.status) ?? "UNPAID",
      header: t.th_status || "Status",
      cell: ({ row }) => {
        // Use subscription status (most recent) as user status indicator
        const status =
          (row.original.subscriptions &&
            row.original.subscriptions[0]?.status) ??
          "UNPAID";
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
      id: "plan",
      accessorFn: (row) => row.subscriptions?.[0]?.plan?.name ?? "—",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_plan || "Plan"}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium">
          {row.original.subscriptions?.[0]?.plan?.name ?? "—"}
        </div>
      ),
      filterFn: "equalsString",
    },

    {
      id: "usage",
      header: t.th_usage || "Usage",
      cell: ({ row }) => {
        const usageTotal = sumUsageMinutes(row.original.usage);
        const planMinutes = Number(
          row.original.subscriptions?.[0]?.plan?.minutesPerMonth ?? 0,
        );

        if (!usageTotal && !planMinutes) {
          return <div>—</div>;
        }

        const usedStr = numberFormatter(usageTotal);
        const planStr = planMinutes ? numberFormatter(planMinutes) : "—";

        const percentage =
          planMinutes > 0 ? Math.min((usageTotal / planMinutes) * 100, 100) : 0;

        return (
          <div className="flex flex-col gap-1">
            <div className="font-medium">
              {usedStr} / {planStr} {t.th_minutes || "minutes"}
            </div>
            <Progress value={percentage} className="h-2" />
          </div>
        );
      },
    },

    {
      id: "cached_responses",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_cached_responses || "Cached Responses"}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      accessorFn: (row) => countCacheEntriesByType(row.cacheEntries),
      cell: ({ row }) => {
        const cacheEntries = row.original.cacheEntries ?? [];
        const totalEntries = cacheEntries.length;
        const llmResponses = countCacheEntriesByType(
          cacheEntries,
          "LLM_RESPONSE",
        );
        const embeddings = countCacheEntriesByType(cacheEntries, "EMBEDDING");
        const ttsAudio = countCacheEntriesByType(cacheEntries, "TTS_AUDIO");

        if (totalEntries === 0) {
          return <div className="text-muted-foreground">—</div>;
        }

        return (
          <div className="flex flex-col gap-1">
            <div className="font-medium">
              {numberFormatter(totalEntries)} {t.th_total || "total"}
            </div>
            <div className="text-muted-foreground space-y-0.5 text-xs">
              {llmResponses > 0 && (
                <div>LLM: {numberFormatter(llmResponses)}</div>
              )}
              {embeddings > 0 && (
                <div>
                  {t.th_embeddings || "Embeddings"}:{" "}
                  {numberFormatter(embeddings)}
                </div>
              )}
              {ttsAudio > 0 && <div>TTS: {numberFormatter(ttsAudio)}</div>}
            </div>
          </div>
        );
      },
    },

    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting()}>
          {t.th_created_at || "Created At"}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium">
          {formatDate(row.original.createdAt, locale)}
        </div>
      ),
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
              <DropdownMenuItem
                onClick={() => onEdit(user)}
                dir={lang === "ar" ? "rtl" : "ltr"}
              >
                {t.edit_button || "Edit"}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => onDelete(user.id)}
                dir={lang === "ar" ? "rtl" : "ltr"}
                variant="destructive"
              >
                {t.delete_button || "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
