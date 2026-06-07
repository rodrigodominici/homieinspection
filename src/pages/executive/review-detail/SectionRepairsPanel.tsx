import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NumberInput } from '@/shared/ui/NumberInput';
import { ChevronRight, Eye, EyeOff, Plus, Trash2, Wrench, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InspectionRepairItem, InspectionSection } from '@/lib/types';
import { fmtCurrency } from './helpers';
import { ContractorPicker } from './ContractorPicker';
import { OwnerFeedbackBadge, feedbackAccentClasses } from './OwnerFeedbackBadge';
import type { OwnerFeedbackEntry } from '@/modules/review/api/useOwnerFeedbackByRepair';

interface SectionRepairsPanelProps {
  section: InspectionSection;
  repairs: InspectionRepairItem[];
  hasContractor: boolean;
  expandedRepairId: string | null;
  onToggleExpand: (id: string) => void;
  onOpenCatalog: () => void;
  onUpdateRepair: (id: string, field: string, value: any) => void;
  onDeleteRepair: (id: string) => void;
  /** Optional close handler — when provided shows the X button in header. */
  onClose?: () => void;
  /** Visual chrome: 'inline' (panel inside layout) or 'sheet' (inside Sheet). */
  variant?: 'inline' | 'sheet';
  /** Contractor selection — moved here from header bar for contextual relevance. */
  contractors?: Array<{ id: string; name: string; country: string }>;
  selectedContractorId?: string | null;
  onContractorChange?: (id: string) => void;
  contractorTotal?: number;
  utility?: number;
  /** Map repair_id → última decisión del propietario. Resalta ítems con observación/rechazo. */
  feedbackByRepairId?: Map<string, OwnerFeedbackEntry>;
}

/**
 * Pure repairs panel content — no Sheet, no Dialog. Renders the accordion of
 * repair items for one section. Hosted either inline (desktop split column)
 * via `ExecutiveReviewDetail` or inside `SectionRepairsDrawer` (mobile sheet).
 */
