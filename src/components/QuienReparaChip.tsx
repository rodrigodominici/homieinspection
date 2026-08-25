import { Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getQuienReparaShortLabel, type QuienRepara } from '@/lib/quien-repara';

const toneClass: Record<QuienRepara | 'undefined', string> = {
  homie: 'bg-[hsl(var(--status-approved-bg))] text-[hsl(var(--status-approved-fg))]',
  dueno: 'bg-[hsl(var(--status-pending-bg))] text-[hsl(var(--status-pending-fg))]',
  ninguno: 'bg-muted text-muted-foreground',
  undefined: 'bg-muted text-muted-foreground',
};

/** Read-only chip for the inspection-level `quien_repara` flag. */
export default function QuienReparaChip({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const key = (value ?? 'undefined') as QuienRepara | 'undefined';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0',
        toneClass[key] ?? toneClass.undefined,
        className,
      )}
    >
      <Wrench className="h-3 w-3" />
      {getQuienReparaShortLabel(value)}
    </span>
  );
}
