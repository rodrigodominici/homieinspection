/**
 * Legacy badge wrapper — preserved for import compatibility.
 * All rendering is delegated to the canonical StatusBadge in src/shared/ui.
 * Do not add config here; update src/shared/ui/status-registry.ts instead.
 */
import { StatusBadge } from '@/shared/ui/StatusBadge';

export function InspectionStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} kind="inspection" />;
}

export function SectionStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} kind="section" size="sm" />;
}
