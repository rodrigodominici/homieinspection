import { Progress } from '@/components/ui/progress';
import { SectionStatusBadge } from '@/components/StatusBadge';
import { AlertTriangle, PenLine, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InspectionSection } from '@/lib/types';

interface SectionSidebarProps {
  operationalSections: InspectionSection[];
  metaSections?: InspectionSection[];
  activeSectionId: string | null;
  onSelectSection: (id: string) => void;
  repairsBySection: Record<string, any[]>;
  signatureRecord: any | null;
  missingSections: InspectionSection[];
  showObservationWarnings: boolean;
}

export function SectionSidebar({
  operationalSections,
  metaSections = [],
  activeSectionId,
  onSelectSection,
  repairsBySection,
  signatureRecord,
  missingSections,
  showObservationWarnings,
}: SectionSidebarProps) {
  const total = operationalSections.length;
  const done = operationalSections.filter(s => s.status === 'reviewed' || s.status === 'completed').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const missingSectionIds = new Set(missingSections.map(s => s.id));

  const renderMetaRow = (s: InspectionSection) => {
    const isActive = s.id === activeSectionId;
    return (
      <button
        key={s.id}
        onClick={() => onSelectSection(s.id)}
        className={cn(
          'w-full text-left px-2 py-1.5 rounded-md text-caption transition-colors',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        )}
      >
        <span className="leading-tight break-words">{s.section_title}</span>
      </button>
    );
  };

  return (
    <aside className="border-r bg-card overflow-y-auto p-3 space-y-1">
      {/* ── DATOS DE LA INSPECCIÓN ─────────────────────────── */}
      {(metaSections.length > 0 || signatureRecord) && (
        <div className="mb-3 space-y-1">
          <p className="px-2 mb-1 text-tiny font-medium text-muted-foreground uppercase tracking-wider">
            Datos de la inspección
          </p>
          {metaSections.map(renderMetaRow)}
          {signatureRecord && (
            <div className="rounded-md border border-border/60 bg-card p-2.5 space-y-1">
              <div className="flex items-center gap-1.5 text-tiny font-medium">
                {signatureRecord.signature_status === 'signed' ? <PenLine className="h-3.5 w-3.5 text-[hsl(var(--status-good))]" /> :
                  signatureRecord.signature_status === 'refused' ? <XCircle className="h-3.5 w-3.5 text-[hsl(var(--status-bad))]" /> :
                    <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--status-regular))]" />}
                <span>Firma del inquilino</span>
              </div>
              <p className="text-tiny text-muted-foreground">
                {signatureRecord.signature_status === 'signed'
                  ? `Firmado${signatureRecord.signer_name ? ` por ${signatureRecord.signer_name}` : ''}`
                  : signatureRecord.signature_status === 'refused' ? 'Rechazada por el inquilino'
                    : 'Inquilino no disponible'}
              </p>
              {signatureRecord.skip_reason && (
                <p className="text-tiny text-muted-foreground italic">{signatureRecord.skip_reason}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SECCIONES ──────────────────────────────────────── */}
      <div className="px-2 mb-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider">Secciones</p>
          <span className="text-tiny text-muted-foreground">{done} de {total} revisadas</span>
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
                <SectionStatusBadge status={s.status} />
              )}
            </div>
          </button>
        );
      })}
    </aside>
  );
}
