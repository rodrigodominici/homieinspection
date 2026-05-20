import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  /** Number of skeleton rows. */
  rows?: number;
  /** Skeleton height per row (Tailwind class). */
  rowHeight?: string;
  className?: string;
}

export function LoadingState({ rows = 4, rowHeight = "h-20", className }: LoadingStateProps) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Cargando">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("rounded-xl w-full", rowHeight)} />
      ))}
    </div>
  );
}
