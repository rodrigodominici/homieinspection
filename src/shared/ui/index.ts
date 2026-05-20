/**
 * Canonical shared UI primitives — aligned with Homie Admin Portal DS.
 *
 * Rules:
 *   - Pages should prefer these over ad-hoc compositions.
 *   - Never inline colors (style={{ color: "#..." }}). Use semantic tokens.
 *   - One CTA primary per screen.
 *   - DetailSheet: never stack two open at once.
 */
export { PageHeader } from "./PageHeader";
export { FiltersBar } from "./FiltersBar";
export { KpiCard } from "./KpiCard";
export { StatusBadge } from "./StatusBadge";
export { EmptyState } from "./EmptyState";
export { AlertCallout, type AlertVariant } from "./AlertCallout";
export { LoadingState } from "./LoadingState";
export { ErrorState } from "./ErrorState";
export { StickyActionBar } from "./StickyActionBar";
export { ConfirmDialog } from "./ConfirmDialog";
export { DetailSheet, type DetailSheetSize } from "./DetailSheet";
export { DataTable, type DataTableColumn } from "./DataTable";
export {
  getInspectionStatus,
  getSectionStatus,
  toneClass,
  INSPECTION_STATUS,
  SECTION_STATUS,
  type StatusEntry,
  type StatusTone,
} from "./status-registry";
