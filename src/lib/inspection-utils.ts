/**
 * Shared inspection utilities.
 *
 * Progress calculation is centralized here so every screen
 * (Inspector Dashboard, Inspector Detail, Admin Detail, Executive)
 * uses the exact same formula.
 */

import type { Inspection, InspectionSection } from './types';

const COMPLETED_STATUSES = new Set(['completed', 'reviewed']);

/** Section types that are contextual / non-operational and must NOT count toward progress. */
const NON_OPERATIONAL_TYPES = new Set(['property_meta', 'reception_meta', 'introduction']);

/**
 * A section is "repairable" (can hold repair items, generate quotations and
 * appear as a physical area of the property) only when its `section_type`
 * starts with `space_`. Everything else — `introduction`, `property_meta`,
 * `reception_meta`, `handover_meta`, `closing_operational`, `signature`, … —
 * is administrative metadata and must never expose repair surfaces.
 */
export function isRepairableSection(
  section: Pick<InspectionSection, 'section_type'> | null | undefined,
): boolean {
  return !!section?.section_type?.startsWith('space_');
}

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

/**
 * Merge property_snapshot_json with property_overrides_json for display.
 *
 * The original snapshot is immutable for traceability. Admin edits are stored
 * in `property_overrides_json` and applied on top.
 */
export function getEffectiveSnapshot(inspection: Inspection): Record<string, unknown> {
  const snapshot = inspection.property_snapshot_json as Record<string, unknown>;
  const overrides = inspection.property_overrides_json as Record<string, unknown> | null;
  return overrides ? { ...snapshot, ...overrides } : snapshot;
}
