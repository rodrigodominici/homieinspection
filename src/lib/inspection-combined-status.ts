/**
 * Combined inspection status — derives a single UI status by collapsing
 * `inspection.status` and `inspection.owner_feedback_status`.
 *
 * Source of truth for badges, KPIs, filters and ordering once the report
 * has been published, since the owner-feedback loop is a second dimension
 * that lives on top of the published state.
 */
import type { Inspection } from "./types";
import type { StatusTone } from "@/shared/ui/status-registry";

export type CombinedStatusKey =
  | "pending"
  | "pending_assignment"
  | "assigned"
  | "in_progress"
  | "submitted"
  | "in_review"
  | "published_waiting_owner"
  | "owner_requested_changes"
  | "accepted_by_owner"
  | "approved_pending_publish"
  | "approved_manual_close";

export interface CombinedStatus {
  key: CombinedStatusKey;
  label: string;
  tone: StatusTone;
  /** True when the executive needs to act (e.g. owner sent feedback). */
  requiresExecutiveAction: boolean;
}

type Input = Pick<Inspection, "status" | "owner_feedback_status">;

export function getCombinedInspectionStatus(insp: Input): CombinedStatus {
  const fb = insp.owner_feedback_status ?? "none";

  // Published reports: owner-feedback dimension takes over.
  if (insp.status === "published" || insp.status === "sent") {
    if (fb === "pending_executive_review") {
      return {
        key: "owner_requested_changes",
        label: "Propietario pidió cambios",
        tone: "needs-changes",
        requiresExecutiveAction: true,
      };
    }
    if (fb === "accepted") {
      return {
        key: "accepted_by_owner",
        label: "Aceptada por propietario",
        tone: "approved",
        requiresExecutiveAction: false,
      };
    }
    return {
      key: "published_waiting_owner",
      label: "Publicada · esperando propietario",
      tone: "published",
      requiresExecutiveAction: false,
    };
  }

  // Approved: distinguish pre-publish vs post-feedback closure.
  if (insp.status === "approved") {
    if (fb === "accepted") {
      return {
        key: "accepted_by_owner",
        label: "Aceptada por propietario",
        tone: "approved",
        requiresExecutiveAction: false,
      };
    }
    return {
      key: "approved_pending_publish",
      label: "Aprobada",
      tone: "approved",
      requiresExecutiveAction: false,
    };
  }

  const baseMap: Record<string, { label: string; tone: StatusTone }> = {
    pending:            { label: "Pendiente",           tone: "pending" },
    pending_assignment: { label: "Sin asignar",         tone: "blocked" },
    assigned:           { label: "Asignada",            tone: "pending" },
    in_progress:        { label: "En progreso",         tone: "in-progress" },
    submitted:          { label: "Lista para revisión", tone: "pending" },
    in_review:          { label: "En revisión",         tone: "in-progress" },
  };
  const fallback = baseMap[insp.status] ?? { label: insp.status, tone: "neutral" as StatusTone };
  return {
    key: insp.status as CombinedStatusKey,
    label: fallback.label,
    tone: fallback.tone,
    requiresExecutiveAction: false,
  };
}

/** True when the executive needs to revisit a published inspection. */
export function requiresExecutiveOwnerFollowUp(insp: Input): boolean {
  return (
    (insp.status === "published" || insp.status === "sent") &&
    insp.owner_feedback_status === "pending_executive_review"
  );
}

/** Published with no owner response yet. */
export function isWaitingOwner(insp: Input): boolean {
  const fb = insp.owner_feedback_status ?? "none";
  return (insp.status === "published" || insp.status === "sent") && fb === "none";
}

/** Owner accepted everything (final state). */
export function isAcceptedByOwner(insp: Input): boolean {
  return insp.owner_feedback_status === "accepted";
}
