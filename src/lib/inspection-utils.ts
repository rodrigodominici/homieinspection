/**
 * Shared inspection utilities.
 *
 * Progress calculation is centralized here so every screen
 * (Inspector Dashboard, Inspector Detail, Admin Detail, Executive)
 * uses the exact same formula.
 */

import type { InspectionSection } from './types';

const COMPLETED_STATUSES = new Set(['completed', 'reviewed']);

/** Section types that are contextual / non-operational and must NOT count toward progress. */
const NON_OPERATIONAL_TYPES = new Set(['property_meta']);

export interface ProgressResult {
  total: number;
  completed: number;
  percent: number;
}

/**
 * Calculate inspection progress from visible **operational** sections.
 *
 * Sections whose `section_type` is in `NON_OPERATIONAL_TYPES` (e.g. `property_meta`)
 * are excluded — they represent contextual data, not inspector work.
 *
 * A section counts as "completed" when its status is either
 * `completed` or `reviewed`.
 */
export function calculateProgress(
  sections: Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[]
): ProgressResult {
  const operational = sections.filter(
    (s) => s.is_visible && !NON_OPERATIONAL_TYPES.has(s.section_type)
  );
  const total = operational.length;
  const completed = operational.filter((s) => COMPLETED_STATUSES.has(s.status)).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}
