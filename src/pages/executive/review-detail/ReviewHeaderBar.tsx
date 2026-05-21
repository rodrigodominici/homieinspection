import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ArrowLeft, RotateCcw, Copy, AlertTriangle, ExternalLink, RefreshCw,
  Clock, Wrench, ChevronDown, FileText, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApproveInspectionDialog } from '@/modules/review/components';
import { SectionTotalsBreakdown, fmtCurrency } from './helpers';
import type { InspectionSection } from '@/lib/types';

type BudgetBreakdown = {
  ownerRequired: number; ownerOptional: number; ownerTotal: number;
  tenantRequired: number; tenantOptional: number; tenantTotal: number;
  grandTotal: number;
  bySection: Record<string, { owner: number; tenant: number; total: number }>;
};

interface ReviewHeaderBarProps {
  inspection: any;
  sections: InspectionSection[];
  operationalSections: InspectionSection[];
  activeSectionId: string | null;
  setActiveSectionId: (id: string) => void;
  repairsBySection: Record<string, any[]>;
  allRepairs: any[];
  budgetBreakdown: BudgetBreakdown;
  warrantyDeposit: number | null;
  depositDiff: number | null;
  contractorTotal: number;
  utility: number;
  contractors: any[];
  selectedContractorId: string | null;
  onContractorChange: (id: string) => void;
  inspectorProgressLabel: string;
  progress: { completed: number; total: number };
  lastActiveRelative: string | null;
  isPublished: boolean;
  returnMode: boolean;
  setReturnMode: (v: boolean) => void;
  selectedReturnSections: Set<string>;
  submitting: boolean;
  showObservationWarnings: boolean;
  missingSections: InspectionSection[];
  onBack: () => void;
  onApprove: () => Promise<void>;
  onPublish: (force?: boolean) => Promise<void>;
  onReturnForChanges: () => void;
  onOpenQuotation: (payer: 'owner' | 'tenant') => void;
  onOpenRepairsDrawer: (sectionId: string) => void;
  onCopyLink: () => void;
  onOpenPublished: () => void;
}

