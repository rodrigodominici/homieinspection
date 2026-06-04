import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  /** Optional trend % vs previous period. Omit to skip the trend chip. */
  trend?: number;
  /** If true, going down is "good" (e.g. no-show rate). */
  inverted?: boolean;
  accent?: "green" | "red" | "amber" | "blue";
  /** Optional icon shown next to the value. */
  icon?: React.ReactNode;
  hint?: string;
  trendSuffix?: string;
  /** When provided, the card becomes clickable (e.g. to apply a filter). */
  onClick?: () => void;
  /** Highlight the card as the active filter. */
  active?: boolean;
}

const ACCENT_CLASS: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  green: "border-t-4 border-t-accent",
  red:   "border-t-4 border-t-destructive",
  amber: "border-t-4 border-t-homie-orange",
  blue:  "border-t-4 border-t-primary",
};

export function KpiCard({
  label, value, trend, inverted = false, accent, icon, hint, trendSuffix = "%", onClick, active,
}: KpiCardProps) {
  const showTrend = typeof trend === "number";
  const goingUp = (trend ?? 0) > 0;
  const isPositive = inverted ? !goingUp : goingUp;
  const Arrow = goingUp ? ArrowUp : ArrowDown;
  const tone =
    (trend ?? 0) === 0
      ? "bg-muted text-muted-foreground"
      : isPositive
        ? "bg-accent/15 text-accent"
        : "bg-destructive/15 text-destructive";

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        accent && ACCENT_CLASS[accent],
        onClick && "cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "ring-2 ring-primary ring-offset-2 bg-primary/5",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="font-display text-3xl font-bold text-foreground flex items-center gap-2">
          {icon}
          {value}
        </p>
        {showTrend && (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>
            <Arrow className="h-3 w-3" />
            {Math.abs(trend ?? 0)}{trendSuffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
