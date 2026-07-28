/**
 * Tokenized, accent-insensitive search helper for inspection lists.
 *
 * Used by Admin & Executive queues so a single query like "vanessa carvajal"
 * or "sergio 1202" matches rows even when tokens are non-contiguous or the
 * source contains diacritics/punctuation.
 */
import type { Inspection } from "./types";
import { getEffectiveSnapshot } from "./inspection-utils";

export interface InspectionHaystackOptions {
  inspectorName?: string | null;
  executiveName?: string | null;
}

/** Lowercase, strip diacritics, collapse non-alphanumerics to single spaces. */
export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Build a normalized haystack of all fields we want the search bar to hit.
 * Includes identity fields, HubSpot mapping, market, inspection type, and
 * people (inspector, executive, tenant).
 */
export function buildInspectionHaystack(
  insp: Inspection,
  opts: InspectionHaystackOptions = {},
): string {
  const snap = getEffectiveSnapshot(insp) ?? {};
  const parts: Array<string | null | undefined> = [
    insp.property_name,
    insp.address,
    insp.property_id,
    (insp as { hubspot_property_id?: string | null }).hubspot_property_id,
    insp.market,
    insp.inspection_type,
    opts.inspectorName ?? null,
    opts.executiveName ?? null,
    (snap.tenant_name as string | undefined) ?? null,
    (snap.property_name as string | undefined) ?? null,
    (snap.address as string | undefined) ?? null,
  ];
  return normalizeSearchText(parts.filter(Boolean).join(" "));
}

/**
 * AND-of-tokens substring match. Empty query → always true.
 * Every whitespace-separated token in `rawQuery` must appear in `haystack`.
 */
export function matchesInspectionQuery(haystack: string, rawQuery: string): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const tokens = q.split(" ").filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}
