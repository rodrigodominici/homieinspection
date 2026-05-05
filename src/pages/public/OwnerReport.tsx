/**
 * Audience-aware public report renderer.
 *
 * Despite the historical filename (`OwnerReport.tsx`), this component now
 * renders BOTH the owner and tenant published views from the same shared
 * payload base. Audience selection is resolved server-side by
 * `get_published_report` from the `public_token` and returned in the
 * response as `audience` ('owner' | 'tenant').
 *
 * Filtering contract:
 * - `audience` is the ONLY public-rendering filter applied here.
 *   - owner   → renders both payer groups (propietario + inquilino) with totals.
 *   - tenant  → renders only `payer_role === 'tenant'` items + tenant total.
 * - `visible_to_owner` is an editorial visibility gate applied earlier when
 *   the publish payload was built; it is NOT a payer gate. Both audience
 *   rows share the same already-filtered visible set.
 *
 * Route: `/reportes/:propertyId/:token` (shared between audiences).
 * Responsive: mobile-first; sticky tabs; vertical-on-mobile budget rows.
 */

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Building, Calendar, FileText, DollarSign, User, Users, ImageOff } from 'lucide-react';

type Audience = 'owner' | 'tenant';
type PayerRole = 'owner' | 'tenant';
type PaymentNature = 'required' | 'optional';

interface PayloadRepair {
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  payer_role?: PayerRole;
  payment_nature?: PaymentNature;
}

interface PayloadSection {
  id: string;
  title: string;
  type: string;
  final_observation: string | null;
  photos: { id: string; url: string | null; caption: string | null }[];
  repairs: PayloadRepair[];
}

interface PayloadTaxConfig {
  enabled: boolean;
  percentage: number;
  label: string;
  currency?: string | null;
}

interface ReportPayload {
  property: {
    property_id: string;
    property_name: string | null;
    address: string | null;
    market: string;
    typology?: string | null;
    property_type: string | null;
    inspection_type: string;
  };
  sections: PayloadSection[];
  budget_total: number;
  tax_config?: PayloadTaxConfig | null;
  published_at: string;
  /** Set by `get_published_report` based on which token resolved the row. */
  audience?: Audience;
}

const fmt = (n: number) =>
  `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className ?? ''}`} />;
}

/**
 * Lazy public photo signing.
 *
 * Public reports run as anon, so storage RLS forbids direct `createSignedUrl`.
 * The `sign-public-photo` edge function checks the (token, property_id, photo_id)
 * triple with the service role and returns a 1h signed URL.
 */
