import { cn } from "@/lib/utils";

interface FiltersBarProps {
  children: React.ReactNode;
  sticky?: boolean;
  className?: string;
}

/**
 * Sticky filter bar — mirrors AP pattern.
 * Use as the wrapper around <Input/>, <Select/>, <ToggleGroup/> filters.
 */
export function FiltersBar({ children, sticky = false, className }: FiltersBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 mb-4",
        sticky &&
          "sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className,
      )}
    >
      {children}
    </div>
  );
}
