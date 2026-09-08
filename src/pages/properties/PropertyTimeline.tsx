/**
 * Línea de tiempo del inmueble: cada inspección como un hito, del evento más
 * reciente al más antiguo.
 */
import { Link } from 'react-router-dom';
import { ExternalLink, User, UserCog } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import InspectionTypeChip from '@/components/inspector/InspectionTypeChip';
import { propertyEventDate } from '@/modules/properties/api/properties.service';
import { getContractDateShortLabel } from '@/lib/inspection-type-labels';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import type { Inspection, Profile } from '@/lib/types';

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

interface Props {
  inspections: Inspection[];
  profiles: Record<string, Profile>;
  basePath: string;
}

export function PropertyTimeline({ inspections, profiles, basePath }: Props) {
  return (
    <ol className="relative border-l border-border ml-3 space-y-4">
      {inspections.map((i) => {
        const snap = getEffectiveSnapshot(i) as Record<string, unknown>;
        const contractDate = snap?.fecha_de_termino_real_de_contrato as string | undefined;
        return (
          <li key={i.id} className="ml-5">
            <span className="absolute -left-[7px] mt-4 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <InspectionTypeChip type={i.inspection_type} size="sm" />
                  <InspectionStatusBadge status={i.status} />
                  <span className="text-sm text-muted-foreground">
                    {fmt(propertyEventDate(i))}
                  </span>
                  <Link
                    to={`${basePath}/${i.id}`}
                    className="ml-auto inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Abrir <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <dl className="grid sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                  <Row label="Recepción" value={fmt(i.scheduled_at)} />
                  <Row label={getContractDateShortLabel(i.inspection_type)} value={fmt(contractDate)} />
                  <Row label="Publicada" value={fmt(i.published_at)} />
                </dl>

                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {i.inspector_id ? profiles[i.inspector_id]?.full_name ?? '—' : 'Sin receptor'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <UserCog className="h-3 w-3" />
                    {i.executive_id ? profiles[i.executive_id]?.full_name ?? '—' : 'Sin ejecutivo'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export default PropertyTimeline;
