/**
 * Centralized section-completion rules.
 *
 * MVP rules:
 *  - Standard sections require a status selection (Bueno / Regular / Malo / No Aplica).
 *  - Photos are OPTIONAL.
 *  - Observations are OPTIONAL.
 *  - Non-standard section types without status fields can always be completed.
 */

import type { InspectionFieldValue } from './types';

export interface CompletionResult {
  valid: boolean;
  /** User-facing reason when `valid` is false */
  reason?: string;
}

/**
 * Determine whether a section can be marked as completed.
 *
 * @param sectionType - e.g. 'space_standard', 'space_secondary', etc.
 * @param fieldValues - all field values belonging to this section
 */
export function canCompleteSection(
  _sectionType: string,
  fieldValues: Pick<InspectionFieldValue, 'group_key' | 'value_text' | 'is_visible'>[],
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

  return { valid: true };
}

/**
 * Check whether a section status string represents a "done" state.
 */
export function isSectionCompleted(sectionStatus: string): boolean {
  return sectionStatus === 'completed' || sectionStatus === 'reviewed';
}
