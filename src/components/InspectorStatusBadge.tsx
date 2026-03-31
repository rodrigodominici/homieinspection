import { cn } from '@/lib/utils';
import type { InspectorDisplayState } from '@/lib/inspector-operational';

const toneClass: Record<InspectorDisplayState['tone'], string> = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-status-regular-bg text-status-regular',
  warning: 'bg-status-bad-bg text-status-bad',
  good: 'bg-status-good-bg text-status-good',
};

export default function InspectorStatusBadge({ state }: { state: InspectorDisplayState }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', toneClass[state.tone])}>
      {state.label}
    </span>
  );
}