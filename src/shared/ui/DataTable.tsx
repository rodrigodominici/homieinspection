import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  /** Tailwind width class (e.g. "w-32") */
  width?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  /** Unique key per row. */
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  emptyState?: React.ReactNode;
  className?: string;
}

/**
 * Composed DataTable — mirrors the AP pattern (no shadcn DataTable abstraction,
 * uses primitives). Supports clickable rows, sortable headers, and an empty slot.
 */
export function DataTable<T>({
  data, columns, rowKey, onRowClick, sortKey, sortDir, onSort, emptyState, className,
}: DataTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden shadow-sm", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border">
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              const SortIcon = !isSorted ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
              return (
                <TableHead
                  key={col.key}
                  className={cn(
                    "text-[11px] uppercase tracking-wide font-semibold text-muted-foreground/80",
                    col.width,
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                  )}
                >
                  {col.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      {col.header}
                      <SortIcon className={cn("h-3 w-3", !isSorted && "opacity-40")} />
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-border last:border-0",
                onRowClick && "cursor-pointer hover:bg-muted/30 transition-colors",
              )}
            >
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn(
                    "text-sm",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                  )}
                >
                  {col.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
