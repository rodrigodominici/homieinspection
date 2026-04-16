/**
 * Centralized section-completion rules — V3.
 *
 * Validation is pattern-based, not hardcoded by group_key:
 *  - Any field whose options contain `bueno` is a mandatory matrix field.
 *  - Any field with group_key `operational` that has options is a mandatory select.
 *  - Sections with no mandatory fields are always completable.
 *  - Photos are NOT required per-section; they are checked globally at finalization.
 */

import type { InspectionFieldValue } from './types';

export interface CompletionResult {
  valid: boolean;
  /** User-facing reason when `valid` is false */
  reason?: string;
}

export interface FinalizationResult {
  valid: boolean;
  /** Sections missing required photos */
  missingSections: string[];
}

/**
 * Detect whether a field is a mandatory matrix field (Bueno/Regular/Malo/NA pattern).
 */
function isMatrixField(f: Pick<InspectionFieldValue, 'value_json' | 'is_visible'>): boolean {
  if (!f.is_visible) return false;
  const opts = (f.value_json as { options?: Array<{ value: string }> })?.options;
  return Array.isArray(opts) && opts.some(o => o.value === 'bueno');
}

/**
 * Detect whether a field is a mandatory operational select (non-matrix, group=operational, has options).
 */
function isOperationalSelect(f: Pick<InspectionFieldValue, 'value_json' | 'is_visible' | 'group_key'>): boolean {
  if (!f.is_visible) return false;
  if (f.group_key !== 'operational') return false;
  const opts = (f.value_json as { options?: Array<{ value: string }> })?.options;
  return Array.isArray(opts) && opts.length > 0;
}

/**
 * Determine whether a section can be marked as completed.
 */
export function canCompleteSection(
  _sectionType: string,
  fieldValues: Pick<InspectionFieldValue, 'group_key' | 'value_text' | 'is_visible' | 'value_json'>[],
  _sectionKey?: string,
  _photoCount?: number,
): CompletionResult {
  const mandatory = fieldValues.filter(f => isMatrixField(f) || isOperationalSelect(f));

  if (mandatory.length === 0) {
    return { valid: true };
  }

  const unanswered = mandatory.filter(f => f.value_text === null || f.value_text === '');

  if (unanswered.length > 0) {
    return {
      valid: false,
      reason: `${unanswered.length} elemento(s) sin respuesta. Selecciona un estado para cada uno.`,
    };
  }

  return { valid: true };
}

/**
 * Check whether a section status string represents a "done" state.
 */
export function isSectionCompleted(sectionStatus: string): boolean {
  return sectionStatus === 'completed' || sectionStatus === 'reviewed';
}

/** Section types exempt from requiring a final observation before publish. */
const EXEMPT_FROM_FINAL_OBS = new Set([
  'property_meta', 'reception_meta', 'handover_meta', 'admin_meta',
  'introduction', 'signature', 'closing_operational',
]);

/**
 * Determine whether a section type requires a final observation before
 * the executive can publish the report.
 */
export function requiresFinalObservation(sectionType: string): boolean {
  return !EXEMPT_FROM_FINAL_OBS.has(sectionType);
}

/**
 * Section keys where at least one photo is required TO FINALIZE.
 *
 * Photo evidence is enforced ONLY at submission, never between sections.
 * This whitelist matches the business rule defined in the inspection flow.
 */
const PHOTO_REQUIRED_KEYS = new Set([
  'access',
  'living',
  'kitchen_appliances',
  'bodega',
  'estacionamiento',
]);
const PHOTO_REQUIRED_PATTERNS = [/^bedroom_/, /^bathroom_/];

/**
 * Determine whether a section requires photo evidence for finalization.
 */
export function requiresPhotoEvidence(sectionKey: string): boolean {
  if (PHOTO_REQUIRED_KEYS.has(sectionKey)) return true;
  return PHOTO_REQUIRED_PATTERNS.some((p) => p.test(sectionKey));
}

/**
 * Convert a section key into a friendly user-facing label.
 * E.g., `access` → "Acceso"; `bedroom_2` → "Dormitorio 2".
 */
export function getPhotoRequiredLabel(sectionKey: string, sectionTitle?: string): string {
  if (sectionTitle) return sectionTitle;
  const map: Record<string, string> = {
    access: 'Acceso',
    living: 'Living',
    kitchen_appliances: 'Cocina / Electrodomésticos',
    bodega: 'Bodega',
    estacionamiento: 'Estacionamiento',
  };
  if (map[sectionKey]) return map[sectionKey];
  const bedroomMatch = sectionKey.match(/^bedroom_(\d+)$/);
  if (bedroomMatch) return `Dormitorio ${bedroomMatch[1]}`;
  if (sectionKey === 'bedroom_studio') return 'Dormitorio';
  const bathroomMatch = sectionKey.match(/^bathroom_(\d+)$/);
  if (bathroomMatch) return `Baño ${bathroomMatch[1]}`;
  if (sectionKey === 'bathroom_studio') return 'Baño';
  return sectionKey;
}

export interface FinalizationResultDetailed extends FinalizationResult {
  /** User-facing labels parallel to `missingSections` */
  missingLabels: string[];
}

/**
 * Check whether the inspection can be finalized/submitted.
 * Validates that all sections requiring photos have at least one.
 */
export function canFinalizeInspection(
  sections: { id: string; section_key: string; section_title?: string; is_visible: boolean }[],
  photoCounts: Record<string, number>,
): FinalizationResultDetailed {
  const missingSections: string[] = [];
  const missingLabels: string[] = [];

  for (const section of sections) {
    if (!section.is_visible) continue;
    if (!requiresPhotoEvidence(section.section_key)) continue;
    const count = photoCounts[section.id] ?? 0;
    if (count === 0) {
      missingSections.push(section.section_key);
      missingLabels.push(getPhotoRequiredLabel(section.section_key, section.section_title));
    }
  }

  return {
    valid: missingSections.length === 0,
    missingSections,
    missingLabels,
  };
}

/**
 * Re-exported helpers for UI: detect mandatory fields using the same generic logic.
 */
export { isMatrixField, isOperationalSelect };
