/**
 * Shared inspection utilities.
 *
 * Progress calculation is centralized here so every screen
 * (Inspector Dashboard, Inspector Detail, Admin Detail, Executive)
 * uses the exact same formula.
 */

import type { InspectionSection } from './types';

const COMPLETED_STATUSES = new Set(['completed', 'reviewed']);

export interface ProgressResult {
  total: number;
  completed: number;
  percent: number;
}

/**
 * Calculate inspection progress from visible sections.
 *
 * Only sections whose `is_visible` flag is true are counted.
 * A section counts as "completed" when its status is either
 * `completed` or `reviewed`.
 *
 * Statuses that do NOT count as completed:
 * - not_started
 * - assigned
 * - in_progress
 * - needs_changes
 */
export function calculateProgress(sections: Pick<InspectionSection, 'status' | 'is_visible'>[]): ProgressResult {
  const visible = sections.filter((s) => s.is_visible);
  const total = visible.length;
  const completed = visible.filter((s) => COMPLETED_STATUSES.has(s.status)).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}
