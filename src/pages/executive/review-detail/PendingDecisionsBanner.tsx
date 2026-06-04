import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { InspectionSection } from '@/lib/types';

interface PendingDecisionsBannerProps {
  missingSections: InspectionSection[];
  onJumpToSection: (id: string) => void;
}

/**
 * Persistent "what's left for me" banner shown inside Inspección mode.
 * Lets the executive jump straight to the next decision-blocking section.
 */
export function PendingDecisionsBanner({
  missingSections, onJumpToSection,
}: PendingDecisionsBannerProps) {
  if (missingSections.length === 0) return null;
  const next = missingSections[0];
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-[hsl(var(--status-regular))]/30 bg-[hsl(var(--status-regular))]/8">
      <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-regular))] shrink-0" />
      <div className="flex-1 min-w-0 text-sm">
        <span className="font-medium">
          {missingSections.length} {missingSections.length === 1 ? 'sección' : 'secciones'} sin observación final
        </span>
        <span className="text-muted-foreground"> · próxima: {next.section_title}</span>
      </div>
      <button
        type="button"
        onClick={() => onJumpToSection(next.id)}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
      >
        Ir <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}
