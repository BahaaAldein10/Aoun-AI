"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SupportedLang } from "@/lib/dictionaries";
import { cn } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import Image from "next/image";

interface ColumnsProps {
  t: Record<string, string>;
  lang: SupportedLang;
  locale: string;
  onView: (slug: string, lang: string) => void;
  onEdit: (slug: string, lang: string) => void;
  onDelete: (slug: string) => void;
}

export type BlogPostWithAuthor = {
  lang: string;
  id: string;
  createdAt: string;
  updatedAt: Date;
  status: "DRAFT" | "PUBLISHED";
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  featured: boolean;
  authorId: string;
  coverImage: string | null;
} & {
  author: {
    name: string | null;
    id: string;
    image: string | null;
  };
};

export function columns({
  t,
  lang,
  locale,
  onView,
  onEdit,
  onDelete,
}: ColumnsProps): ColumnDef<BlogPostWithAuthor>[] {
  const isRtl = lang === "ar";

  return [
    {
      id: "post",
      accessorFn: (r) =>
        `${r.title ?? ""} ${r.slug ?? ""} ${r.author.name ?? ""} ${r.id}`,
      header: ({ column }) => (
        <Button
          variant="ghost"
          className={cn("flex items-center", isRtl && "flex-row-reverse")}
          onClick={() => column.toggleSorting()}
        >
          {t.th_title}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-foreground font-medium">{row.original.title}</div>
      ),
      enableGlobalFilter: true,
    },
    {
      id: "author",
      accessorFn: (row) => row.author.name,
      header: ({ column }) => (
        <Button
          variant="ghost"
          className={cn("flex items-center", isRtl && "flex-row-reverse")}
          onClick={() => column.toggleSorting()}
        >
          {t.th_author}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const author = row.original.author;
        return (
          <div className="flex items-center gap-2">
            <Image
              src={author.image || "/images/avatar.png"}
              alt={author.name || "Author"}
              className="h-6 w-6 rounded-full"
              width={24}
              height={24}
              loading="lazy"
            />
            <span className="text-sm">{author.name || "—"}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "lang",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className={cn("flex items-center", isRtl && "flex-row-reverse")}
          onClick={() => column.toggleSorting()}
        >
          {t.th_language}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const lang = String(row.getValue("lang") ?? "—");
        return (
          <span className="text-muted-foreground text-sm">
            {lang === "en" ? "English" : "Arabic"}
          </span>
        );
      },
      filterFn: "equalsString",
    },
    {
      accessorKey: "featured",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className={cn("flex items-center", isRtl && "flex-row-reverse")}
          onClick={() => column.toggleSorting()}
        >
          {t.th_featured || "Featured"}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const featured = row.getValue("featured") as boolean;
        return (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
              featured
                ? "bg-success/20 text-success-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {featured ? t.featured_yes : t.featured_no}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className={cn("flex items-center", isRtl && "flex-row-reverse")}
          onClick={() => column.toggleSorting()}
        >
          {t.th_status}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const status = String(row.getValue("status") ?? "—");
        const isPublished = status === "PUBLISHED";
        return (
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
              isPublished
                ? "bg-success/20 text-success-foreground"
                : "bg-warning/20 text-warning-foreground",
            )}
          >
            {isPublished ? t.status_published : t.status_draft}
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          className={cn("flex items-center", isRtl && "flex-row-reverse")}
          onClick={() => column.toggleSorting()}
        >
          {t.th_created_at}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const raw = row.getValue("createdAt") as string | Date | null;
        const date = raw ? new Date(raw) : null;
        return date && !isNaN(date.getTime()) ? (
          <span className="text-muted-foreground text-sm">
            {date.toLocaleString(locale === "ar" ? "ar-EG" : "en-US")}
          </span>
        ) : (
          "—"
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const post = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={lang === "ar" ? "فتح القائمة" : "Open menu"}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isRtl ? "start" : "end"}>
              <DropdownMenuItem onClick={() => onView(post.slug, post.lang)}>
                {t.view_button}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(post.slug, post.lang)}>
                {t.edit_button}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(post.id)}
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