export function ReviewHeaderBar(props: ReviewHeaderBarProps) {
  const {
    inspection, sections, operationalSections, activeSectionId, setActiveSectionId,
    repairsBySection, allRepairs, budgetBreakdown, warrantyDeposit, depositDiff,
    contractorTotal, utility, contractors, selectedContractorId, onContractorChange,
    inspectorProgressLabel, progress, lastActiveRelative, isPublished, returnMode,
    setReturnMode, selectedReturnSections, submitting, showObservationWarnings,
    missingSections, onBack, onApprove, onPublish, onReturnForChanges,
    onOpenQuotation, onOpenRepairsDrawer, onCopyLink, onOpenPublished,
  } = props;

  const activeSection = operationalSections.find(s => s.id === activeSectionId) ?? operationalSections[0] ?? null;

  return (
    <header className="sticky top-0 z-30 border-b bg-card">
      <div className="px-4 lg:px-6">
        {/* Row 1: Identity + primary actions */}
        <div className="flex items-center gap-3 h-14">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold truncate">{inspection.property_name ?? inspection.property_id}</p>
              <InspectionStatusBadge status={inspection.status} />
            </div>
            <div className="flex items-center gap-2 text-tiny text-muted-foreground truncate">
              <span className="truncate">{inspection.address}</span>
              <span className="text-border">·</span>
              <Clock className="h-3 w-3 shrink-0" />
              <span className="shrink-0">{inspectorProgressLabel} {progress.completed}/{progress.total}</span>
              {lastActiveRelative && <span className="shrink-0 truncate">· {lastActiveRelative}</span>}
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            {['submitted', 'in_review'].includes(inspection.status) && !returnMode && (
              <>
                <Button variant="outline" size="sm" onClick={() => setReturnMode(true)}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Devolver para cambios
                </Button>
                <ApproveInspectionDialog
                  operationalSections={operationalSections}
                  disabled={submitting}
                  onApprove={onApprove}
                />
              </>
            )}
            {isPublished && (
              <>
                <Button variant="ghost" size="sm" onClick={onOpenPublished}>
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir
                </Button>
                <Button variant="ghost" size="sm" onClick={onCopyLink}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link
                </Button>
              </>
            )}
            {inspection.status === 'published' || inspection.status === 'sent' ? (
              <Button size="sm" variant="outline" onClick={() => onPublish()} disabled={submitting}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Republicar
              </Button>
            ) : inspection.status === 'approved' ? (
              <Button size="sm" onClick={() => onPublish()} disabled={submitting}>
                <Send className="mr-1.5 h-3.5 w-3.5" /> Publicar
              </Button>
            ) : null}
          </div>
        </div>

        {returnMode && (
          <div className="hidden lg:flex items-center gap-3 h-10 border-t">
            <span className="text-caption text-muted-foreground">Selecciona secciones a devolver</span>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => setReturnMode(false)}>Cancelar</Button>
            <Button variant="destructive" size="sm" onClick={onReturnForChanges} disabled={submitting}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Devolver ({selectedReturnSections.size})
            </Button>
          </div>
        )}

        {/* Row 2: Financial summary blocks + secondary actions */}
        <div className="flex items-stretch gap-2 pb-3 pt-2 border-t overflow-x-auto">
          <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[110px]">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Depósito</p>
            <p className="text-sm font-mono font-semibold">
              {warrantyDeposit !== null ? fmtCurrency(warrantyDeposit) : '—'}
            </p>
          </div>
          <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[110px]">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inquilino</p>
            <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.tenantRequired)}</p>
          </div>
          <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[110px]">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inq. Opcional</p>
            <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.tenantOptional)}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="shrink-0 rounded-md bg-muted/60 px-3 py-1.5 min-w-[120px] cursor-help">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inq. Total S/IVA</p>
                <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.tenantTotal)}</p>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <SectionTotalsBreakdown sections={sections} bySection={budgetBreakdown.bySection} field="tenant" activeId={activeSectionId} />
            </TooltipContent>
          </Tooltip>
          <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[110px]">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Propietario</p>
            <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.ownerRequired)}</p>
          </div>
          <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[110px]">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Prop. Opcional</p>
            <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.ownerOptional)}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="shrink-0 rounded-md bg-muted/60 px-3 py-1.5 min-w-[120px] cursor-help">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Prop. Total S/IVA</p>
                <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.ownerTotal)}</p>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <SectionTotalsBreakdown sections={sections} bySection={budgetBreakdown.bySection} field="owner" activeId={activeSectionId} />
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="shrink-0 rounded-md bg-primary/10 px-3 py-1.5 min-w-[130px] cursor-help">
                <p className="text-[10px] uppercase tracking-wide text-primary/70">Total general</p>
                <p className="text-sm font-mono font-semibold text-primary">{fmtCurrency(budgetBreakdown.grandTotal)}</p>
                {warrantyDeposit !== null && budgetBreakdown.ownerRequired > 0 && (
                  <p className={cn('text-[10px] font-mono', depositDiff! >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]')}>
                    vs depósito {depositDiff! >= 0 ? '+' : ''}{fmtCurrency(depositDiff!)}
                  </p>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <SectionTotalsBreakdown sections={sections} bySection={budgetBreakdown.bySection} field="total" activeId={activeSectionId} />
            </TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground">
                  <FileText className="mr-1 h-3.5 w-3.5" /> Cotización <ChevronDown className="ml-0.5 h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => onOpenQuotation('owner')}>Propietario</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenQuotation('tenant')}>Inquilino</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant={allRepairs.length > 0 ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                const target =
                  activeSection ??
                  operationalSections.find(s => (repairsBySection[s.id] ?? []).length > 0) ??
                  operationalSections[0];
                if (target) {
                  setActiveSectionId(target.id);
                  onOpenRepairsDrawer(target.id);
                }
              }}
            >
              <Wrench className="mr-1 h-3.5 w-3.5" />
              Presupuesto
              {allRepairs.length > 0 && (
                <span className="ml-1 opacity-80">· {allRepairs.length}</span>
              )}
            </Button>

            <div className="h-5 w-px bg-border mx-1" aria-hidden />

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground hidden sm:inline">Contratista activo:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs max-w-[200px]">
                    {!selectedContractorId && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--status-regular))] mr-1.5 shrink-0" aria-hidden />
                    )}
                    <span className="truncate">
                      {selectedContractorId
                        ? contractors.find(c => c.id === selectedContractorId)?.name ?? 'Contratista'
                        : 'Asignar contratista'}
                    </span>
                    <ChevronDown className="ml-0.5 h-3 w-3 opacity-60 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Contratista activo</Label>
                    <p className="text-tiny text-muted-foreground">Define los costos base del presupuesto.</p>
                    <Select value={selectedContractorId ?? 'none'} onValueChange={onContractorChange}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin seleccionar</SelectItem>
                        {contractors.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name} ({c.country})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedContractorId && contractorTotal > 0 && (
                    <div className="space-y-1 pt-2 border-t border-border/70 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Costo contratista</span>
                        <span className="font-mono font-medium">{fmtCurrency(contractorTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Utilidad</span>
                        <span className={cn('font-mono font-medium', utility >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]')}>
                          {fmtCurrency(utility)}
                        </span>
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* Row 3: Consolidated blocker strip */}
        {(() => {
          const blockers: string[] = [];
          if (showObservationWarnings && missingSections.length > 0) {
            blockers.push(`${missingSections.length} observaciones finales pendientes`);
          }
          if (allRepairs.length > 0 && !selectedContractorId) {
            blockers.push('sin contratista');
          }
          if (!isPublished && ['submitted', 'in_review', 'approved'].includes(inspection.status)) {
            blockers.push('sin publicar');
          }
          if (blockers.length === 0) return null;
          return (
            <div className="flex items-center gap-1.5 pb-2 text-tiny text-muted-foreground">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="truncate">{blockers.join(' · ')}</span>
            </div>
          );
        })()}
      </div>
    </header>
  );
}
