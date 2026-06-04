import { Progress } from '@/components/ui/progress';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InspectionSection } from '@/lib/types';

interface SectionSidebarProps {
  operationalSections: InspectionSection[];
  activeSectionId: string | null;
  onSelectSection: (id: string) => void;
  repairsBySection: Record<string, any[]>;
  missingSections: InspectionSection[];
  showObservationWarnings: boolean;
}

/**
 * Spaces-only sidebar for the Inspección mode of the Executive review
 * workstation. Inspection metadata (Introducción, Datos del inmueble,
 * Firma del inquilino, etc.) lives in the top-rail Contexto popover.
 */
export function SectionSidebar({
  operationalSections,
  activeSectionId,
  onSelectSection,
  repairsBySection,
  missingSections,
  showObservationWarnings,
}: SectionSidebarProps) {
  const total = operationalSections.length;
  const done = operationalSections.filter(s => s.status === 'reviewed' || s.status === 'completed').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const missingSectionIds = new Set(missingSections.map(s => s.id));

  return (
    <aside className="border-r bg-card overflow-y-auto p-3 space-y-1">
      <div className="px-2 mb-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider">Espacios</p>
          <span className="text-tiny text-muted-foreground">{done} de {total} revisados</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>

      {showObservationWarnings && missingSections.length > 0 && (
        <div className="mx-1 mb-2 px-2 py-2 rounded-lg bg-[hsl(var(--status-bad))]/8 border border-[hsl(var(--status-bad))]/20 text-tiny text-[hsl(var(--status-bad))]">
          <AlertTriangle className="inline h-3 w-3 mr-1" />
          Faltan observaciones en <span className="font-semibold">{missingSections.length}</span> {missingSections.length === 1 ? 'sección' : 'secciones'}
        </div>
      )}

      {operationalSections.map((s) => {
        const isActive = s.id === activeSectionId;
        const repairCount = (repairsBySection[s.id] ?? []).length;
        const missingObs = showObservationWarnings && missingSectionIds.has(s.id);
        const repairLabel =
          repairCount > 0
            ? `${repairCount} ${repairCount === 1 ? 'reparación' : 'reparaciones'}`
            : null;
        return (
          <button
            key={s.id}
            onClick={() => onSelectSection(s.id)}
            className={cn(
              'w-full text-left px-2 py-1.5 rounded-md text-caption transition-colors',
              isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50',
              missingObs && !isActive && 'bg-[hsl(var(--status-bad))]/5',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="flex-1 leading-tight break-words">{s.section_title}</span>
              {repairLabel ? (
                <span className="shrink-0 text-tiny text-muted-foreground tabular-nums">{repairLabel}</span>
              ) : (
                <span className="shrink-0 text-tiny text-muted-foreground/60">Sin reparaciones</span>
              )}
            </div>
          </button>
        );
      })}
    </aside>
  );
}
