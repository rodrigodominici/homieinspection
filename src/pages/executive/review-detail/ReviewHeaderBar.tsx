import { Button } from '@/components/ui/button';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, RotateCcw, Copy, AlertTriangle, ExternalLink, RefreshCw,
  Wrench, ChevronDown, FileText, Send, Eye,
} from 'lucide-react';
import { ApproveInspectionDialog } from '@/modules/review/components';
import { BudgetSummaryBar, type BudgetBreakdown } from './BudgetSummaryBar';
import { RequestChangesPanel } from './RequestChangesPanel';
import { InspectorProgressCard } from './InspectorProgressCard';
import type { Inspection, InspectionRepairItem, InspectionSection } from '@/lib/types';

interface ReviewHeaderBarProps {
  inspection: Inspection;
  sections: InspectionSection[];
  operationalSections: InspectionSection[];
  activeSectionId: string | null;
  setActiveSectionId: (id: string) => void;
  repairsBySection: Record<string, InspectionRepairItem[]>;
  allRepairs: InspectionRepairItem[];
  budgetBreakdown: BudgetBreakdown;
  warrantyDeposit: number | null;
  depositDiff: number | null;
  contractorTotal: number;
  clientTotal: number;
  selectedContractorId: string | null;
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
  onOpenInternalReport: () => void;
  onOpenRepairsDrawer: (sectionId: string) => void;
  /** Open published owner report in new tab */
  onOpenOwner: () => void;
  /** Open published tenant report in new tab */
  onOpenTenant: () => void;
  /** Copy published owner link to clipboard */
  onCopyOwner: () => void;
  /** Copy published tenant link to clipboard */
  onCopyTenant: () => void;
}

export function ReviewHeaderBar(props: ReviewHeaderBarProps) {
  const {
    inspection, sections, operationalSections, activeSectionId, setActiveSectionId,
    repairsBySection, allRepairs, budgetBreakdown, warrantyDeposit, depositDiff,
    contractorTotal, clientTotal,
    inspectorProgressLabel, progress, lastActiveRelative, isPublished, returnMode,
    setReturnMode, selectedReturnSections, submitting, showObservationWarnings,
    missingSections, onBack, onApprove, onPublish, onReturnForChanges,
    onOpenQuotation, onOpenInternalReport, onOpenRepairsDrawer,
    onOpenOwner, onOpenTenant, onCopyOwner, onCopyTenant,
  } = props;

  const activeSection = operationalSections.find(s => s.id === activeSectionId) ?? operationalSections[0] ?? null;

  const blockers: string[] = [];
  if (showObservationWarnings && missingSections.length > 0) {
    blockers.push(`${missingSections.length} observaciones finales pendientes`);
  }
  // Note: contractor assignment is now handled inside the repairs panel
  if (!isPublished && ['submitted', 'in_review', 'approved'].includes(inspection.status)) {
    blockers.push('sin publicar');
  }

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
            <InspectorProgressCard
              inspectorProgressLabel={inspectorProgressLabel}
              progress={progress}
              lastActiveRelative={lastActiveRelative}
              address={inspection.address}
            />
          </div>
          <div className="hidden md:flex items-center gap-2">
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

            {/* Ver reporte — single dropdown replacing Abrir + Copiar link */}
            {isPublished && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Ver reporte <ChevronDown className="ml-0.5 h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={onOpenOwner}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5 text-muted-foreground" /> Abrir — Propietario
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onOpenTenant}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5 text-muted-foreground" /> Abrir — Inquilino
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onCopyOwner}>
                    <Copy className="mr-2 h-3.5 w-3.5 text-muted-foreground" /> Copiar link propietario
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onCopyTenant}>
                    <Copy className="mr-2 h-3.5 w-3.5 text-muted-foreground" /> Copiar link inquilino
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {inspection.status === 'published' || inspection.status === 'sent' ? (
              <Button size="sm" variant="outline" onClick={() => onPublish()} disabled={submitting}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Republicar
              </Button>
            ) : (inspection.current_stage === 'share' && inspection.status === 'approved') ? (
              <Button size="sm" onClick={() => onPublish()} disabled={submitting}>
                <Send className="mr-1.5 h-3.5 w-3.5" /> Publicar
              </Button>
            ) : null}
          </div>
        </div>

        {returnMode && (
          <RequestChangesPanel
            selectedCount={selectedReturnSections.size}
            submitting={submitting}
            onCancel={() => setReturnMode(false)}
            onConfirm={onReturnForChanges}
          />
        )}

        {/* Row 2: Financial summary + secondary actions */}
        <div className="flex items-stretch gap-2 pb-3 pt-2 border-t overflow-x-auto">
          <BudgetSummaryBar
            sections={sections}
            budgetBreakdown={budgetBreakdown}
            warrantyDeposit={warrantyDeposit}
            depositDiff={depositDiff}
            activeSectionId={activeSectionId}
            itemCount={allRepairs.length}
            clientTotal={clientTotal}
            contractorTotal={contractorTotal}
          />

          <div className="flex-1" />

          <div className="flex items-center gap-1 shrink-0">
            {/* Documentos — generates printable PDFs */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground">
                  <FileText className="mr-1 h-3.5 w-3.5" /> Cotizaciones <ChevronDown className="ml-0.5 h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onOpenQuotation('owner')}>Cotización propietario</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenQuotation('tenant')}>Cotización inquilino</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenInternalReport}>Informe interno</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Reparaciones — opens the repair items editing panel */}
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
              Reparaciones
              {allRepairs.length > 0 && <span className="ml-1 opacity-80">· {allRepairs.length}</span>}
            </Button>

          </div>
        </div>

        {/* Row 3: Consolidated blocker strip */}
        {blockers.length > 0 && (
          <div className="flex items-center gap-1.5 pb-2 text-tiny text-muted-foreground">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="truncate">{blockers.join(' · ')}</span>
          </div>
        )}
      </div>
    </header>
  );
}
