/**
 * Comparación lado a lado de dos inspecciones del mismo inmueble.
 * Alinea las secciones por `section_key` y muestra la observación final y las
 * fotos de cada momento. Al abrir una foto se muestra el visor comparado:
 * antes y después de la misma sección, con zoom independiente.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, MinusCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingState, EmptyState, ErrorState } from '@/shared/ui';
import InspectionTypeChip from '@/components/inspector/InspectionTypeChip';
import { ZoomableImage } from '@/components/photos/ZoomableImage';
import { useSignedPhotoUrls } from '@/lib/photo-urls';
import {
  listComparableSections,
  propertyEventDate,
  type ComparablePhoto,
  type ComparableSection,
} from '@/modules/properties/api/properties.service';
import { getInspectionTypeLabel } from '@/lib/inspection-type-labels';
import type { Inspection } from '@/lib/types';

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const optionLabel = (i: Inspection) =>
  `${getInspectionTypeLabel(i.inspection_type)} · ${fmt(propertyEventDate(i))}`;

/** Fotos visibles por defecto en cada celda antes de "Ver más". */
const PHOTO_PAGE = 6;

interface LightboxState {
  sectionKey: string;
  sectionTitle: string;
  side: 'left' | 'right';
  index: number;
}

export function PropertyComparison({ inspections }: { inspections: Inspection[] }) {
  const [leftId, setLeftId] = useState<string>(() => inspections[inspections.length - 1]?.id ?? '');
  const [rightId, setRightId] = useState<string>(() => inspections[0]?.id ?? '');
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

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

  // Una sola firma de URLs para todas las fotos de la comparación.
  const allPhotos = useMemo(
    () => (data ?? []).flatMap((s) => s.photos),
    [data],
  );
  const urlOf = useSignedPhotoUrls(allPhotos);

  const activeRow = lightbox ? rows.find((r) => r.key === lightbox.sectionKey) : undefined;

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
                    <SectionCell
                      section={row.left}
                      urlOf={urlOf}
                      onOpenPhoto={(index) =>
                        setLightbox({ sectionKey: row.key, sectionTitle: row.title, side: 'left', index })
                      }
                    />
                    <SectionCell
                      section={row.right}
                      urlOf={urlOf}
                      onOpenPhoto={(index) =>
                        setLightbox({ sectionKey: row.key, sectionTitle: row.title, side: 'right', index })
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Visor comparado: misma sección, antes y después */}
      <Dialog open={lightbox !== null} onOpenChange={(o) => { if (!o) setLightbox(null); }}>
        <DialogContent className="max-w-6xl p-3">
          <DialogHeader>
            <DialogTitle className="text-caption">
              {lightbox?.sectionTitle ?? ''} — comparación de fotos
            </DialogTitle>
          </DialogHeader>
          {lightbox && activeRow && (
            <div className="grid md:grid-cols-2 gap-3">
              <ComparePane
                label={left ? `Antes · ${getInspectionTypeLabel(left.inspection_type)} · ${fmt(propertyEventDate(left))}` : 'Antes'}
                photos={activeRow.left?.photos ?? []}
                initialIndex={lightbox.side === 'left' ? lightbox.index : 0}
                urlOf={urlOf}
              />
              <ComparePane
                label={right ? `Después · ${getInspectionTypeLabel(right.inspection_type)} · ${fmt(propertyEventDate(right))}` : 'Después'}
                photos={activeRow.right?.photos ?? []}
                initialIndex={lightbox.side === 'right' ? lightbox.index : 0}
                urlOf={urlOf}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type UrlOf = (id: string, variant?: 'full' | 'thumb') => string;

function SectionCell({
  section, urlOf, onOpenPhoto,
}: {
  section?: ComparableSection;
  urlOf: UrlOf;
  onOpenPhoto: (index: number) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PHOTO_PAGE);

  if (!section) {
    return (
      <div className="p-4 text-sm text-muted-foreground inline-flex items-center gap-2">
        <MinusCircle className="h-4 w-4" /> No existe en esta inspección
      </div>
    );
  }

  const photos = section.photos;

  return (
    <div className="p-4 space-y-3">
      <p className="text-sm whitespace-pre-wrap">
        {section.final_observation?.trim() || (
          <span className="text-muted-foreground">Sin observación final</span>
        )}
      </p>

      {photos.length === 0 ? (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Camera className="h-3 w-3" /> Sin fotos
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Camera className="h-3 w-3" /> {photos.length} fotos
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.slice(0, visibleCount).map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenPhoto(idx)}
                title={p.caption ?? 'Ver y comparar'}
                className="block w-full aspect-[4/3] rounded-md overflow-hidden border border-border/60 hover:border-primary/60 transition-colors"
              >
                <img
                  src={urlOf(p.id, 'thumb')}
                  alt={p.caption ?? ''}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
          {photos.length > visibleCount && (
            <Button
              type="button" variant="outline" size="sm"
              className="w-full h-8 text-xs"
              onClick={() => setVisibleCount((c) => c + PHOTO_PAGE)}
            >
              Ver más fotos ({photos.length - visibleCount} restantes)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ComparePane({
  label, photos, initialIndex, urlOf,
}: {
  label: string;
  photos: ComparablePhoto[];
  initialIndex: number;
  urlOf: UrlOf;
}) {
  const [idx, setIdx] = useState(() => Math.min(initialIndex, Math.max(photos.length - 1, 0)));
  const photo = photos[idx];

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
      {!photo ? (
        <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-border/70 flex items-center justify-center text-xs text-muted-foreground">
          Sin fotos en esta sección
        </div>
      ) : (
        <>
          <ZoomableImage
            src={urlOf(photo.id)}
            alt={photo.caption ?? ''}
            photoKey={photo.id}
            showNav={photos.length > 1}
            onPrev={() => setIdx((i) => (i > 0 ? i - 1 : photos.length - 1))}
            onNext={() => setIdx((i) => (i < photos.length - 1 ? i + 1 : 0))}
            maxHeightClass="max-h-[60vh]"
          />
          <p className="text-tiny text-muted-foreground text-center">
            Foto {idx + 1} de {photos.length}
            {photo.caption ? ` — ${photo.caption}` : ''}
          </p>
        </>
      )}
    </div>
  );
}

export default PropertyComparison;
