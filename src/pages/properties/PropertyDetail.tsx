/**
 * Detalle de un inmueble: datos del inmueble, línea de tiempo de inspecciones
 * y comparación lado a lado entre dos momentos.
 */
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/shared/ui';
import { useAuth } from '@/contexts/AuthContext';
import { listInspectionsByProperty } from '@/modules/properties/api/properties.service';
import { listProfilesByIds } from '@/modules/inspection/api/inspections.service';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import { marketLabel } from '@/lib/markets';
import PropertyTimeline from './PropertyTimeline';
import PropertyComparison from './PropertyComparison';
import RoleLayout from './RoleLayout';
import type { Profile } from '@/lib/types';

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

export default function PropertyDetail() {
  const { propertyId = '' } = useParams();
  const { profile } = useAuth();
  const isExecutive = profile?.role === 'executive';
  const base = isExecutive ? '/executive' : '/admin';
  const inspectionBase = isExecutive ? '/executive/inspection' : '/admin/inspections';

  const { data: inspections, isLoading, error, refetch } = useQuery({
    queryKey: ['properties', 'detail', propertyId],
    queryFn: () => listInspectionsByProperty(propertyId),
    enabled: !!propertyId,
    staleTime: 60_000,
  });

  const personIds = useMemo(() => {
    const ids = new Set<string>();
    for (const i of inspections ?? []) {
      if (i.inspector_id) ids.add(i.inspector_id);
      if (i.executive_id) ids.add(i.executive_id);
    }
    return [...ids];
  }, [inspections]);

  const { data: people } = useQuery({
    queryKey: ['properties', 'people', personIds],
    queryFn: () => listProfilesByIds(personIds),
    enabled: personIds.length > 0,
    staleTime: 300_000,
  });

  const profilesById = useMemo(() => {
    const map: Record<string, Profile> = {};
    for (const p of people ?? []) map[p.id] = p;
    return map;
  }, [people]);

  const latest = inspections?.[0];
  const snapshot = latest ? (getEffectiveSnapshot(latest) as Record<string, unknown>) : {};

  const facts = latest
    ? [
        { label: 'Tipo de propiedad', value: str(latest.property_type) ?? '—' },
        { label: 'Dormitorios', value: str(snapshot.bedrooms_count) ?? '—' },
        { label: 'Baños', value: str(snapshot.bathrooms_count) ?? '—' },
        { label: 'Unidad', value: str(snapshot.unit_number) ?? '—' },
        { label: 'Estacionamiento', value: str(snapshot.parking_number) ?? (snapshot.has_parking ? 'Sí' : '—') },
        { label: 'Bodega', value: str(snapshot.storage_number) ?? (snapshot.has_storage ? 'Sí' : '—') },
        { label: 'Comuna', value: str(snapshot.comuna) ?? '—' },
        { label: 'Mercado', value: marketLabel(latest.market) },
      ]
    : [];

  return (
    <RoleLayout>
      <PageHeader
        title={latest?.property_name ?? latest?.address ?? propertyId}
        description={latest?.address ?? undefined}
        breadcrumb={[{ label: 'Inmuebles', href: `${base}/properties` }, { label: propertyId }]}
      />

      {isLoading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !inspections || inspections.length === 0 ? (
        <EmptyState
          title="Inmueble sin inspecciones"
          description="No encontramos inspecciones asociadas a este inmueble."
          icon={<Building2 className="h-10 w-10 text-primary/60" />}
        />
      ) : (
        <div className="space-y-5">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">{propertyId}</Badge>
                {latest?.address && (
                  <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {latest.address}
                  </span>
                )}
                <span className="text-sm text-muted-foreground ml-auto">
                  {inspections.length} {inspections.length === 1 ? 'inspección' : 'inspecciones'}
                </span>
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                    <dd className="text-sm font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Línea de tiempo</TabsTrigger>
              <TabsTrigger value="compare">Comparar estados</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="mt-4">
              <PropertyTimeline
                inspections={inspections}
                profiles={profilesById}
                basePath={inspectionBase}
              />
            </TabsContent>
            <TabsContent value="compare" className="mt-4">
              <PropertyComparison inspections={inspections} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </RoleLayout>
  );
}
