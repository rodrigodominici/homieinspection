/**
 * Shared bucket/KPI derivation for Admin & Executive lists.
 * Single source of truth so the dashboard, the queue and the admin list
 * never drift.
 */
import type { Inspection } from "./types";
import { getScheduleDatetime, priorityBucket, type PriorityBucket } from "./inspector-operational";
import {
  requiresExecutiveOwnerFollowUp,
  isWaitingOwner,
  isAcceptedByOwner,
} from "./inspection-combined-status";

export interface InspectionKpis {
  unassigned: number;
  inProgress: number;
  forReview: number;
  toPublish: number;
  /** Published, owner has not responded yet. */
  waitingOwner: number;
  /** Published, owner sent feedback — executive must act. */
  ownerFeedback: number;
  /** Owner accepted (or executive force-closed). */
  accepted: number;
}

export function bucketOf(insp: Inspection): PriorityBucket {
  return priorityBucket(
    {
      inspector_id: insp.inspector_id,
      executive_id: insp.executive_id,
      status: insp.status,
      owner_feedback_status: insp.owner_feedback_status ?? null,
      scheduleDatetime: getScheduleDatetime(insp),
    },
  );
}

export type StageKey =
  | "unassigned"
  | "inProgress"
  | "forReview"
  | "toPublish"
  | "waitingOwner"
  | "ownerFeedback"
  | "accepted";

/**
 * Single-inspection classifier — mirrors the logic in `computeInspectionKpis`
 * but returns the stage per row. Returns `null` for rows that don't map to a
 * tracked stage (e.g. pending inspection without inspector-yet-assigned edge
 * cases already counted via bucketOf).
 */
export function stageOf(insp: Inspection): StageKey | null {
  if (bucketOf(insp) === 0) return "unassigned";
  if (insp.status === "in_progress") return "inProgress";
  if (insp.status === "submitted" || insp.status === "in_review") return "forReview";
  if (insp.status === "approved") {
    if (isAcceptedByOwner(insp)) return "accepted";
    return "toPublish";
  }
  if (insp.status === "published" || insp.status === "sent") {
    if (requiresExecutiveOwnerFollowUp(insp)) return "ownerFeedback";
    if (isAcceptedByOwner(insp)) return "accepted";
    if (isWaitingOwner(insp)) return "waitingOwner";
  }
  return null;
}

export interface StageMeta {
  key: StageKey;
  label: string;
  /** Tailwind bg class for the segment. Uses design-system tokens. */
  colorClass: string;
  /** Tailwind text color for the legend swatch label. */
  legendDotClass: string;
}

export const STAGE_ORDER: StageKey[] = [
  "unassigned",
  "inProgress",
  "forReview",
  "toPublish",
  "waitingOwner",
  "ownerFeedback",
  "accepted",
];

export const STAGE_META: Record<StageKey, StageMeta> = {
  unassigned:    { key: "unassigned",    label: "Sin asignar",                 colorClass: "bg-status-bad",       legendDotClass: "bg-status-bad" },
  inProgress:    { key: "inProgress",    label: "En espera de check out",      colorClass: "bg-primary",          legendDotClass: "bg-primary" },
  forReview:     { key: "forReview",     label: "En gestión de cotización",    colorClass: "bg-primary/70",       legendDotClass: "bg-primary/70" },
  toPublish:     { key: "toPublish",     label: "Para publicar",               colorClass: "bg-primary/50",       legendDotClass: "bg-primary/50" },
  waitingOwner:  { key: "waitingOwner",  label: "En gestión de aprobación",    colorClass: "bg-primary/30",       legendDotClass: "bg-primary/30" },
  ownerFeedback: { key: "ownerFeedback", label: "Propietario pidió cambios",   colorClass: "bg-status-bad/70",    legendDotClass: "bg-status-bad/70" },
  accepted:      { key: "accepted",      label: "Aprobado",                    colorClass: "bg-accent",           legendDotClass: "bg-accent" },
};


export function computeInspectionKpis(inspections: Inspection[]): InspectionKpis {
  const k: InspectionKpis = {
    unassigned: 0, inProgress: 0, forReview: 0,
    toPublish: 0, waitingOwner: 0, ownerFeedback: 0, accepted: 0,
  };
  for (const i of inspections) {
    const s = stageOf(i);
    if (s) k[s]++;
  }
  return k;
}
