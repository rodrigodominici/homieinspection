/**
 * Listado de inmuebles: una fila por `property_id`, con el histórico de
 * inspecciones (check-out, captación, check-in) asociado a cada uno.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Search, MapPin, ArrowRight, Globe, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, FiltersBar, EmptyState, LoadingState, ErrorState } from '@/shared/ui';
import InspectionTypeChip from '@/components/inspector/InspectionTypeChip';
import { marketLabel, normalizeMarket, MARKET_OPTIONS } from '@/lib/markets';
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
  const [market, setMarket] = useState<string>('all');
  const [types, setTypes] = useState<CanonicalInspectionType[]>([]);
  const { profile } = useAuth();
  const base = profile?.role === 'executive' ? '/executive' : '/admin';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['properties', 'all'],
    queryFn: listPropertyInspections,
    staleTime: 60_000,
  });

  const properties = useMemo(() => groupByProperty(data ?? []), [data]);

  const markets = useMemo(() => {
    const set = new Set<string>();
    for (const p of properties) {
      const m = normalizeMarket(p.market);
      if (m) set.add(m);
    }
    const known = MARKET_OPTIONS.map((m) => m.value as string).filter((m) => set.has(m));
    const extra = [...set].filter((m) => !known.includes(m)).sort();
    return [...known, ...extra];
  }, [properties]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return properties.filter((p) => {
      if (market !== 'all' && normalizeMarket(p.market) !== market) return false;
      if (types.some((t) => p.countsByType[t] === 0)) return false;
      if (q && !p.inspections.some((i) => matchesInspectionQuery(buildInspectionHaystack(i), q)))
        return false;
      return true;
    });
  }, [properties, query, market, types]);

  const totals = useMemo(() => {
    let checkIn = 0, checkOut = 0, captacion = 0;
    for (const p of filtered) {
      checkIn += p.countsByType.check_in;
      checkOut += p.countsByType.check_out;
      captacion += p.countsByType.captacion;
    }
    return { checkIn, checkOut, captacion };
  }, [filtered]);

  const hasFilters = market !== 'all' || types.length > 0 || query.trim() !== '';

  return (
    <RoleLayout>
      <PageHeader
        title="Inmuebles"
        description="Historial completo por inmueble: captación, check-in y check-out en un mismo lugar."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
          <Stat label="Inmuebles" value={filtered.length} />
          <span className="hidden h-8 w-px bg-border sm:block" />
          <Stat label="Captaciones" value={totals.captacion} />
          <Stat label="Check-in" value={totals.checkIn} />
          <Stat label="Check-out" value={totals.checkOut} />
        </CardContent>
      </Card>

      <FiltersBar>
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por dirección, nombre o ID de inmueble"
            className="pl-9"
          />
        </div>

        <Select value={market} onValueChange={setMarket}>
          <SelectTrigger className="w-[170px]">
            <Globe className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="País" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los países</SelectItem>
            {markets.map((m) => (
              <SelectItem key={m} value={m}>{marketLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ToggleGroup
          type="multiple"
          value={types}
          onValueChange={(v) => setTypes(v as CanonicalInspectionType[])}
          className="flex-wrap"
        >
          {TYPE_FILTERS.map((t) => (
            <ToggleGroupItem key={t.value} value={t.value} size="sm" className="text-xs">
              Con {t.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <span className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'inmueble' : 'inmuebles'}
        </span>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setQuery(''); setMarket('all'); setTypes([]); }}
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
        <div className="space-y-2">
          {filtered.map((p) => (
            <Card key={p.property_id} className="transition-colors hover:border-primary/40">
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">
                      {p.property_name ?? p.address ?? p.property_id}
                    </p>
                    <Badge variant="outline" className="font-mono text-[10px]">{p.property_id}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{marketLabel(p.market)}</Badge>
                  </div>
                  {p.address && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> {p.address}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {TYPE_FILTERS.map((t) =>
                    p.countsByType[t.value] > 0 ? (
                      <TypeCount key={t.value} type={t.value} count={p.countsByType[t.value]} />
                    ) : null,
                  )}
                </div>

                <Link
                  to={`${base}/properties/${encodeURIComponent(p.property_id)}`}
                  className="inline-flex shrink-0 items-center gap-1 text-sm text-primary hover:underline"
                >
                  Ver historial <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </RoleLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function TypeCount({ type, count }: { type: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <InspectionTypeChip type={type} size="xs" />
      <span className="text-xs tabular-nums text-muted-foreground">×{count}</span>
    </span>
  );
}
