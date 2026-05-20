import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertVariant = "info" | "success" | "warning" | "danger";

interface AlertCalloutProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

const VARIANT_CLASS: Record<AlertVariant, string> = {
  info:    "border-primary/30 bg-primary/10 text-primary",
  success: "border-accent/30 bg-homie-soft-green text-accent",
  warning: "border-homie-orange/30 bg-homie-orange/10 text-homie-orange",
  danger:  "border-destructive/40 bg-destructive/20 text-destructive-foreground",
};

const DEFAULT_ICON: Record<AlertVariant, React.ReactNode> = {
  info:    <Info className="h-4 w-4 mt-0.5 shrink-0" />,
  success: <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />,
  warning: <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />,
  danger:  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />,
};

export function AlertCallout({
  variant = "info", title, children, icon, className,
}: AlertCalloutProps) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm flex items-start gap-2",
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {icon ?? DEFAULT_ICON[variant]}
      <div className="flex-1">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}
