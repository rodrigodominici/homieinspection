import { Button } from '@/components/ui/button';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, RotateCcw, Copy, AlertTriangle, ExternalLink, RefreshCw,
  Clock, Wrench, ChevronDown, FileText, Send,
} from 'lucide-react';
import { ApproveInspectionDialog } from '@/modules/review/components';
import { BudgetSummaryBar, type BudgetBreakdown } from './BudgetSummaryBar';
import { ContractorPicker } from './ContractorPicker';
import { RequestChangesPanel } from './RequestChangesPanel';
import type { InspectionSection } from '@/lib/types';

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

  const blockers: string[] = [];
  if (showObservationWarnings && missingSections.length > 0) {
    blockers.push(`${missingSections.length} observaciones finales pendientes`);
  }
  if (allRepairs.length > 0 && !selectedContractorId) blockers.push('sin contratista');
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
          />

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
              {allRepairs.length > 0 && <span className="ml-1 opacity-80">· {allRepairs.length}</span>}
            </Button>

            <div className="h-5 w-px bg-border mx-1" aria-hidden />

            <ContractorPicker
              contractors={contractors}
              selectedContractorId={selectedContractorId}
              onContractorChange={onContractorChange}
              contractorTotal={contractorTotal}
              utility={utility}
            />
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
