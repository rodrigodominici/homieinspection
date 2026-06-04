import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SectionStatusBadge } from '@/components/StatusBadge';
import { useDebouncedAutosave } from '@/shared/hooks/useDebouncedAutosave';
import { AutosaveStatus } from '@/shared/ui/AutosaveStatus';
import { ChevronRight, Globe, Lock as LockIcon, Plus, Wrench } from 'lucide-react';
import type {
  InspectionFieldValue, InspectionRepairItem, InspectionReview, InspectionSection,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { fmtCurrency, statusLabel } from './helpers';

interface SectionWorkspaceProps {
  section: InspectionSection;
  fields: InspectionFieldValue[];
  repairs: InspectionRepairItem[];
  reviews: InspectionReview[];
  inspectorObs: string;
  finalObservation: string;
  internalNote: string;
  onFinalObsChange: (v: string) => void;
  onInternalNoteChange: (v: string) => void;
  onSaveFinalObsSilent: (sectionId: string, value: string) => Promise<void>;
  onSaveNoteSilent: (sectionId: string, value: string) => Promise<void>;
  onOpenRepairsDrawer: () => void;
  returnMode: boolean;
  returnSelected: boolean;
  onToggleReturn: () => void;
  returnComment: string;
  onReturnCommentChange: (v: string) => void;
  /** Optional photos slot — rendered at the top when the right aside is
   *  replaced by the inline repairs panel. */
  photosSlot?: React.ReactNode;
}

/**
 * Center panel of the Executive review workstation.
 *
 * Repairs are NOT edited inline anymore; this component only renders the
 * review content (status fields, observations, internal note) and a compact
 * repair strip whose CTA opens `SectionRepairsDrawer`.
 */
export function SectionWorkspace({
  section, fields, repairs, inspectorObs, finalObservation, internalNote,
  onFinalObsChange, onInternalNoteChange, onSaveFinalObsSilent, onSaveNoteSilent,
  onOpenRepairsDrawer,
  returnMode, returnSelected, onToggleReturn, returnComment, onReturnCommentChange,
  photosSlot,
}: SectionWorkspaceProps) {
  const statusFields = fields.filter((f) => f.group_key === 'status');
  const otherFields = fields.filter(
    (f) => f.group_key !== 'status' && f.group_key !== 'photo' && f.group_key !== 'observation' && f.value_text,
  );
  const sectionSubtotalClient = repairs
    .filter((r) => r.visible_to_owner)
    .reduce((s, r) => s + r.quantity * r.unit_price, 0);

  const finalObsAutosave = useDebouncedAutosave(
    finalObservation,
    (v) => onSaveFinalObsSilent(section.id, v),
  );
  const noteAutosave = useDebouncedAutosave(
    internalNote,
    (v) => onSaveNoteSilent(section.id, v),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h4 font-semibold">{section.section_title}</h2>
        <SectionStatusBadge status={section.status} />
      </div>

      {photosSlot}

      {/* Status fields */}
      {statusFields.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {statusFields.map((f) => {
            const label = statusLabel(f.value_text);
            return (
              <div key={f.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/60 border border-border/50 text-caption">
                <span className="text-foreground/80 font-medium">{f.field_label}</span>
                {label && <span className={cn(label.cls, 'font-semibold text-[12px]')}>{label.text}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Other fields */}
      {otherFields.length > 0 && (
        <div className="space-y-1">
          {otherFields.map((f) => (
            <div key={f.id} className="text-caption">
              <span className="text-muted-foreground">{f.field_label}: </span>
              <span>{f.value_text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Side-by-side observations — public (left border primary) vs internal (gray bg) */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-medium text-muted-foreground">Observación del Inspector</p>
          </div>
          <p className="text-caption whitespace-pre-wrap">{inspectorObs || <span className="text-muted-foreground italic">Sin observación</span>}</p>
        </div>
        <div className="rounded-lg border border-border/60 border-l-[3px] border-l-primary p-3 space-y-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 cursor-help">
                <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-primary" />
                  Observación Final
                </p>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary">Público</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>Este texto aparecerá en el reporte público</TooltipContent>
          </Tooltip>
          <Textarea value={finalObservation} rows={3} className="text-caption bg-transparent border-0 p-0 focus-visible:ring-0 resize-none"
            placeholder="Observación visible para el propietario..."
            onChange={(e) => onFinalObsChange(e.target.value)}
            onBlur={() => finalObsAutosave.flush()} />
          <div className="flex justify-end">
            <AutosaveStatus status={finalObsAutosave.status} />
          </div>
        </div>
      </div>

      {/* Internal note — gray background, lock icon */}
      <div className="space-y-1.5 rounded-lg bg-muted/40 border border-border/40 p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-help">
              <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <LockIcon className="h-3.5 w-3.5" />
                Comentario Interno
              </p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-muted-foreground/15 text-muted-foreground">Solo equipo</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Este texto NO aparece en el reporte público</TooltipContent>
        </Tooltip>
        <Textarea value={internalNote} rows={2} className="text-caption bg-card"
          placeholder="Nota interna (no visible al propietario)..."
          onChange={(e) => onInternalNoteChange(e.target.value)}
          onBlur={() => noteAutosave.flush()} />
        <div className="flex justify-end">
          <AutosaveStatus status={noteAutosave.status} />
        </div>
      </div>

      {/* Reparaciones de esta sección — hidden when the inline repairs panel is
          already open on the right (photosSlot defined = repairs panel is active). */}
      {!photosSlot && <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Reparaciones de esta sección</p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                {repairs.length} {repairs.length === 1 ? 'reparación' : 'reparaciones'}
                {repairs.length > 0 && (
                  <> · Subtotal <span className="font-mono">{fmtCurrency(sectionSubtotalClient)}</span></>
                )}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={onOpenRepairsDrawer}
            className="h-8 text-xs w-full sm:w-auto shrink-0"
          >
            {repairs.length > 0
              ? <><ChevronRight className="mr-1 h-3.5 w-3.5" /> Ver reparaciones ({repairs.length})</>
              : <><Plus className="mr-1 h-3.5 w-3.5" /> Agregar reparación</>
            }
          </Button>
        </div>
        {repairs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-4 py-3">
            Sin reparaciones. Agrega desde el catálogo.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {repairs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={onOpenRepairsDrawer}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className="flex-1 min-w-0 text-caption truncate">{r.title_snapshot}</span>
                  <span className="font-mono text-caption shrink-0">{fmtCurrency(r.quantity * r.unit_price)}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>}

      {/* Return mode */}
      {returnMode && (
        <div className="border-t pt-3 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={returnSelected} onChange={onToggleReturn} className="rounded" />
            <span className="text-caption font-medium">Marcar para corrección</span>
          </label>
          {returnSelected && (
            <Textarea placeholder="Comentario de corrección..." value={returnComment}
              onChange={(e) => onReturnCommentChange(e.target.value)} rows={2} className="text-caption" />
          )}
        </div>
      )}
    </div>
  );
}
