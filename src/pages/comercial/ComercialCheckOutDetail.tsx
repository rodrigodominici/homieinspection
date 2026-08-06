import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { INSPECTION_LIST_COLUMNS } from '@/lib/inspection-columns';
import type {
  Inspection,
  InspectionFieldValue,
  InspectionPhoto,
  InspectionSection,
  InspectionSignature,
  Profile,
} from '@/lib/types';
import ComercialLayout from './ComercialLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import InspectionTypeChip from '@/components/inspector/InspectionTypeChip';
import {
  ArrowLeft, Camera, ChevronLeft, ChevronRight, Download, MapPin,
  RotateCcw, ZoomIn, ZoomOut, PenLine,
} from 'lucide-react';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import { useSignedPhotoUrls } from '@/lib/photo-urls';
import { cn } from '@/lib/utils';

// ── Data loaders ─────────────────────────────────────────────────────────────

async function fetchInspection(id: string): Promise<Inspection | null> {
  const { data, error } = await supabase
    .from('inspections')
    .select(INSPECTION_LIST_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Inspection | null;
}

async function fetchSections(id: string): Promise<InspectionSection[]> {
  const { data, error } = await supabase
    .from('inspection_sections')
    .select('*')
    .eq('inspection_id', id)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as InspectionSection[];
}

async function fetchFields(id: string): Promise<InspectionFieldValue[]> {
  const { data, error } = await supabase
    .from('inspection_field_values')
    .select('*')
    .eq('inspection_id', id)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as InspectionFieldValue[];
}

async function fetchPhotos(id: string): Promise<InspectionPhoto[]> {
  const { data, error } = await supabase
    .from('inspection_photos')
    .select('*')
    .eq('inspection_id', id)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as InspectionPhoto[];
}

async function fetchSignatures(id: string): Promise<InspectionSignature[]> {
  const { data, error } = await supabase
    .from('inspection_signatures')
    .select('*')
    .eq('inspection_id', id);
  if (error) throw error;
  return (data ?? []) as unknown as InspectionSignature[];
}

async function fetchProfilesByIds(ids: string[]): Promise<Profile[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('id', ids);
  if (error) throw error;
  return (data ?? []) as unknown as Profile[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  bien: { text: 'Bien', cls: 'text-status-good' },
  regular: { text: 'Regular', cls: 'text-status-regular' },
  malo: { text: 'Malo', cls: 'text-status-bad' },
  nueva: { text: 'Nueva', cls: 'text-status-good' },
  usado: { text: 'Usado', cls: 'text-status-regular' },
  no_aplica: { text: 'No aplica', cls: 'text-muted-foreground' },
  na: { text: 'No aplica', cls: 'text-muted-foreground' },
};

function statusLabel(v: string | null | undefined) {
  if (!v) return null;
  const key = v.toLowerCase();
  return STATUS_LABELS[key] ?? { text: v, cls: 'text-foreground' };
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-CL', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return '—'; }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

// ── Section block ────────────────────────────────────────────────────────────

interface SectionBlockProps {
  section: InspectionSection;
  fields: InspectionFieldValue[];
  photos: InspectionPhoto[];
  urlOf: (photoId: string, variant?: 'full' | 'thumb') => string;
  onOpenLightbox: (photos: InspectionPhoto[], idx: number) => void;
}

function SectionBlock({ section, fields, photos, urlOf, onOpenLightbox }: SectionBlockProps) {
  const statusFields = fields.filter((f) => f.group_key === 'status' && f.value_text);
  const otherFields = fields.filter(
    (f) => f.group_key !== 'status'
      && f.group_key !== 'photo'
      && f.group_key !== 'observation'
      && f.value_text,
  );
  const observationField = fields.find(
    (f) => f.group_key === 'observation' && f.value_text,
  );
  const observation = section.final_observation || observationField?.value_text || null;
  const visiblePhotos = photos.filter((p) => (p as any).visible_to_owner !== false);

  const hasContent =
    statusFields.length > 0 ||
    otherFields.length > 0 ||
    !!observation ||
    visiblePhotos.length > 0;

  if (!hasContent) return null;

  return (
    <Card className="p-5 space-y-4 print:break-inside-avoid">
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <h3 className="text-h4 font-semibold">{section.section_title}</h3>
        <span className="text-tiny text-muted-foreground uppercase tracking-wide">
          {section.section_type.replace(/_/g, ' ')}
        </span>
      </div>

      {statusFields.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {statusFields.map((f) => {
            const lbl = statusLabel(f.value_text);
            return (
              <div key={f.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/60 border border-border/50 text-caption">
                <span className="text-foreground/80 font-medium">{f.field_label}</span>
                {lbl && <span className={cn(lbl.cls, 'font-semibold text-[12px]')}>{lbl.text}</span>}
              </div>
            );
          })}
        </div>
      )}

      {otherFields.length > 0 && (
        <div className="space-y-1.5">
          {otherFields.map((f) => (
            <div key={f.id} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 text-caption">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground sm:min-w-[140px] shrink-0">
                {f.field_label}
              </span>
              <span className="text-foreground whitespace-pre-wrap">{f.value_text}</span>
            </div>
          ))}
        </div>
      )}

      {observation && (
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground mb-1">
            Observación
          </p>
          <p className="text-caption text-foreground whitespace-pre-wrap">{observation}</p>
        </div>
      )}

      {visiblePhotos.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Camera className="h-3 w-3" /> Fotos · {visiblePhotos.length}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {visiblePhotos.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenLightbox(visiblePhotos, idx)}
                className="block w-full aspect-[4/3] rounded-lg overflow-hidden border border-border/60 bg-muted/30 hover:opacity-90 transition-opacity print:break-inside-avoid"
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
        </div>
      )}
    </Card>
  );
}

// ── Zoomable lightbox (self-contained) ───────────────────────────────────────

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

function ZoomableImage({
  src, alt, onPrev, onNext, showNav,
}: {
  src: string; alt: string; onPrev: () => void; onNext: () => void; showNav: boolean;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, []);
  useEffect(() => { reset(); }, [src, reset]);

  const zoomAt = useCallback((next: number) => {
    setScale(() => {
      const clamped = clampScale(next);
      if (clamped === 1) setOffset({ x: 0, y: 0 });
      return clamped;
    });
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={cn(
          'relative w-full max-h-[75vh] overflow-hidden rounded-lg bg-muted/30 select-none',
          scale > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in',
        )}
        style={{ aspectRatio: '4 / 3' }}
        onWheel={(e) => { e.preventDefault(); zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }}
        onDoubleClick={() => (scale > 1 ? reset() : zoomAt(2.5))}
        onPointerDown={(e) => {
          if (scale <= 1) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDragging(true);
          dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(e) => {
          if (!dragging || !dragStart.current) return;
          setOffset({
            x: dragStart.current.ox + (e.clientX - dragStart.current.x),
            y: dragStart.current.oy + (e.clientY - dragStart.current.y),
          });
        }}
        onPointerUp={() => { setDragging(false); dragStart.current = null; }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 120ms ease-out',
          }}
        />
      </div>
      {showNav && scale === 1 && (
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-2 pointer-events-none">
          <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full pointer-events-auto" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full pointer-events-auto" onClick={onNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-background/90 backdrop-blur border border-border/60 rounded-full px-1.5 py-1 shadow-sm">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => zoomAt(scale / 1.25)} disabled={scale <= MIN_SCALE}><ZoomOut className="h-3.5 w-3.5" /></Button>
        <span className="text-tiny tabular-nums w-10 text-center text-muted-foreground">{Math.round(scale * 100)}%</span>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => zoomAt(scale * 1.25)} disabled={scale >= MAX_SCALE}><ZoomIn className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={reset} disabled={scale === 1 && offset.x === 0 && offset.y === 0}><RotateCcw className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ComercialCheckOutDetail() {
  const { id } = useParams<{ id: string }>();

  const inspectionQ = useQuery({
    queryKey: ['comercial', 'inspection', id],
    queryFn: () => fetchInspection(id!),
    enabled: !!id,
  });
  const sectionsQ = useQuery({
    queryKey: ['comercial', 'inspection', id, 'sections'],
    queryFn: () => fetchSections(id!),
    enabled: !!id,
  });
  const fieldsQ = useQuery({
    queryKey: ['comercial', 'inspection', id, 'fields'],
    queryFn: () => fetchFields(id!),
    enabled: !!id,
  });
  const photosQ = useQuery({
    queryKey: ['comercial', 'inspection', id, 'photos'],
    queryFn: () => fetchPhotos(id!),
    enabled: !!id,
  });
  const signaturesQ = useQuery({
    queryKey: ['comercial', 'inspection', id, 'signatures'],
    queryFn: () => fetchSignatures(id!),
    enabled: !!id,
  });

  const inspection = inspectionQ.data;
  const profileIds = useMemo(() => {
    const ids: string[] = [];
    if (inspection?.inspector_id) ids.push(inspection.inspector_id);
    if (inspection?.executive_id) ids.push(inspection.executive_id);
    return ids;
  }, [inspection]);
  const profilesQ = useQuery({
    queryKey: ['comercial', 'profiles', profileIds.slice().sort().join(',')],
    queryFn: () => fetchProfilesByIds(profileIds),
    enabled: profileIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>();
    (profilesQ.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profilesQ.data]);

  const photos = photosQ.data ?? [];
  const urlOf = useSignedPhotoUrls(photos);

  const [lightbox, setLightbox] = useState<{ photos: InspectionPhoto[]; idx: number } | null>(null);

  const isLoading =
    inspectionQ.isLoading || sectionsQ.isLoading || fieldsQ.isLoading || photosQ.isLoading;
  const anyError =
    inspectionQ.error || sectionsQ.error || fieldsQ.error || photosQ.error || signaturesQ.error;

  if (isLoading) {
    return (
      <ComercialLayout>
        <div className="p-6 max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ComercialLayout>
    );
  }

  if (anyError || !inspection) {
    return (
      <ComercialLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <Card className="p-8 text-center">
            <p className="text-sm font-medium">Check-out no disponible</p>
            <p className="text-caption text-muted-foreground mt-1">
              Puede que aún no esté ejecutado o que no tengas acceso.
            </p>
            <Button asChild variant="ghost" className="mt-4">
              <Link to="/comercial"><ArrowLeft className="h-4 w-4 mr-1" /> Volver al listado</Link>
            </Button>
          </Card>
        </div>
      </ComercialLayout>
    );
  }

  const snap = getEffectiveSnapshot(inspection) ?? {};
  const address = (snap.address as string | undefined) ?? inspection.address ?? inspection.property_name ?? '—';
  const propertyType = (snap.property_type as string | undefined) ?? inspection.property_type ?? '—';
  const bedrooms = snap.bedrooms_count as number | undefined;
  const bathrooms = snap.bathrooms_count as number | undefined;
  const tower = snap.tower as string | undefined;
  const unit = snap.unit_number as string | undefined;
  const parkingNumber = snap.parking_number as string | undefined;
  const storageNumber = snap.storage_number as string | undefined;
  const tenantName = snap.tenant_name as string | undefined;

  const executive = inspection.executive_id ? profileMap.get(inspection.executive_id) : null;
  const inspector = inspection.inspector_id ? profileMap.get(inspection.inspector_id) : null;

  const visibleSections = (sectionsQ.data ?? []).filter((s) => s.is_visible);
  const fieldsBySection = new Map<string, InspectionFieldValue[]>();
  (fieldsQ.data ?? []).forEach((f) => {
    const arr = fieldsBySection.get(f.inspection_section_id) ?? [];
    arr.push(f);
    fieldsBySection.set(f.inspection_section_id, arr);
  });
  const photosBySection = new Map<string, InspectionPhoto[]>();
  photos.forEach((p) => {
    const arr = photosBySection.get(p.inspection_section_id) ?? [];
    arr.push(p);
    photosBySection.set(p.inspection_section_id, arr);
  });

  const tenantSignature = (signaturesQ.data ?? []).find(
    (s) => s.signer_type === 'tenant' || s.signer_type === 'occupant',
  );
  const inspectorSignature = (signaturesQ.data ?? []).find(
    (s) => s.signer_type === 'inspector',
  );

  return (
    <ComercialLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        {/* Back + actions */}
        <div className="flex items-center justify-between gap-3 print:hidden">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link to="/comercial"><ArrowLeft className="h-4 w-4 mr-1" /> Volver al listado</Link>
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Download className="h-4 w-4 mr-1.5" />
            Descargar PDF
          </Button>
        </div>

        {/* Header card */}
        <Card className="p-5 print:break-inside-avoid">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <InspectionTypeChip type={inspection.inspection_type} />
                <InspectionStatusBadge status={inspection.status} />
                <span className="text-tiny text-muted-foreground uppercase tracking-wide">
                  {inspection.market}
                </span>
              </div>
              <h1 className="text-h2 font-semibold leading-tight flex items-start gap-2">
                <MapPin className="h-5 w-5 mt-1 text-muted-foreground shrink-0" />
                <span>{address}</span>
              </h1>
              {(tower || unit) && (
                <p className="text-caption text-muted-foreground mt-1">
                  {tower && <>Torre <span className="font-medium text-foreground">{tower}</span>{unit && ' · '}</>}
                  {unit && <>Unidad <span className="font-medium text-foreground">{unit}</span></>}
                </p>
              )}
            </div>
          </div>

          {/* Meta grid */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-caption">
            <MetaCell label="Tipo de propiedad" value={propertyType} />
            <MetaCell label="Dormitorios" value={bedrooms != null ? String(bedrooms) : '—'} />
            <MetaCell label="Baños" value={bathrooms != null ? String(bathrooms) : '—'} />
            <MetaCell label="Estacionamiento" value={parkingNumber ?? (snap.has_parking ? 'Sí' : '—')} />
            <MetaCell label="Bodega" value={storageNumber ?? (snap.has_storage ? 'Sí' : '—')} />
            <MetaCell label="Inquilino" value={tenantName ?? '—'} />
            <MetaCell label="Ejecutivo" value={executive?.full_name ?? '—'} />
            <MetaCell label="Inspector" value={inspector?.full_name ?? '—'} />
            <MetaCell label="Inspección" value={formatDateTime(inspection.inspection_completed_at ?? inspection.completed_at)} />
            <MetaCell label="Enviada" value={formatDateTime(inspection.completed_at)} />
            <MetaCell label="Aprobada" value={formatDateTime(inspection.approved_at)} />
            <MetaCell label="Publicada" value={formatDateTime(inspection.published_at)} />
          </div>
        </Card>

        {/* Sections */}
        <div className="space-y-4">
          <h2 className="text-h3 font-semibold">Hallazgos por sección</h2>
          {visibleSections.length === 0 && (
            <Card className="p-6 text-center text-caption text-muted-foreground">
              No hay secciones para mostrar.
            </Card>
          )}
          {visibleSections.map((s) => (
            <SectionBlock
              key={s.id}
              section={s}
              fields={fieldsBySection.get(s.id) ?? []}
              photos={photosBySection.get(s.id) ?? []}
              urlOf={urlOf}
              onOpenLightbox={(ps, idx) => setLightbox({ photos: ps, idx })}
            />
          ))}
        </div>

        {/* Signatures */}
        <Card className="p-5 space-y-4 print:break-inside-avoid">
          <div className="flex items-center gap-2 border-b pb-2">
            <PenLine className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-h3 font-semibold">Firmas</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SignatureBlock label="Inspector" signature={inspectorSignature} />
            <SignatureBlock label="Inquilino" signature={tenantSignature} />
          </div>
        </Card>

        <p className="text-tiny text-muted-foreground text-center pt-2 print:hidden">
          Vista de solo consulta · {formatDate(inspection.updated_at)}
        </p>
      </div>

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(o) => { if (!o) setLightbox(null); }}>
        <DialogContent className="max-w-4xl p-2">
          <DialogHeader>
            <DialogTitle className="text-caption">
              {lightbox && (
                <>Foto {lightbox.idx + 1} de {lightbox.photos.length}
                  {lightbox.photos[lightbox.idx]?.caption && ` — ${lightbox.photos[lightbox.idx].caption}`}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {lightbox && (
            <ZoomableImage
              src={urlOf(lightbox.photos[lightbox.idx].id)}
              alt={lightbox.photos[lightbox.idx].caption ?? ''}
              showNav={lightbox.photos.length > 1}
              onPrev={() =>
                setLightbox((l) =>
                  l ? { ...l, idx: l.idx > 0 ? l.idx - 1 : l.photos.length - 1 } : l,
                )
              }
              onNext={() =>
                setLightbox((l) =>
                  l ? { ...l, idx: l.idx < l.photos.length - 1 ? l.idx + 1 : 0 } : l,
                )
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </ComercialLayout>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-foreground font-medium mt-0.5 break-words">{value}</p>
    </div>
  );
}

function SignatureBlock({
  label, signature,
}: { label: string; signature: InspectionSignature | undefined }) {
  if (!signature) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground mb-1">{label}</p>
        <p className="text-caption text-muted-foreground italic">Sin firma registrada</p>
      </div>
    );
  }
  const status = signature.signature_status;
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">{label}</p>
        <span className={cn(
          'text-tiny font-semibold px-2 py-0.5 rounded-full',
          status === 'signed' ? 'bg-status-good-bg text-status-good'
            : status === 'refused' ? 'bg-status-bad-bg text-status-bad'
            : 'bg-muted text-muted-foreground',
        )}>
          {status === 'signed' ? 'Firmada' : status === 'refused' ? 'Rehusada' : 'No disponible'}
        </span>
      </div>
      {signature.signer_name && (
        <p className="text-caption text-foreground font-medium">{signature.signer_name}</p>
      )}
      {status === 'signed' && signature.signature_data && (
        <div className="rounded-md border bg-background p-2">
          <img
            src={signature.signature_data}
            alt={`Firma ${label}`}
            className="max-h-32 w-full object-contain"
          />
        </div>
      )}
      {signature.signed_at && (
        <p className="text-tiny text-muted-foreground">Firmada: {formatDateTime(signature.signed_at)}</p>
      )}
      {signature.skip_reason && (
        <p className="text-tiny text-muted-foreground">Motivo: {signature.skip_reason}</p>
      )}
    </div>
  );
}
