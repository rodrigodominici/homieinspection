/**
 * StatusRegistry — single source of truth for all status visuals/semantics
 * across the Inspection product. Replaces ad-hoc Record<status, {...}> maps
 * scattered across 14+ files.
 *
 * Aligned with Homie Admin Portal DS tokens.
 */
import type { InspectionStatus, SectionStatus } from "@/lib/types";

export type StatusTone =
  | "pending"
  | "in-progress"
  | "needs-changes"
  | "approved"
  | "published"
  | "blocked"
  | "neutral";

export interface StatusEntry {
  label: string;
  tone: StatusTone;
  /** Whether this status represents an actionable state for the role context. */
  actionable?: boolean;
}

const TONE_CLASS: Record<StatusTone, string> = {
  pending:         "bg-[hsl(var(--status-pending-bg))] text-[hsl(var(--status-pending-fg))]",
  "in-progress":   "bg-[hsl(var(--status-in-progress-bg))] text-[hsl(var(--status-in-progress-fg))]",
  "needs-changes": "bg-[hsl(var(--status-needs-changes-bg))] text-[hsl(var(--status-needs-changes-fg))]",
  approved:        "bg-[hsl(var(--status-approved-bg))] text-[hsl(var(--status-approved-fg))]",
  published:       "bg-[hsl(var(--status-published-bg))] text-[hsl(var(--status-published-fg))]",
  blocked:         "bg-[hsl(var(--status-blocked-bg))] text-[hsl(var(--status-blocked-fg))]",
  neutral:         "bg-muted text-muted-foreground",
};

export const INSPECTION_STATUS: Record<InspectionStatus, StatusEntry> = {
  pending:            { label: "Por coordinar",              tone: "pending" },
  pending_assignment: { label: "Sin asignar",                tone: "blocked" },
  assigned:           { label: "Coordinada p/ recibir",      tone: "pending" },
  in_progress:        { label: "En espera de check out",     tone: "in-progress" },
  submitted:          { label: "En gestión de cotización",   tone: "pending", actionable: true },
  in_review:          { label: "En gestión de cotización",   tone: "in-progress", actionable: true },
  approved:           { label: "En gestión de aprobación",   tone: "approved" },
  published:          { label: "En gestión de aprobación",   tone: "published" },
  accepted:           { label: "Aprobado",                   tone: "approved" },
  sent:               { label: "Finalizado",                 tone: "published" },
};



export const SECTION_STATUS: Record<SectionStatus, StatusEntry> = {
  not_started:    { label: "Pendiente",  tone: "neutral" },
  in_progress:    { label: "En progreso", tone: "in-progress" },
  completed:      { label: "Completada", tone: "approved" },
  reviewed:       { label: "Revisada",   tone: "published" },
};

export function getInspectionStatus(s: string): StatusEntry {
  return INSPECTION_STATUS[s as InspectionStatus] ?? { label: s, tone: "neutral" };
}

export function getSectionStatus(s: string): StatusEntry {
  return SECTION_STATUS[s as SectionStatus] ?? { label: s, tone: "neutral" };
}

export function toneClass(tone: StatusTone): string {
  return TONE_CLASS[tone];
}
