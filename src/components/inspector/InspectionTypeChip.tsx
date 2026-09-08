import { cn } from '@/lib/utils';
import {
  getInspectionTypeLabel,
  normalizeInspectionType,
  type CanonicalInspectionType,
  type InspectionType,
} from '@/lib/inspection-type-labels';

interface InspectionTypeChipProps {
  type: InspectionType;
  className?: string;
  size?: 'xs' | 'sm';
}

const TONE: Record<CanonicalInspectionType, string> = {
  captacion:
    'bg-[hsl(var(--status-good))]/10 text-[hsl(var(--status-good))] border-[hsl(var(--status-good))]/20',
  check_out: 'bg-primary/5 text-primary border-primary/20',
  check_in:
    'bg-[hsl(var(--status-regular-bg))] text-[hsl(var(--status-regular))] border-[hsl(var(--status-regular))]/25',
};


/**
 * Chip visible del tipo de inspección (Captación / Check-out / Check-in).
 * Usa tokens semánticos del design system.
 */
export default function InspectionTypeChip({
  type,
  className,
  size = 'sm',
}: InspectionTypeChipProps) {
  const canonical = normalizeInspectionType(type);
  const label = getInspectionTypeLabel(type);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold shrink-0 border whitespace-nowrap',
        size === 'xs' ? 'text-[10px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5',
        TONE[canonical],
        className,
      )}
    >
      {label}
    </span>
  );
}
