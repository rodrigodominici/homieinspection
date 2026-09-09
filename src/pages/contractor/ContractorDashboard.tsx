import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { MapPin, ArrowRight, Hammer } from 'lucide-react';
import ContractorLayout from './ContractorLayout';
import { fetchMyWorkOrders, type WorkOrderListRow } from '@/modules/work-orders/api/work-orders.service';
import { workOrderStatusLabel, workOrderStatusToneClass } from '@/lib/work-order-status';
import { marketLabel } from '@/lib/markets';
import { useAuth } from '@/contexts/AuthContext';

const ACTIVE = new Set(['open', 'in_progress', 'rejected', 'in_review']);

interface Props {
  /** `done` muestra las órdenes ya aprobadas. */
  view?: 'active' | 'done';
}

export default function ContractorDashboard({ view = 'active' }: Props) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<WorkOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMyWorkOrders()
      .then((r) => { if (!cancelled) { setRows(r); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(
    () => rows.filter((r) => (view === 'done' ? r.status === 'approved' : ACTIVE.has(r.status))),
    [rows, view],
  );

  return (
    <ContractorLayout
      title={view === 'done' ? 'Trabajos terminados' : 'Mis trabajos'}
      subtitle={profile?.full_name ?? undefined}
    >
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : error ? (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">No pudimos cargar tus trabajos. Volvé a intentar en unos segundos.</CardContent></Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <Hammer className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {view === 'done' ? 'Todavía no tenés trabajos aprobados.' : 'No tenés trabajos asignados por ahora.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => {
            const pct = row.total_items > 0 ? Math.round((row.done_items / row.total_items) * 100) : 0;
            const name = row.inspection?.property_name || row.inspection?.address || row.inspection?.property_id || 'Inmueble';
            return (
              <Link key={row.id} to={`/contratista/orden/${row.id}`}>
                <Card className="active:scale-[0.99] transition-transform">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {row.inspection?.address || '—'}
                        </p>
                      </div>
                      <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${workOrderStatusToneClass(row.status)}`}>
                        {workOrderStatusLabel(row.status)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{row.done_items} de {row.total_items} reparaciones</span>
                        <span>{row.inspection ? marketLabel(row.inspection.market) : ''}</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                    {row.status === 'rejected' && row.review_note && (
                      <p className="text-xs text-[hsl(var(--status-needs-changes-fg))]">Devuelta: {row.review_note}</p>
                    )}
                    <div className="flex items-center justify-end text-xs font-medium text-primary">
                      Abrir <ArrowRight className="h-3 w-3 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </ContractorLayout>
  );
}
