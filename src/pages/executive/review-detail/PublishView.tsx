import { Button } from '@/components/ui/button';
import { Check, AlertTriangle, X, Send, RefreshCw, ExternalLink, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApproveInspectionDialog } from '@/modules/review/components';
import { OwnerFeedbackPanel } from './OwnerFeedbackPanel';
import { PublishedVersionsTimeline } from './PublishedVersionsTimeline';
import type { Inspection, InspectionSection } from '@/lib/types';

interface PublishViewProps {
  inspection: Inspection;
  operationalSections: InspectionSection[];
  missingSections: InspectionSection[];
  hasRepairs: boolean;
  hasContractor: boolean;
  signatureRecord: any | null;
  isPublished: boolean;
  submitting: boolean;

  onApprove: () => Promise<void>;
  onPublish: (force?: boolean) => Promise<void>;
  onOpenOwner: () => void;
  onOpenTenant: () => void;
  onCopyOwner: () => void;
  onCopyTenant: () => void;

  onGoToInspection: (sectionId?: string) => void;
  onGoToRepairs?: () => void;
  onRefresh?: () => void;
}

type CheckLevel = 'ok' | 'warn' | 'block';

interface ChecklistRow {
  level: CheckLevel;
  label: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}

export function PublishView(props: PublishViewProps) {
  const {
    inspection, operationalSections, missingSections, hasRepairs, hasContractor,
    signatureRecord, isPublished, submitting,
    onApprove, onPublish, onOpenOwner, onOpenTenant, onCopyOwner, onCopyTenant,
    onGoToInspection, onGoToRepairs, onRefresh,
  } = props;

  const checks: ChecklistRow[] = [
    missingSections.length === 0
      ? { level: 'ok', label: 'Todas las secciones tienen observación final' }
      : {
          level: 'block',
          label: `${missingSections.length} secciones sin observación final`,
          detail: missingSections.map((s) => s.section_title).join(' · '),
          action: {
            label: 'Completar',
            onClick: () => onGoToInspection(missingSections[0].id),
          },
        },
    hasRepairs
      ? { level: 'ok', label: 'Reparaciones cargadas y revisadas' }
      : { level: 'warn', label: 'Sin reparaciones cargadas', detail: 'La inspección se puede publicar sin reparaciones.' },
    hasContractor
      ? { level: 'ok', label: 'Contratista asignado' }
      : { level: 'warn', label: 'Sin contratista asignado', detail: 'Asigna uno desde Reparaciones para calcular costos internos.' },
    signatureRecord
      ? signatureRecord.signature_status === 'signed'
        ? { level: 'ok', label: 'Firma del inquilino capturada' }
        : signatureRecord.signature_status === 'refused'
          ? { level: 'warn', label: 'Firma rechazada por el inquilino', detail: signatureRecord.skip_reason ?? undefined }
          : { level: 'warn', label: 'Inquilino no disponible para firma', detail: signatureRecord.skip_reason ?? undefined }
      : { level: 'warn', label: 'Sin registro de firma' },
  ];

  const hasBlockers = checks.some((c) => c.level === 'block');
  const canApprove = ['submitted', 'in_review'].includes(inspection.status);
  const canPublish = inspection.current_stage === 'share' && inspection.status === 'approved' && !isPublished;
  const canRepublish = isPublished;

  return (
    <div className="h-full overflow-y-auto p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-h3 font-semibold tracking-tight">Publicación</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Verifica la disponibilidad de la inspección y publica el reporte final para el propietario y el inquilino.
        </p>
      </div>

      {/* Readiness checklist */}
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-2.5 border-b">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            Lista de verificación
          </p>
        </div>
        <ul className="divide-y divide-border/60">
          {checks.map((c, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-3">
              <CheckIcon level={c.level} />
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm',
                  c.level === 'block' && 'font-medium text-[hsl(var(--status-bad))]',
                )}>{c.label}</p>
                {c.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{c.detail}</p>
                )}
              </div>
              {c.action && (
                <Button size="sm" variant="outline" onClick={c.action.onClick}>
                  {c.action.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Approve gate */}
      {canApprove && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div>
            <p className="font-semibold">Aprobar inspección</p>
            <p className="text-sm text-muted-foreground">
              Cierra la etapa de revisión y avanza a publicación.
            </p>
          </div>
          <div className="flex gap-2">
            <ApproveInspectionDialog
              operationalSections={operationalSections}
              disabled={submitting}
              onApprove={onApprove}
            />
          </div>
        </div>
      )}

      {/* Publish primary action */}
      {(canPublish || canRepublish) && (
        <div className={cn(
          'rounded-lg border p-4 space-y-3',
          isPublished ? 'bg-card' : 'bg-primary/5 border-primary/30',
        )}>
          <div>
            <p className="font-semibold">
              {isPublished ? 'Reporte publicado' : 'Publicar reporte'}
            </p>
            <p className="text-sm text-muted-foreground">
              {isPublished
                ? 'Los enlaces ya están disponibles para propietario e inquilino.'
                : 'Se generarán enlaces públicos para propietario e inquilino. Las observaciones finales y la cotización quedarán visibles.'}
            </p>
          </div>
          {hasBlockers && !isPublished && (
            <p className="text-xs text-[hsl(var(--status-bad))]">
              Resuelve los bloqueos de la lista de verificación antes de publicar.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {canPublish && (
              <Button
                size="lg"
                onClick={() => onPublish()}
                disabled={submitting || hasBlockers}
              >
                <Send className="mr-1.5 h-4 w-4" /> Publicar reporte
              </Button>
            )}
            {canRepublish && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => onPublish()}
                disabled={submitting}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" /> Republicar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Owner feedback panel */}
      {isPublished && (
        <OwnerFeedbackPanel
          inspectionId={inspection.id}
          ownerFeedbackStatus={(inspection as any).owner_feedback_status as any}
          inspectionStatus={inspection.status}
          lastSubmittedAt={(inspection as any).owner_feedback_last_submitted_at}
          onGoToCotizacion={onGoToRepairs}
          onChanged={onRefresh}
        />
      )}

      {/* Share surface */}
      {isPublished && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="font-semibold">Compartir reporte</p>
          <div className="grid md:grid-cols-2 gap-3">
            <ShareCard
              audience="Propietario"
              onOpen={onOpenOwner}
              onCopy={onCopyOwner}
            />
            <ShareCard
              audience="Inquilino"
              onOpen={onOpenTenant}
              onCopy={onCopyTenant}
            />
          </div>
        </div>
      )}

      {/* Published versions timeline */}
      {isPublished && <PublishedVersionsTimeline inspectionId={inspection.id} />}
    </div>
  );
}

function CheckIcon({ level }: { level: CheckLevel }) {
  if (level === 'ok') {
    return (
      <span className="mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-[hsl(var(--status-good))]/15 text-[hsl(var(--status-good))] shrink-0">
        <Check className="h-3 w-3" />
      </span>
    );
  }
  if (level === 'warn') {
    return (
      <span className="mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-[hsl(var(--status-regular))]/15 text-[hsl(var(--status-regular))] shrink-0">
        <AlertTriangle className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-[hsl(var(--status-bad))]/15 text-[hsl(var(--status-bad))] shrink-0">
      <X className="h-3 w-3" />
    </span>
  );
}

function ShareCard({ audience, onOpen, onCopy }: { audience: string; onOpen: () => void; onCopy: () => void }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <p className="text-sm font-medium">{audience}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onOpen}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={onCopy}>
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link
        </Button>
      </div>
    </div>
  );
}
