import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { INSPECTION_LIST_COLUMNS } from '@/lib/inspection-columns';
import type { Inspection, Profile } from '@/lib/types';
import ComercialLayout from './ComercialLayout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, FileText, ChevronRight } from 'lucide-react';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import { buildInspectionHaystack, matchesInspectionQuery } from '@/lib/inspection-search';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import InspectionTypeChip from '@/components/inspector/InspectionTypeChip';
import { cn } from '@/lib/utils';

const VISIBLE_STATUSES = ['submitted', 'in_review', 'approved', 'published', 'accepted', 'sent'] as const;

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'submitted', label: 'Enviada' },
  { value: 'in_review', label: 'En revisión' },
  { value: 'approved', label: 'Aprobada' },
  { value: 'published', label: 'Publicada' },
  { value: 'accepted', label: 'Aceptada' },
];

const MARKET_OPTIONS = [
  { value: 'all', label: 'Todos los mercados' },
  { value: 'CL', label: 'Chile' },
  { value: 'MX', label: 'México' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'check_out', label: 'Check-out' },
  { value: 'captacion', label: 'Captación' },
];

async function fetchComercialInspections(): Promise<Inspection[]> {
  const { data, error } = await supabase
    .from('inspections')
    .select(INSPECTION_LIST_COLUMNS)
    .in('inspection_type', ['check_out', 'captacion'])
    .in('status', VISIBLE_STATUSES as unknown as string[])
    .order('inspection_completed_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Inspection[];
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

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function ComercialCheckOutList() {
  const { data: inspections, isLoading, error } = useQuery({
    queryKey: ['comercial', 'check-outs'],
    queryFn: fetchComercialInspections,
    staleTime: 60_000,
  });

  const profileIds = useMemo(() => {
    const ids = new Set<string>();
    (inspections ?? []).forEach((i) => {
      if (i.inspector_id) ids.add(i.inspector_id);
      if (i.executive_id) ids.add(i.executive_id);
    });
    return Array.from(ids);
  }, [inspections]);

  const { data: profiles } = useQuery({
    queryKey: ['comercial', 'profiles', profileIds.slice().sort().join(',')],
    queryFn: () => fetchProfilesByIds(profileIds),
    enabled: profileIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>();
    (profiles ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [market, setMarket] = useState<string>('all');
  const [type, setType] = useState<string>('all');

  const rows = useMemo(() => {
    const list = inspections ?? [];
    return list.filter((i) => {
      if (status !== 'all' && i.status !== status) return false;
      if (market !== 'all' && i.market !== market) return false;
      if (type !== 'all' && i.inspection_type !== type) return false;
      if (query.trim()) {
        const inspectorName = i.inspector_id ? profileMap.get(i.inspector_id)?.full_name ?? null : null;
        const executiveName = i.executive_id ? profileMap.get(i.executive_id)?.full_name ?? null : null;
        const hay = buildInspectionHaystack(i, { inspectorName, executiveName });
        if (!matchesInspectionQuery(hay, query)) return false;
      }
      return true;
    });
  }, [inspections, status, market, type, query, profileMap]);

  return (
    <ComercialLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-h2">Inspecciones</h1>
            <p className="text-caption text-muted-foreground mt-1">
              Consulta y descarga de check-outs y captaciones ejecutadas por el equipo de operaciones.
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por dirección, propiedad, inspector, ejecutivo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={market} onValueChange={setMarket}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MARKET_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estados */}
        {error && (
          <Card className="p-6 border-destructive/40">
            <p className="text-caption text-destructive">
              No se pudieron cargar las inspecciones. Intenta recargar la página.
            </p>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <Card className="p-10 text-center">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Sin inspecciones para mostrar</p>
            <p className="text-caption text-muted-foreground mt-1">
              Ajusta los filtros o vuelve más tarde.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Propiedad</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Estado</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Inspección</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Ejecutivo</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Inspector</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const snap = getEffectiveSnapshot(i) ?? {};
                    const address = (snap.address as string | undefined)
                      ?? i.address
                      ?? i.property_name
                      ?? '—';
                    const unit = (snap.unit_number as string | undefined) ?? null;
                    const executive = i.executive_id ? profileMap.get(i.executive_id) : null;
                    const inspector = i.inspector_id ? profileMap.get(i.inspector_id) : null;
                    return (
                      <tr key={i.id} className={cn(
                        "border-b last:border-0 hover:bg-muted/20 transition-colors",
                      )}>
                        <td className="py-3 px-4">
                          <Link to={`/comercial/check-out/${i.id}`} className="block">
                            <p className="font-medium leading-tight">{address}</p>
                            {unit && (
                              <p className="text-tiny text-muted-foreground mt-0.5">Unidad {unit}</p>
                            )}
                          </Link>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <InspectionTypeChip type={i.inspection_type} />
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <InspectionStatusBadge status={i.status} />
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-caption">
                          {formatDateTime(i.inspection_completed_at ?? i.completed_at ?? i.updated_at)}
                        </td>
                        <td className="py-3 px-4 text-caption">
                          {executive?.full_name ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3 px-4 text-caption">
                          {inspector?.full_name ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            to={`/comercial/check-out/${i.id}`}
                            className="inline-flex items-center gap-1 text-primary text-caption font-medium hover:underline"
                          >
                            Ver
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <p className="text-tiny text-muted-foreground text-center pt-2">
          {rows.length} de {(inspections ?? []).length} inspecciones
        </p>
      </div>
    </ComercialLayout>
  );
}
