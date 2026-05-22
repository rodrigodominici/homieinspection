import { Clock } from 'lucide-react';

interface InspectorProgressCardProps {
  inspectorProgressLabel: string;
  progress: { completed: number; total: number };
  lastActiveRelative: string | null;
  address: string | null | undefined;
}

export function InspectorProgressCard({
  inspectorProgressLabel, progress, lastActiveRelative, address,
}: InspectorProgressCardProps) {
  return (
    <div className="flex items-center gap-2 text-tiny text-muted-foreground truncate">
      {address && <span className="truncate">{address}</span>}
      {address && <span className="text-border">·</span>}
      <Clock className="h-3 w-3 shrink-0" />
      <span className="shrink-0">{inspectorProgressLabel} {progress.completed}/{progress.total}</span>
      {lastActiveRelative && <span className="shrink-0 truncate">· {lastActiveRelative}</span>}
    </div>
  );
}
