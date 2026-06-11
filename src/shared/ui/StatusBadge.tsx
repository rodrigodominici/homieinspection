import { cn } from "@/lib/utils";
import {
  getInspectionStatus,
  getSectionStatus,
  toneClass,
  type StatusEntry,
  type StatusTone,
} from "./status-registry";
import { getCombinedInspectionStatus } from "@/lib/inspection-combined-status";
import type { Inspection } from "@/lib/types";

export type StatusBadgeVariant = "solid" | "soft" | "outline";

interface StatusBadgeProps {
  /** Pass a raw status string (inspection or section). */
  status?: string;
  /**
   * Pass the full inspection (or just status + owner_feedback_status) to render
   * the combined post-publication status (owner feedback dimension).
   * Takes precedence over `status` when provided.
   */
  inspection?: Pick<Inspection, "status" | "owner_feedback_status">;
  /** Disambiguate which registry to look up. Defaults to "inspection". */
  kind?: "inspection" | "section";
  /** Override with a fully-resolved entry (e.g. derived inspector state). */
  entry?: StatusEntry;
  /** Override tone (rare). */
  tone?: StatusTone;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Canonical status badge backed by the StatusRegistry.
 * Replaces InspectionStatusBadge, SectionStatusBadge and InspectorStatusBadge.
 */
export function StatusBadge({
  status,
  inspection,
  kind = "inspection",
  entry,
  tone,
  size = "md",
  className,
}: StatusBadgeProps) {
  let resolved: StatusEntry;
  if (entry) {
    resolved = entry;
  } else if (inspection) {
    const combined = getCombinedInspectionStatus(inspection);
    resolved = { label: combined.label, tone: combined.tone };
  } else if (status) {
    resolved = kind === "section" ? getSectionStatus(status) : getInspectionStatus(status);
  } else {
    resolved = { label: "—", tone: "neutral" };
  }

  const finalTone = tone ?? resolved.tone;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs",
        toneClass(finalTone),
        className,
      )}
    >
      {resolved.label}
    </span>
  );
}
