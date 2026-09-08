/**
 * Listado de inmuebles: una fila por `property_id`, con el histórico de
 * inspecciones (check-out, captación, check-in) asociado a cada uno.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Search, MapPin, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader, FiltersBar, EmptyState, LoadingState, ErrorState, KpiCard } from '@/shared/ui';
import InspectionTypeChip from '@/components/inspector/InspectionTypeChip';
import { marketLabel } from '@/lib/markets';
import { groupByProperty, listPropertyInspections } from '@/modules/properties/api/properties.service';
import { buildInspectionHaystack, matchesInspectionQuery } from '@/lib/inspection-search';
import RoleLayout from './RoleLayout';

export default function PropertiesList() {
  const [query, setQuery] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['properties', 'all'],
    queryFn: listPropertyInspections,
    staleTime: 60_000,
  });

  const properties = useMemo(() => groupByProperty(data ?? []), [data]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return properties;
    return properties.filter((p) =>
      p.inspections.some((i) => matchesInspectionQuery(buildInspectionHaystack(i), q)),
    );
  }, [properties, query]);

  const totals = useMemo(() => {
    let checkIn = 0, checkOut = 0, captacion = 0;
    for (const p of properties) {
      checkIn += p.countsByType.check_in;
      checkOut += p.countsByType.check_out;
      captacion += p.countsByType.captacion;
    }
    return { checkIn, checkOut, captacion };
  }, [properties]);

  return (
    <RoleLayout>
      <PageHeader
        title="Inmuebles"
        description="Historial completo por inmueble: captación, check-in y check-out en un mismo lugar."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Inmuebles" value={properties.length} icon={Building2} />
        <KpiCard label="Captaciones" value={totals.captacion} />
        <KpiCard label="Check-in" value={totals.checkIn} />
        <KpiCard label="Check-out" value={totals.checkOut} />
      </div>

      <FiltersBar>
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por dirección, nombre o ID de inmueble"
            className="pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'inmueble' : 'inmuebles'}
        </span>
      </FiltersBar>

      {isLoading ? (
        <LoadingState rows={6} />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Sin inmuebles"
          description="No hay inmuebles que coincidan con la búsqueda."
          icon={<Building2 className="h-10 w-10 text-primary/60" />}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <Card key={p.property_id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4 flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">
                      {p.property_name ?? p.address ?? p.property_id}
                    </p>
                    <Badge variant="outline" className="font-mono text-[10px]">{p.property_id}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{marketLabel(p.market)}</Badge>
                  </div>
                  {p.address && (
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> {p.address}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {p.countsByType.captacion > 0 && (
                      <TypeCount type="captacion" count={p.countsByType.captacion} />
                    )}
                    {p.countsByType.check_in > 0 && (
                      <TypeCount type="check_in" count={p.countsByType.check_in} />
                    )}
                    {p.countsByType.check_out > 0 && (
                      <TypeCount type="check_out" count={p.countsByType.check_out} />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Inspecciones</p>
                    <p className="text-lg font-semibold tabular-nums">{p.inspections.length}</p>
                  </div>
                  <Link
                    to={`properties/${encodeURIComponent(p.property_id)}`.replace(/^/, './')}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Ver historial <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </RoleLayout>
  );
}

function TypeCount({ type, count }: { type: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <InspectionTypeChip type={type} size="xs" />
      <span className="text-xs text-muted-foreground tabular-nums">×{count}</span>
    </span>
  );
}
