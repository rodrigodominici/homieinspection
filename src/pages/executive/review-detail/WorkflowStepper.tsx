import { Button } from '@/components/ui/button';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, ClipboardList, Wrench, FileText, Send, Check, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCurrency } from './helpers';
import type { Inspection } from '@/lib/types';

interface HeaderStatusBadgeProps {
  status: Inspection['status'];
  ownerFeedbackStatus?: 'none' | 'pending_executive_review' | 'accepted' | null;
  onClick?: () => void;
}

function HeaderStatusBadge({ status, ownerFeedbackStatus, onClick }: HeaderStatusBadgeProps) {
  if (status === 'published' && ownerFeedbackStatus === 'pending_executive_review') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold text-amber-700 px-2 py-1 rounded bg-amber-50 border border-amber-500/40 hover:bg-amber-100 transition-colors"
      >
        <Info className="h-3 w-3" /> Feedback pendiente
      </button>
    );
  }
  if (status === 'published' && ownerFeedbackStatus === 'accepted') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold text-emerald-700 px-2 py-1 rounded bg-emerald-50 border border-emerald-500/30">
        <Check className="h-3 w-3" /> Aceptada por propietario
      </span>
    );
  }
  return <InspectionStatusBadge status={status} />;
}

export type ReviewMode = 'inspection' | 'repairs' | 'quotation' | 'publish';

interface StepDef {
  key: ReviewMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | null;
}

interface WorkflowStepperProps {
  inspection: Inspection;
  mode: ReviewMode;
  onModeChange: (m: ReviewMode) => void;
  onBack: () => void;

  // For step badges + the budget chip
  pendingDecisionsCount: number;
  repairsCount: number;
  grandTotal: number;
  isPublished: boolean;
  ownerFeedbackStatus?: 'none' | 'pending_executive_review' | 'accepted' | null;
}

export function WorkflowStepper({
  inspection, mode, onModeChange, onBack,
  pendingDecisionsCount, repairsCount, grandTotal, isPublished, ownerFeedbackStatus,
}: WorkflowStepperProps) {
  const ownerPending = ownerFeedbackStatus === 'pending_executive_review';
  const ownerAccepted = ownerFeedbackStatus === 'accepted';
  const steps: StepDef[] = [
    { key: 'inspection', label: 'Inspección', icon: ClipboardList, badge: pendingDecisionsCount || null },
    { key: 'repairs', label: 'Reparaciones', icon: Wrench, badge: repairsCount || null },
    { key: 'quotation', label: 'Cotización', icon: FileText, badge: null },
    { key: 'publish', label: 'Publicación', icon: Send, badge: ownerPending ? 1 : null },
  ];

  const currentIdx = steps.findIndex((s) => s.key === mode);

  return (
    <header className="sticky top-0 z-30 border-b bg-card">
      <div className="px-4 lg:px-6 h-14 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="min-w-0 flex items-center gap-2 shrink-0 max-w-[260px]">
          <p className="font-semibold truncate text-sm">
            {inspection.property_name ?? inspection.property_id}
          </p>
          <InspectionStatusBadge status={inspection.status} />
        </div>


        {/* Stepper */}
        <nav className="flex-1 flex items-center justify-center gap-1">
          {steps.map((s, idx) => {
            const isActive = s.key === mode;
            const isPast = idx < currentIdx;
            const Icon = s.icon;
            return (
              <div key={s.key} className="flex items-center">
                <button
                  type="button"
                  onClick={() => onModeChange(s.key)}
                  className={cn(
                    'group flex items-center gap-2 h-9 px-3 rounded-md text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : isPast
                        ? 'text-foreground hover:bg-muted/60'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  )}
                >
                  <span className={cn(
                    'inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-semibold shrink-0',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : isPast
                        ? 'bg-[hsl(var(--status-good))]/15 text-[hsl(var(--status-good))]'
                        : 'bg-muted text-muted-foreground',
                  )}>
                    {isPast ? <Check className="h-3 w-3" /> : idx + 1}
                  </span>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{s.label}</span>
                  {s.badge ? (
                    <span className={cn(
                      'ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums',
                      isActive ? 'bg-primary/20' : 'bg-muted-foreground/15',
                    )}>
                      {s.badge}
                    </span>
                  ) : null}
                </button>
                {idx < steps.length - 1 && (
                  <span className="mx-0.5 h-px w-3 bg-border" aria-hidden />
                )}
              </div>
            );
          })}
        </nav>

        {/* Budget chip (read-only) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onModeChange('repairs')}
              className="hidden lg:inline-flex items-center gap-2 px-3 h-9 rounded-md border bg-muted/30 hover:bg-muted/60 transition-colors shrink-0"
            >
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-sm font-mono font-semibold">{fmtCurrency(grandTotal)}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Ir a Reparaciones</TooltipContent>
        </Tooltip>

        {isPublished && !ownerPending && !ownerAccepted && (
          <span className="hidden lg:inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--status-good))] px-2 py-1 rounded bg-[hsl(var(--status-good))]/10">
            <Info className="h-3 w-3" /> Publicado
          </span>
        )}
        {ownerPending && (
          <button
            type="button"
            onClick={() => onModeChange('publish')}
            className="hidden lg:inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold text-amber-700 px-2 py-1 rounded bg-amber-50 border border-amber-500/40 hover:bg-amber-100"
          >
            <Info className="h-3 w-3" /> Feedback pendiente
          </button>
        )}
        {ownerAccepted && (
          <span className="hidden lg:inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold text-emerald-700 px-2 py-1 rounded bg-emerald-50 border border-emerald-500/30">
            <Check className="h-3 w-3" /> Aceptado por propietario
          </span>
        )}
      </div>
    </header>
  );
}
