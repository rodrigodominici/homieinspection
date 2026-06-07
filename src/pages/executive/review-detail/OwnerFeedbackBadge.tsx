/**
 * Compact badge used in editing surfaces (tabla de reparaciones, panel por
 * sección, cotización) para señalar la decisión del propietario sobre una
 * reparación específica. Si recibe `comment`, lo expone en un tooltip.
 */
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OwnerDecision } from '@/modules/review/api/useOwnerFeedbackByRepair';

interface OwnerFeedbackBadgeProps {
  decision: OwnerDecision;
  comment?: string | null;
  size?: 'sm' | 'xs';
  className?: string;
}

const styles: Record<OwnerDecision, { label: string; cls: string; Icon: typeof Check }> = {
  accepted: {
    label: 'Aceptada',
    cls: 'border-emerald-500/40 bg-emerald-50 text-emerald-700',
    Icon: Check,
  },
  observed: {
    label: 'Observada',
    cls: 'border-amber-500/40 bg-amber-50 text-amber-700',
    Icon: MessageSquare,
  },
  rejected: {
    label: 'Rechazada',
    cls: 'border-red-500/40 bg-red-50 text-red-700',
    Icon: X,
  },
};

export function OwnerFeedbackBadge({ decision, comment, size = 'sm', className }: OwnerFeedbackBadgeProps) {
  const { label, cls, Icon } = styles[decision];
  const sizeCls = size === 'xs' ? 'h-4 px-1.5 text-[10px] gap-0.5' : 'gap-1';
  const iconCls = size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3';

  const badge = (
    <Badge variant="outline" className={cn(cls, sizeCls, className)}>
      <Icon className={iconCls} /> {label}
    </Badge>
  );

  if (!comment) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="text-xs italic">"{comment}"</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Helper class to tint borders/backgrounds for cards/rows con feedback pendiente. */
export function feedbackAccentClasses(decision: OwnerDecision | undefined): {
  border: string;
  bg: string;
} {
  if (decision === 'rejected') return { border: 'border-red-500/50', bg: 'bg-red-50/40' };
  if (decision === 'observed') return { border: 'border-amber-500/50', bg: 'bg-amber-50/40' };
  return { border: '', bg: '' };
}
