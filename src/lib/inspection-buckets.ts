/**
 * Shared bucket/KPI derivation for Admin & Executive lists.
 * Single source of truth so the dashboard, the queue and the admin list
 * never drift.
 */
import type { Inspection } from "./types";
import { getScheduleDatetime, priorityBucket, type PriorityBucket } from "./inspector-operational";

export interface InspectionKpis {
  unassigned: number;
  inProgress: number;
  forReview: number;
  toPublish: number;
  published: number;
}

export function bucketOf(insp: Inspection): PriorityBucket {
  return priorityBucket(
    {
      inspector_id: insp.inspector_id,
      executive_id: insp.executive_id,
      status: insp.status,
      scheduleDatetime: getScheduleDatetime(insp),
    },
  );
}

export function computeInspectionKpis(inspections: Inspection[]): InspectionKpis {
  const k: InspectionKpis = {
    unassigned: 0, inProgress: 0, forReview: 0,
    toPublish: 0, published: 0,
  };
  for (const i of inspections) {
    if (bucketOf(i) === 0) k.unassigned++;
    if (i.status === "in_progress") k.inProgress++;
    if (i.status === "submitted" || i.status === "in_review") k.forReview++;
    if (i.status === "approved") k.toPublish++;
    if (i.status === "published" || i.status === "sent" || i.status === "accepted") k.published++;
  }
  return k;
}
