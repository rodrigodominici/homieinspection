import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { fmtCurrency, SectionTotalsBreakdown } from './helpers';
import type { InspectionSection } from '@/lib/types';

export type BudgetBreakdown = {
  ownerRequired: number; ownerOptional: number; ownerTotal: number;
  tenantRequired: number; tenantOptional: number; tenantTotal: number;
  grandTotal: number;
  bySection: Record<string, { owner: number; tenant: number; total: number }>;
};

interface BudgetSummaryBarProps {
  sections: InspectionSection[];
  budgetBreakdown: BudgetBreakdown;
  warrantyDeposit: number | null;
  depositDiff: number | null;
  activeSectionId: string | null;
  itemCount: number;
  clientTotal: number;
  contractorTotal: number;
}

function Stat({ label, value, muted, className }: { label: string; value: string; muted?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5', className)}>
      <span className={cn('text-sm font-medium font-mono', muted && 'text-muted-foreground')}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

/**
 * Compact 3-value financial header. Detailed payer breakdown lives in the
 * tooltip so the strip no longer overflows on standard viewports.
 */
export function BudgetSummaryBar({
  sections, budgetBreakdown, warrantyDeposit, depositDiff, activeSectionId,
  itemCount, clientTotal, contractorTotal,
}: BudgetSummaryBarProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-4 px-2 py-1 rounded-md hover:bg-muted/40 cursor-help shrink-0">
          <Stat label="ítems" value={String(itemCount)} />
          <span className="h-3 w-px bg-border" aria-hidden />
          <Stat label="precio cliente" value={fmtCurrency(clientTotal)} />
          <span className="h-3 w-px bg-border" aria-hidden />
          <Stat label="costo contratista" value={fmtCurrency(contractorTotal)} muted />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-sm space-y-3">
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide opacity-70">Desglose por pagador</p>
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-xs">
            <span>Propietario · obligatorio</span><span className="font-mono">{fmtCurrency(budgetBreakdown.ownerRequired)}</span>
            <span>Propietario · opcional</span><span className="font-mono">{fmtCurrency(budgetBreakdown.ownerOptional)}</span>
            <span className="font-medium">Propietario total</span><span className="font-mono font-medium">{fmtCurrency(budgetBreakdown.ownerTotal)}</span>
            <span>Inquilino · obligatorio</span><span className="font-mono">{fmtCurrency(budgetBreakdown.tenantRequired)}</span>
            <span>Inquilino · opcional</span><span className="font-mono">{fmtCurrency(budgetBreakdown.tenantOptional)}</span>
            <span className="font-medium">Inquilino total</span><span className="font-mono font-medium">{fmtCurrency(budgetBreakdown.tenantTotal)}</span>
            <span className="font-semibold pt-1 border-t border-border/60">Total general</span>
            <span className="font-mono font-semibold pt-1 border-t border-border/60">{fmtCurrency(budgetBreakdown.grandTotal)}</span>
          </div>
        </div>
        {warrantyDeposit !== null && (
          <div className="space-y-0.5 pt-2 border-t border-border/60">
            <div className="flex justify-between text-xs">
              <span>Depósito de garantía</span>
              <span className="font-mono">{fmtCurrency(warrantyDeposit)}</span>
            </div>
            {depositDiff !== null && budgetBreakdown.ownerRequired > 0 && (
              <div className="flex justify-between text-xs">
                <span>vs propietario obligatorio</span>
                <span className={cn('font-mono', depositDiff >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]')}>
                  {depositDiff >= 0 ? '+' : ''}{fmtCurrency(depositDiff)}
                </span>
              </div>
            )}
          </div>
        )}
        <SectionTotalsBreakdown
          sections={sections}
          bySection={budgetBreakdown.bySection}
          field="total"
          activeId={activeSectionId}
        />
      </TooltipContent>
    </Tooltip>
  );
}
