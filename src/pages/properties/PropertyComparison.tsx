/**
 * Comparación lado a lado de dos inspecciones del mismo inmueble.
 * Alinea las secciones por `section_key` y muestra la observación final y la
 * cantidad de fotos de cada momento.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, MinusCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingState, EmptyState, ErrorState } from '@/shared/ui';
import InspectionTypeChip from '@/components/inspector/InspectionTypeChip';
import {
  listComparableSections,
  propertyEventDate,
  type ComparableSection,
} from '@/modules/properties/api/properties.service';
import { getInspectionTypeLabel } from '@/lib/inspection-type-labels';
import type { Inspection } from '@/lib/types';

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const optionLabel = (i: Inspection) =>
  `${getInspectionTypeLabel(i.inspection_type)} · ${fmt(propertyEventDate(i))}`;

export function PropertyComparison({ inspections }: { inspections: Inspection[] }) {
  const [leftId, setLeftId] = useState<string>(() => inspections[inspections.length - 1]?.id ?? '');
  const [rightId, setRightId] = useState<string>(() => inspections[0]?.id ?? '');

  const ids = useMemo(
    () => Array.from(new Set([leftId, rightId].filter(Boolean))),
    [leftId, rightId],
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['properties', 'comparison', ids],
    queryFn: () => listComparableSections(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });

  const left = inspections.find((i) => i.id === leftId);
  const right = inspections.find((i) => i.id === rightId);

  const rows = useMemo(() => {
    const sections = data ?? [];
    const byKey = new Map<string, { title: string; sort: number; left?: ComparableSection; right?: ComparableSection }>();
    for (const s of sections) {
      const entry = byKey.get(s.section_key) ?? { title: s.section_title, sort: s.sort_order };
      if (s.inspection_id === leftId) entry.left = s;
      if (s.inspection_id === rightId) entry.right = s;
      entry.sort = Math.min(entry.sort, s.sort_order);
      byKey.set(s.section_key, entry);
    }
    return [...byKey.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.sort - b.sort);
  }, [data, leftId, rightId]);

  if (inspections.length < 2) {
    return (
      <EmptyState
        title="Se necesitan dos inspecciones"
        description="Este inmueble tiene solo una inspección registrada, aún no hay estados que comparar."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Antes</Label>
          <Select value={leftId} onValueChange={setLeftId}>
            <SelectTrigger><SelectValue placeholder="Elige una inspección" /></SelectTrigger>
            <SelectContent>
              {inspections.map((i) => (
                <SelectItem key={i.id} value={i.id}>{optionLabel(i)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Después</Label>
          <Select value={rightId} onValueChange={setRightId}>
            <SelectTrigger><SelectValue placeholder="Elige una inspección" /></SelectTrigger>
            <SelectContent>
              {inspections.map((i) => (
                <SelectItem key={i.id} value={i.id}>{optionLabel(i)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            {[left, right].map((i, idx) => (
              <div key={idx} className="rounded-lg border bg-muted/30 p-3 flex items-center gap-2">
                {i ? (
                  <>
                    <InspectionTypeChip type={i.inspection_type} size="xs" />
                    <span className="text-sm text-muted-foreground">{fmt(propertyEventDate(i))}</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Sin selección</span>
                )}
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyState title="Sin secciones para comparar" />
          ) : (
            rows.map((row) => (
              <Card key={row.key}>
                <CardContent className="p-0">
                  <div className="px-4 py-2 border-b bg-muted/20">
                    <p className="text-sm font-semibold">{row.title}</p>
                  </div>
                  <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
                    <SectionCell section={row.left} />
                    <SectionCell section={row.right} />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SectionCell({ section }: { section?: ComparableSection }) {
  if (!section) {
    return (
      <div className="p-4 text-sm text-muted-foreground inline-flex items-center gap-2">
        <MinusCircle className="h-4 w-4" /> No existe en esta inspección
      </div>
    );
  }
  return (
    <div className="p-4 space-y-2">
      <p className="text-sm whitespace-pre-wrap">
        {section.final_observation?.trim() || (
          <span className="text-muted-foreground">Sin observación final</span>
        )}
      </p>
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <Camera className="h-3 w-3" /> {section.photoCount} fotos
      </p>
    </div>
  );
}

export default PropertyComparison;
