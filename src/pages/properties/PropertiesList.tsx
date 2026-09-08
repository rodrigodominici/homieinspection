/**
 * Listado de inmuebles: una fila por `property_id`, con el histórico de
 * inspecciones (check-out, captación, check-in) asociado a cada uno.
 * El país se toma del selector global de la app (MarketContext).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Search, MapPin, ArrowRight, X, ClipboardList } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PageHeader, FiltersBar, EmptyState, LoadingState, ErrorState, KpiCard } from '@/shared/ui';
import InspectionTypeChip from '@/components/inspector/InspectionTypeChip';
import { marketLabel } from '@/lib/markets';
import { useMarket } from '@/contexts/MarketContext';
import { groupByProperty, listPropertyInspections } from '@/modules/properties/api/properties.service';
import { buildInspectionHaystack, matchesInspectionQuery } from '@/lib/inspection-search';
import RoleLayout from './RoleLayout';
import { useAuth } from '@/contexts/AuthContext';
import type { CanonicalInspectionType } from '@/lib/inspection-type-labels';

const TYPE_FILTERS: { value: CanonicalInspectionType; label: string }[] = [
  { value: 'captacion', label: 'Captación' },
  { value: 'check_in', label: 'Check-in' },
  { value: 'check_out', label: 'Check-out' },
];

export default function PropertiesList() {
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<CanonicalInspectionType[]>([]);
  const { profile } = useAuth();
  const { matchesMarket, showMarketTag } = useMarket();
  const base = profile?.role === 'executive' ? '/executive' : '/admin';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['properties', 'all'],
    queryFn: listPropertyInspections,
    staleTime: 60_000,
  });

  const properties = useMemo(() => groupByProperty(data ?? []), [data]);

  const scoped = useMemo(
    () => properties.filter((p) => matchesMarket(p.market)),
    [properties, matchesMarket],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    return scoped.filter((p) => {
      if (types.some((t) => p.countsByType[t] === 0)) return false;
      if (q && !p.inspections.some((i) => matchesInspectionQuery(buildInspectionHaystack(i), q)))
        return false;
      return true;
    });
  }, [scoped, query, types]);

  const totals = useMemo(() => {
    let checkIn = 0, checkOut = 0, captacion = 0;
    for (const p of filtered) {
      checkIn += p.countsByType.check_in;
      checkOut += p.countsByType.check_out;
      captacion += p.countsByType.captacion;
    }
    return { checkIn, checkOut, captacion };
  }, [filtered]);

  const hasFilters = types.length > 0 || query.trim() !== '';

  return (
    <RoleLayout>
      <div className="p-6 max-w-7xl space-y-6">
        <PageHeader
          title="Inmuebles"
          description="Historial completo por inmueble: captación, check-in y check-out en un mismo lugar."
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Inmuebles"
            value={filtered.length}
            icon={<Building2 className="h-5 w-5 text-muted-foreground" />}
            accent="blue"
            tooltip="Inmuebles que cumplen los filtros actuales."
          />
          <KpiCard
            label="Captaciones"
            value={totals.captacion}
            icon={<ClipboardList className="h-5 w-5 text-muted-foreground" />}
          />
          <KpiCard
            label="Check-in"
            value={totals.checkIn}
            icon={<ClipboardList className="h-5 w-5 text-muted-foreground" />}
          />
          <KpiCard
            label="Check-out"
            value={totals.checkOut}
            icon={<ClipboardList className="h-5 w-5 text-muted-foreground" />}
          />
        </div>

        <FiltersBar>
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Dirección, nombre o ID de inmueble…"
              className="pl-9 h-9 rounded-lg bg-card"
            />
          </div>

          <ToggleGroup
            type="multiple"
            variant="outline"
            value={types}
            onValueChange={(v) => setTypes(v as CanonicalInspectionType[])}
            className="flex-wrap gap-1"
          >
            {TYPE_FILTERS.map((t) => (
              <ToggleGroupItem
                key={t.value}
                value={t.value}
                className="h-9 rounded-lg bg-card px-3 text-caption data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              >
                Con {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <span className="text-caption text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'inmueble' : 'inmuebles'}
          </span>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => { setQuery(''); setTypes([]); }}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Limpiar
            </Button>
          )}
        </FiltersBar>

        {isLoading ? (
          <LoadingState rows={6} />
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Sin inmuebles"
            description="No hay inmuebles que coincidan con los filtros aplicados."
            icon={<Building2 className="h-10 w-10 text-primary/60" />}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => (
              <Card key={p.property_id} className="transition-colors hover:border-primary/40">
                <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-foreground">
                        {p.property_name ?? p.address ?? p.property_id}
                      </p>
                      <Badge variant="outline" className="font-mono text-tiny">{p.property_id}</Badge>
                      {showMarketTag && (
                        <Badge variant="secondary" className="text-tiny">{marketLabel(p.market)}</Badge>
                      )}
                    </div>
                    {p.address && (
                      <p className="flex items-center gap-1 truncate text-caption text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> {p.address}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {TYPE_FILTERS.map((t) =>
                      p.countsByType[t.value] > 0 ? (
                        <TypeCount key={t.value} type={t.value} count={p.countsByType[t.value]} />
                      ) : null,
                    )}
                  </div>

                  <Link
                    to={`${base}/properties/${encodeURIComponent(p.property_id)}`}
                    className="inline-flex shrink-0 items-center gap-1 text-caption font-medium text-primary hover:underline"
                  >
                    Ver historial <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </RoleLayout>
  );
}

function TypeCount({ type, count }: { type: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <InspectionTypeChip type={type} size="xs" />
      <span className="text-caption tabular-nums text-muted-foreground">×{count}</span>
    </span>
  );
}
