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

export function computeInspectionKpis(inspections: Inspection[]): InspectionKpis {
  const k: InspectionKpis = {
    unassigned: 0, inProgress: 0, forReview: 0,
    toPublish: 0, waitingOwner: 0, ownerFeedback: 0, accepted: 0,
  };
  for (const i of inspections) {
    if (bucketOf(i) === 0) k.unassigned++;
    if (i.status === "in_progress") k.inProgress++;
    if (i.status === "submitted" || i.status === "in_review") k.forReview++;

    // Approved: split between "pending publish" (no owner loop yet)
    // and "accepted by owner" (loop closed).
    if (i.status === "approved") {
      if (isAcceptedByOwner(i)) k.accepted++;
      else k.toPublish++;
    }

    if (i.status === "published" || i.status === "sent") {
      if (requiresExecutiveOwnerFollowUp(i)) k.ownerFeedback++;
      else if (isAcceptedByOwner(i)) k.accepted++;
      else if (isWaitingOwner(i)) k.waitingOwner++;
    }
  }
  return k;
}
