import { cn } from "@/lib/utils";

interface StickyActionBarProps {
  children: React.ReactNode;
  /** Position. Defaults to "bottom" (mobile pattern). */
  position?: "bottom" | "top";
  className?: string;
}

/**
 * Sticky action bar — mirrors the inspector-mobile-patterns memory.
 * Use to anchor primary CTAs at the bottom of long forms or details.
 * On desktop, prefer position="top" for review/admin workstation patterns.
 */
export function StickyActionBar({ children, position = "bottom", className }: StickyActionBarProps) {
  return (
    <div
      className={cn(
        "sticky z-20 -mx-4 px-4 py-3 bg-card border-border shadow-sm safe-area-bottom",
        position === "bottom" ? "bottom-0 border-t" : "top-0 border-b",
        className,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {children}
      </div>
    </div>
  );
}
