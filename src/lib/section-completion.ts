/**
 * Centralized section-completion rules.
 *
 * MVP rules:
 *  - Standard sections require a status selection (Bueno / Regular / Malo / No Aplica).
 *  - Photos are MANDATORY for specific sections (kitchen, living, bedrooms, bathrooms, access).
 *  - Observations are OPTIONAL.
 *  - Non-standard section types without status fields can always be completed.
 */

import type { InspectionFieldValue } from './types';

export interface CompletionResult {
  valid: boolean;
  /** User-facing reason when `valid` is false */
  reason?: string;
}

/** Section keys where at least one photo is required. */
const PHOTO_REQUIRED_KEYS = new Set(['kitchen', 'living', 'living_dormitorio', 'access']);
const PHOTO_REQUIRED_PATTERNS = [/^bedroom_/, /^bathroom_/];

/**
 * Determine whether a section requires photo evidence for completion.
 */
export function requiresPhotoEvidence(sectionKey: string): boolean {
  if (PHOTO_REQUIRED_KEYS.has(sectionKey)) return true;
  return PHOTO_REQUIRED_PATTERNS.some((p) => p.test(sectionKey));
}

/**
 * Determine whether a section can be marked as completed.
 *
 * @param sectionType - e.g. 'space_standard', 'space_secondary', etc.
 * @param fieldValues - all field values belonging to this section
 * @param sectionKey - the section_key for photo requirement checks
 * @param photoCount - number of photos currently in this section
 */
export function canCompleteSection(
  _sectionType: string,
  fieldValues: Pick<InspectionFieldValue, 'group_key' | 'value_text' | 'is_visible'>[],
  sectionKey?: string,
  photoCount?: number,
): CompletionResult {
  const statusFields = fieldValues.filter(
    (f) => f.group_key === 'status' && f.is_visible,
  );

  // If the section has no status fields it's a non-standard section (meta, summary, etc.)
  // — allow completion without validation.
  if (statusFields.length === 0) {
    return { valid: true };
  }

  // At least one status field must have a non-null, non-empty value.
  const hasStatus = statusFields.some(
    (f) => f.value_text !== null && f.value_text !== '',
  );

  if (!hasStatus) {
    return {
      valid: false,
      reason: 'Selecciona un estado para continuar',
    };
  }

  // Photo requirement check
  if (sectionKey && typeof photoCount === 'number' && requiresPhotoEvidence(sectionKey) && photoCount === 0) {
    return {
      valid: false,
      reason: 'Se requiere al menos una foto',
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
const EXEMPT_FROM_FINAL_OBS = new Set(['property_meta', 'handover_meta', 'admin_meta']);

/**
 * Determine whether a section type requires a final observation before
 * the executive can publish the report.
 */
export function requiresFinalObservation(sectionType: string): boolean {
  return !EXEMPT_FROM_FINAL_OBS.has(sectionType);
}
