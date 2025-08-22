"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SupportedLang } from "@/lib/dictionaries";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  Table as TableType,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./button";
import { Input } from "./input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

function useDebounce<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  lang: SupportedLang;
  emptyMessage: string;
  searchPlaceholder: string;
  previousButton: string;
  nextButton: string;
  initialPageSize?: number;
  getStatus?: (row: TData) => string | undefined;
  onTableReady?: (table: TableType<TData>) => void;
  showStatusFilter?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  lang,
  emptyMessage,
  searchPlaceholder,
  previousButton,
  nextButton,
  initialPageSize = 20,
  getStatus,
  onTableReady,
  showStatusFilter = false,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  // Debounce user typing to avoid thrashing table internals
  const debouncedGlobalFilter = useDebounce(globalFilter, 280);

  // Memoize inputs — strongly encouraged for performance
  const memoColumns = useMemo(() => columns, [columns]);
  const memoData = useMemo(() => data, [data]);

  const table = useReactTable({
    data: memoData,
    columns: memoColumns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      pagination,
      columnFilters,
      globalFilter: debouncedGlobalFilter,
    },
    // enableSortingRemoval: false, // Global setting to disable unsorted state
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
  });

  useEffect(() => {
    if (onTableReady) {
      onTableReady(table);
    }
  }, [table, onTableReady]);

  // derive status options from data (works with different shapes)
  const statusOptions = useMemo(() => {
    if (!showStatusFilter || !getStatus) return [];

    const set = new Set<string>();
    memoData.forEach((row) => {
      try {
        const s = getStatus(row);
        if (s !== undefined && s !== null) set.add(String(s));
      } catch {
        // ignore extraction errors
      }
    });
    return Array.from(set).sort();
  }, [memoData, getStatus, showStatusFilter]);

  // local handler to wire Select -> TanStack column filter
  const handleStatusChange = useCallback(
    (value: string) => {
      const col = table.getColumn("status");
      if (!col) return;
      if (value === "all" || value === "") col.setFilterValue(undefined);
      else col.setFilterValue(value);
      // reset to 1st page to avoid empty results after filtering
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    [table],
  );

  // keep local UI input in sync with table (table uses debounced value)
  useEffect(() => {
    // When debouncedGlobalFilter changes, the table state is already set via table config.
    // We still want the visible input bound to the non-debounced state (`globalFilter`).
  }, [debouncedGlobalFilter]);

  // current status filter value (string | undefined)
  const currentStatusFilter = table.getColumn("status")?.getFilterValue() as
    | string
    | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Input
          type="search"
          placeholder={searchPlaceholder}
          value={globalFilter}
          onChange={(e) => {
            setGlobalFilter(e.target.value);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
          className="max-w-sm"
        />

        {showStatusFilter && statusOptions.length > 0 && (
          <Select
            value={
              currentStatusFilter != null ? String(currentStatusFilter) : "all"
            }
            onValueChange={(v) => handleStatusChange(v)}
          >
            <SelectTrigger
              className="min-w-[120px]"
              dir={lang === "ar" ? "rtl" : "ltr"}
            >
              <SelectValue placeholder={lang === "ar" ? "الحالة" : "Status"} />
            </SelectTrigger>
            <SelectContent dir={lang === "ar" ? "rtl" : "ltr"}>
              <SelectItem value="all">
                {lang === "ar" ? "الكل" : "All"}
              </SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Table className="min-w-max">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {table.getRowModel().rows?.length}{" "}
          {table.getRowModel().rows?.length === 1
            ? lang === "ar"
              ? "عنصر"
              : "item"
            : lang === "ar"
              ? "عناصر"
              : "items"}
        </span>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {previousButton}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {nextButton}
          </Button>
        </div>
      </div>
    </div>
  );
}