function PublicPhoto({
  photoId, propertyId, token, alt, caption,
}: { photoId: string; propertyId: string; token: string; alt: string; caption: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setUrl(null);
    supabase.functions
      .invoke('sign-public-photo', { body: { property_id: propertyId, token, photo_id: photoId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.url) setFailed(true);
        else setUrl(data.url as string);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [photoId, propertyId, token]);

  if (failed) {
    return (
      <div className="aspect-square rounded-xl bg-muted flex flex-col items-center justify-center gap-1 text-muted-foreground">
        <ImageOff className="h-5 w-5" />
        <span className="text-tiny">Foto no disponible</span>
      </div>
    );
  }
  if (!url) return <Shimmer className="aspect-square w-full" />;
  return (
    <img
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      className="aspect-square rounded-xl object-cover w-full"
      loading="lazy" decoding="async" width={400} height={400}
    />
  );
}

/** Flatten section repairs into payer/nature buckets. Defaults legacy items to owner/required. */
function bucketRepairs(sections: PayloadSection[]) {
  const buckets = {
    owner:  { required: [] as PayloadRepair[], optional: [] as PayloadRepair[] },
    tenant: { required: [] as PayloadRepair[], optional: [] as PayloadRepair[] },
  };
  for (const s of sections) {
    for (const r of s.repairs) {
      const payer: PayerRole = r.payer_role === 'tenant' ? 'tenant' : 'owner';
      const nature: PaymentNature = r.payment_nature === 'optional' ? 'optional' : 'required';
      buckets[payer][nature].push(r);
    }
  }
  return buckets;
}

const sumRepairs = (rs: PayloadRepair[]) =>
  rs.reduce((s, r) => s + Number(r.subtotal ?? r.quantity * r.unit_price), 0);

/** Single repair row — vertical on mobile, two-column on sm+. */
function RepairRow({ r }: { r: PayloadRepair }) {
  const subtotal = Number(r.subtotal ?? r.quantity * r.unit_price);
  return (
    <div className="py-3 first:pt-0 last:pb-0 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium leading-snug">{r.name}</p>
        {r.description && (
          <p className="text-caption text-muted-foreground mt-0.5 leading-snug">{r.description}</p>
        )}
        {r.category && (
          <Badge variant="secondary" className="text-tiny mt-1">{r.category}</Badge>
        )}
      </div>
      <div className="sm:text-right shrink-0">
        <p className="text-body font-mono tabular-nums font-medium whitespace-nowrap">{fmt(subtotal)}</p>
        <p className="text-tiny text-muted-foreground font-mono tabular-nums">
          {r.quantity} × {fmt(r.unit_price)} / {r.unit}
        </p>
      </div>
    </div>
  );
}

/** A payer/nature group block. */
function RepairGroup({
  title,
  items,
  variant = 'default',
}: { title: string; items: PayloadRepair[]; variant?: 'default' | 'subtle' }) {
  if (items.length === 0) return null;
  const subtotal = sumRepairs(items);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className={
          variant === 'subtle'
            ? 'text-tiny font-semibold uppercase tracking-wide text-muted-foreground'
            : 'text-caption font-semibold uppercase tracking-wide text-foreground'
        }>{title}</h3>
        <span className="text-caption font-mono tabular-nums font-medium whitespace-nowrap">{fmt(subtotal)}</span>
      </div>
      <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-background/40 px-3 sm:px-4">
        {items.map((r, i) => <RepairRow key={i} r={r} />)}
      </div>
    </div>
  );
}

export default function OwnerReport() {
  const { propertyId, token } = useParams<{ propertyId: string; token: string }>();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data, error: err } = await supabase.rpc('get_published_report', {
        p_property_id: propertyId!,
        p_token: token!,
      });
      if (err || !data) setError(true);
      else setReport(data as unknown as ReportPayload);
      setLoading(false);
    };
    fetch();
  }, [propertyId, token]);

  const audience: Audience = (report?.audience === 'tenant' ? 'tenant' : 'owner');

  const sectionsWithObservations = useMemo(
    () => report?.sections.filter(s => s.final_observation || s.photos.length > 0) ?? [],
    [report]
  );

  const buckets = useMemo(
    () => report ? bucketRepairs(report.sections) : null,
    [report]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
          <Shimmer className="h-12 w-48" />
          <Shimmer className="h-32" />
          <Shimmer className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mx-auto">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-h3">Reporte no encontrado</h1>
          <p className="text-caption text-muted-foreground">El link puede haber expirado o ser inválido.</p>
        </div>
      </div>
    );
  }

  const { property, published_at } = report;
  const ownerTotal  = buckets ? sumRepairs([...buckets.owner.required,  ...buckets.owner.optional])  : 0;
  const tenantTotal = buckets ? sumRepairs([...buckets.tenant.required, ...buckets.tenant.optional]) : 0;
  const grandTotal  = ownerTotal + tenantTotal;

  const audienceLabel = audience === 'owner' ? 'Vista Propietario' : 'Vista Inquilino';
  const AudienceIcon = audience === 'owner' ? User : Users;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header (responsive: stacks on mobile) ─────────── */}
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
                <span className="text-sm font-bold text-primary-foreground">H</span>
              </div>
              <span className="text-body-lg font-semibold text-foreground">Homie Inspection</span>
            </div>
            <Badge variant="secondary" className="self-start sm:self-auto gap-1.5 text-tiny">
              <AudienceIcon className="h-3 w-3" /> {audienceLabel}
            </Badge>
          </div>

          <h1 className="text-h2 mb-2 leading-tight">{property.property_name ?? property.property_id}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-muted-foreground">
            {property.address && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {property.address}</span>
            )}
            {(property.property_type || property.typology) && (
              <span className="inline-flex items-center gap-1">
                <Building className="h-3.5 w-3.5" /> {property.property_type ?? property.typology}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(published_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
      </header>

      {/* ── Content ───────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <Tabs defaultValue="report" className="space-y-5">
          {/* Sticky tabs so they stay reachable while scrolling on mobile */}
          <TabsList className="w-full grid grid-cols-2 sticky top-0 z-10">
            <TabsTrigger value="report" className="gap-1.5">
              <FileText className="h-4 w-4" /> Reporte
            </TabsTrigger>
            <TabsTrigger value="budget" className="gap-1.5">
              <DollarSign className="h-4 w-4" /> Presupuesto
            </TabsTrigger>
          </TabsList>

          {/* ── Report Tab (identical for both audiences) ─── */}
          <TabsContent value="report" className="space-y-4">
            {sectionsWithObservations.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No hay observaciones disponibles.</p>
            ) : (
              sectionsWithObservations.map(section => (
                <Card key={section.id} className="border-0 ring-1 ring-border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-body-lg">{section.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {section.final_observation && (
                      <p className="text-body text-foreground leading-relaxed whitespace-pre-line">
                        {section.final_observation}
                      </p>
                    )}
                    {section.photos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                        {section.photos.map(photo => (
                          <div key={photo.id} className="space-y-1">
                            <PublicPhoto
                              photoId={photo.id}
                              propertyId={propertyId!}
                              token={token!}
                              alt={photo.caption ?? ''}
                              caption={photo.caption}
                            />
                            {photo.caption && <p className="text-tiny text-muted-foreground">{photo.caption}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── Budget Tab (audience-aware) ─────────────── */}
          <TabsContent value="budget" className="space-y-5">
            {!buckets || (audience === 'owner' && grandTotal === 0) ||
             (audience === 'tenant' && tenantTotal === 0) ? (
              <p className="text-center text-muted-foreground py-12">No hay reparaciones presupuestadas.</p>
            ) : audience === 'owner' ? (
              <>
                {/* Owner block */}
                <Card className="border-0 ring-1 ring-border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-body-lg flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" /> Reparaciones a cargo del propietario
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RepairGroup title="Obligatorias" items={buckets.owner.required} />
                    <RepairGroup title="Opcionales"   items={buckets.owner.optional} variant="subtle" />
                    {ownerTotal === 0 && (
                      <p className="text-caption text-muted-foreground">Sin reparaciones asignadas.</p>
                    )}
                    {ownerTotal > 0 && (
                      <div className="flex items-center justify-between border-t pt-3">
                        <span className="text-body font-semibold">Subtotal propietario</span>
                        <span className="text-body font-mono tabular-nums font-semibold">{fmt(ownerTotal)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tenant block */}
                <Card className="border-0 ring-1 ring-border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-body-lg flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" /> Reparaciones a cargo del inquilino
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RepairGroup title="Obligatorias" items={buckets.tenant.required} />
                    <RepairGroup title="Opcionales"   items={buckets.tenant.optional} variant="subtle" />
                    {tenantTotal === 0 && (
                      <p className="text-caption text-muted-foreground">Sin reparaciones asignadas.</p>
                    )}
                    {tenantTotal > 0 && (
                      <div className="flex items-center justify-between border-t pt-3">
                        <span className="text-body font-semibold">Subtotal inquilino</span>
                        <span className="text-body font-mono tabular-nums font-semibold">{fmt(tenantTotal)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Totals summary */}
                <Card className="border-0 ring-1 ring-primary/30 shadow-sm bg-primary-soft">
                  <CardContent className="py-4 sm:py-5 space-y-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-caption text-muted-foreground">Total propietario</span>
                      <span className="text-body font-mono tabular-nums">{fmt(ownerTotal)}</span>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-caption text-muted-foreground">Total inquilino</span>
                      <span className="text-body font-mono tabular-nums">{fmt(tenantTotal)}</span>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-t pt-2">
                      <span className="text-body-lg font-semibold">Total general</span>
                      <span className="text-h3 font-bold font-mono tabular-nums">{fmt(grandTotal)}</span>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                {/* Tenant audience: only tenant items */}
                <Card className="border-0 ring-1 ring-border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-body-lg flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" /> Reparaciones a cargo del inquilino
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RepairGroup title="Obligatorias" items={buckets.tenant.required} />
                    <RepairGroup title="Opcionales"   items={buckets.tenant.optional} variant="subtle" />
                  </CardContent>
                </Card>

                <Card className="border-0 ring-1 ring-primary/30 shadow-sm bg-primary-soft">
                  <CardContent className="py-4 sm:py-5">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-body-lg font-semibold">Total inquilino</span>
                      <span className="text-h3 font-bold font-mono tabular-nums">{fmt(tenantTotal)}</span>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t mt-10 sm:mt-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-6 text-center text-tiny text-muted-foreground">
          <p>Generado por Homie Inspection · {new Date(published_at).toLocaleDateString('es-MX')}</p>
        </div>
      </footer>
    </div>
  );
}
