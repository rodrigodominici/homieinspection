import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type DetailSheetSize = "sm" | "md" | "lg" | "xl";

interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  size?: DetailSheetSize;
  /** Footer rendered at the bottom of the sheet. */
  footer?: React.ReactNode;
  side?: "right" | "left" | "bottom" | "top";
  className?: string;
}

const SIZE: Record<DetailSheetSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

/**
 * Canonical detail sheet. Enforces the AP rule: never stack sheets — opening
 * a second one must close the first. Callers manage open state, so just
 * ensure only one DetailSheet is open at a time.
 */
export function DetailSheet({
  open, onOpenChange, title, description, children, size = "md", footer, side = "right", className,
}: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={cn(SIZE[size], "overflow-y-auto flex flex-col", className)}>
        {(title || description) && (
          <SheetHeader>
            {title && <SheetTitle>{title}</SheetTitle>}
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
        )}
        <div className="flex-1 py-4">{children}</div>
        {footer && <div className="border-t border-border pt-4">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
