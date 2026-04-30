/**
 * Single source of truth for outbound HubSpot sync retry classification.
 *
 * Imported by BOTH the UI (`AdminIntegrationHubSpotOutboundLogs.tsx`,
 * inspection-detail page) AND the edge function (`retry-hubspot-sync`,
 * via relative path). Pure TS, zero imports — keeps Deno + Vite happy.
 *
 * Vocabulary changes here propagate everywhere; do not duplicate.
 */

export type RetryClass = 'retryable' | 'non_retryable' | 'not_failed';

/** HubSpot/network HTTP statuses that warrant a retry. */
export const RETRYABLE_HTTP_STATUSES = new Set<number>([408, 425, 429, 500, 502, 503, 504]);

/**
 * Substrings inside `error_message` indicating a transient failure.
 * Match is case-insensitive.
 */
export const RETRYABLE_ERROR_PATTERNS: readonly string[] = [
  'request_failed',
  'timeout',
  'econn',
  'fetch failed',
  'network',
];

/**
 * `error_message` exact strings or prefixes that are deterministic.
 * Re-running with the same payload will fail the same way.
 */
export const NON_RETRYABLE_ERROR_PREFIXES: readonly string[] = [
  'unauthorized:',
  'unauthorized',
  'invalid_json',
  'missing_inspection_id',
  'invalid_action:',
  'hubspot_private_app_token_missing',
  'inspection_not_found:',
  'missing_key_date',
  'invalid_event_time',
  'no_active_external_reference',
  'invalid_external_object_id:',
  'reference_lookup_failed:',
];

export interface ClassifiableLogRow {
  status: string | null | undefined;
  response_status?: number | null;
  error_message?: string | null;
}

export function classifyOutboundFailure(row: ClassifiableLogRow): RetryClass {
  // Skipped + success rows are deliberate no-ops or wins; never retry.
  if (row.status !== 'error') return 'not_failed';

  const msg = (row.error_message ?? '').toLowerCase();

  // 1. Deterministic deny-list wins first — even if HTTP status looks transient
  //    (e.g. a 500 that we already know maps to a missing-token state).
  for (const prefix of NON_RETRYABLE_ERROR_PREFIXES) {
    if (msg.startsWith(prefix.toLowerCase())) return 'non_retryable';
  }

  // 2. Transient HTTP statuses from HubSpot.
  if (typeof row.response_status === 'number' && RETRYABLE_HTTP_STATUSES.has(row.response_status)) {
    return 'retryable';
  }

  // 3. Network/timeout messages.
  for (const pat of RETRYABLE_ERROR_PATTERNS) {
    if (msg.includes(pat)) return 'retryable';
  }

  // 4. Any other 4xx HubSpot response is deterministic (bad payload, bad id, etc.).
  if (typeof row.response_status === 'number' && row.response_status >= 400 && row.response_status < 500) {
    return 'non_retryable';
  }

  // Default conservative: don't auto-classify unknown errors as retryable.
  return 'non_retryable';
}

export function retryClassLabel(c: RetryClass): string {
  switch (c) {
    case 'retryable': return 'Reintentable';
    case 'non_retryable': return 'No reintentable';
    case 'not_failed': return '—';
  }
}
