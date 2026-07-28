import { cn } from '@/lib/utils';
import {
  getInspectionTypeLabel,
  isCaptacion,
  type InspectionType,
} from '@/lib/inspection-type-labels';

interface InspectionTypeChipProps {
  type: InspectionType;
  className?: string;
  size?: 'xs' | 'sm';
}

/**
 * Chip visible del tipo de inspección (Captación / Check-out) para las
 * vistas del rol Inspector. Usa tokens semánticos del design system.
 */
export default function InspectionTypeChip({
  type,
  className,
  size = 'sm',
}: InspectionTypeChipProps) {
  const captacion = isCaptacion(type);
  const label = getInspectionTypeLabel(type);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold shrink-0 border',
        size === 'xs' ? 'text-[10px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5',
        captacion
          ? 'bg-[hsl(var(--status-good))]/10 text-[hsl(var(--status-good))] border-[hsl(var(--status-good))]/20'
          : 'bg-primary/5 text-primary border-primary/20',
        className,
      )}
    >
      {label}
    </span>
  );
}