export function SectionRepairsPanel({
  section, repairs, hasContractor,
  expandedRepairId, onToggleExpand, onOpenCatalog, onUpdateRepair, onDeleteRepair,
  onClose, variant = 'inline',
  contractors, selectedContractorId, onContractorChange, contractorTotal = 0, utility = 0,
}: SectionRepairsPanelProps) {
  const subtotalClient = repairs
    .filter((r) => r.visible_to_owner)
    .reduce((s, r) => s + r.quantity * r.unit_price, 0);

  return (
    <div className={cn('flex flex-col h-full bg-card', variant === 'inline' && 'border-l')}>
      {/* Header */}
      <div className="px-5 py-3 border-b space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-base font-semibold truncate">Reparaciones</p>
            <span className="text-xs font-normal text-muted-foreground truncate">· {section.section_title}</span>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {/* Contractor picker — contextually placed here since it drives repair costs */}
        {contractors && onContractorChange && (
          <ContractorPicker
            contractors={contractors}
            selectedContractorId={selectedContractorId ?? null}
            onContractorChange={onContractorChange}
            contractorTotal={contractorTotal}
            utility={utility}
          />
        )}
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        <div className="flex items-center justify-between pb-2">
          <p className="text-xs text-muted-foreground">{repairs.length} reparaciones</p>
          <Button size="sm" onClick={onOpenCatalog} className="h-8 text-xs">
            <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
          </Button>
        </div>

        {repairs.length === 0 && (
          <p className="text-caption text-muted-foreground text-center py-8">
            Sin reparaciones en esta sección
          </p>
        )}

        {repairs.map((repair) => {
          const expanded = expandedRepairId === repair.id;
          const itemSubtotal = repair.quantity * repair.unit_price;
          return (
            <div key={repair.id} className={cn(
              'rounded-md border bg-card transition-colors',
              !repair.visible_to_owner ? 'opacity-60 border-dashed border-border/60' : 'border-border/60',
              expanded && 'ring-1 ring-primary/30'
            )}>
              {/* Compact summary row (always visible) */}
              <button
                type="button"
                onClick={() => onToggleExpand(repair.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
              >
                <ChevronRight className={cn(
                  'h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform',
                  expanded && 'rotate-90'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{repair.title_snapshot}</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{repair.payer_role === 'tenant' ? 'Inquilino' : 'Propietario'}</span>
                    <span className="opacity-50">·</span>
                    <span>{repair.payment_nature === 'optional' ? 'Opcional' : 'Obligatoria'}</span>
                  </div>
                </div>
                <span className="text-xs font-mono font-medium shrink-0">{fmtCurrency(itemSubtotal)}</span>
              </button>

              {/* Expanded editor */}
              {expanded && (
                <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/70">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {repair.category_snapshot && (
                        <p className="text-xs text-muted-foreground">{repair.category_snapshot}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); onUpdateRepair(repair.id, 'visible_to_owner', !repair.visible_to_owner); }}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        title={repair.visible_to_owner ? 'Visible al propietario' : 'Oculta al propietario'}
                      >
                        {repair.visible_to_owner ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteRepair(repair.id); }}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* ¿Quién paga? — prominent payer selector (Cambio 4) */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">¿Quién paga?</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={repair.payer_role === 'owner' ? 'default' : 'outline'}
                        className="h-10"
                        onClick={() => onUpdateRepair(repair.id, 'payer_role', 'owner')}
                      >
                        Propietario
                      </Button>
                      <Button
                        type="button"
                        variant={repair.payer_role === 'tenant' ? 'default' : 'outline'}
                        className="h-10"
                        onClick={() => onUpdateRepair(repair.id, 'payer_role', 'tenant')}
                      >
                        Inquilino
                      </Button>
                    </div>
                  </div>

                  <div className={cn('grid gap-2', hasContractor ? 'grid-cols-5' : 'grid-cols-3')}>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Cantidad</Label>
                      <NumberInput value={repair.quantity}
                        onChange={(v) => onUpdateRepair(repair.id, 'quantity', v)}
                        className="h-8 text-xs font-mono" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Cliente</Label>
                      <NumberInput value={repair.unit_price}
                        onChange={(v) => onUpdateRepair(repair.id, 'unit_price', v)}
                        className="h-8 text-xs font-mono" />
                    </div>
                    {hasContractor && (
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Contratista</Label>
                        <NumberInput value={(repair as any).contractor_unit_price ?? 0}
                          onChange={(v) => onUpdateRepair(repair.id, 'contractor_unit_price', v)}
                          className="h-8 text-xs font-mono" />
                      </div>
                    )}
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Subtotal</Label>
                      <p className="h-8 flex items-center justify-end text-xs font-mono font-medium">
                        {fmtCurrency(itemSubtotal)}
                      </p>
                    </div>
                    {hasContractor && (
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Utilidad</Label>
                        <p className="h-8 flex items-center justify-end text-xs font-mono text-muted-foreground">
                          {fmtCurrency((repair.unit_price - ((repair as any).contractor_unit_price ?? 0)) * repair.quantity)}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
                    <ToggleGroup
                      type="single"
                      value={repair.payment_nature}
                      onValueChange={(v) => v && onUpdateRepair(repair.id, 'payment_nature', v)}
                      className="gap-0 rounded-md border border-border bg-muted/30 p-0.5 w-fit"
                    >
                      <ToggleGroupItem
                        value="required"
                        className="h-8 px-3 text-xs font-medium rounded-sm data-[state=on]:bg-foreground data-[state=on]:text-background"
                      >
                        Obligatoria
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="optional"
                        className="h-8 px-3 text-xs font-medium rounded-sm data-[state=on]:bg-foreground data-[state=on]:text-background"
                      >
                        Opcional
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  <Textarea rows={1} className="text-xs min-h-[36px] resize-none"
                    placeholder="Descripción de reparación..."
                    onBlur={(e) => onUpdateRepair(repair.id, 'description_snapshot', e.target.value || null)}
                    defaultValue={repair.description_snapshot ?? ''}
                    key={`desc-${repair.id}`}
                  />

                  <Input placeholder="Notas..." defaultValue={repair.notes ?? ''} className="h-8 text-xs"
                    onBlur={(e) => onUpdateRepair(repair.id, 'notes', e.target.value || null)} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky footer */}
      <div className="border-t px-5 py-3 flex items-center justify-between bg-card">
        <span className="text-xs text-muted-foreground">Subtotal cliente</span>
        <span className="text-sm font-mono font-semibold">{fmtCurrency(subtotalClient)}</span>
      </div>
    </div>
  );
}
