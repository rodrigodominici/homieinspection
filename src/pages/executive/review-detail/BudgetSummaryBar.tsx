import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SectionTotalsBreakdown, fmtCurrency } from './helpers';
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
}

function StatBlock({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[110px]', className)}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-mono font-semibold">{value}</p>
    </div>
  );
}

export function BudgetSummaryBar({
  sections, budgetBreakdown, warrantyDeposit, depositDiff, activeSectionId,
}: BudgetSummaryBarProps) {
  return (
    <>
      <StatBlock label="Depósito" value={warrantyDeposit !== null ? fmtCurrency(warrantyDeposit) : '—'} />
      <StatBlock label="Inquilino" value={fmtCurrency(budgetBreakdown.tenantRequired)} />
      <StatBlock label="Inq. Opcional" value={fmtCurrency(budgetBreakdown.tenantOptional)} />

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

      <StatBlock label="Propietario" value={fmtCurrency(budgetBreakdown.ownerRequired)} />
      <StatBlock label="Prop. Opcional" value={fmtCurrency(budgetBreakdown.ownerOptional)} />

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
    </>
  );
}
