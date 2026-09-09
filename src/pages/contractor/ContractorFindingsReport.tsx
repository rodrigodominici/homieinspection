import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import ContractorLayout from './ContractorLayout';
import SignedPhotoImg from '@/components/SignedPhotoImg';
import {
  fetchWorkOrderDetail,
  fetchFindingsReport,
  type FindingsReport,
} from '@/modules/work-orders/api/work-orders.service';

/** Etiquetas de contacto que el contratista no debe ver (no tiene trato con inquilino ni propietario). */
const HIDDEN_LABEL_PATTERNS = [
  'correo', 'email', 'mail', 'tel', 'celular', 'whatsapp', 'rut', 'inquilin', 'propietari',
  'arrendatari', 'contacto', 'receptor',
];

function isContactField(label: string): boolean {
  const l = label.toLowerCase();
  return HIDDEN_LABEL_PATTERNS.some((p) => l.includes(p));
}

/** Informe de hallazgos en solo lectura, sin precios ni datos de contacto. */
export default function ContractorFindingsReport() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<FindingsReport | null>(null);
  const [propertyName, setPropertyName] = useState<string>('Informe de hallazgos');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    (async () => {
      try {
        const detail = await fetchWorkOrderDetail(id);
        const r = await fetchFindingsReport(detail.order.inspection_id);
        if (cancelled) return;
        setReport({
          ...r,
          sections: r.sections.map((sec) => ({
            ...sec,
            fields: sec.fields.filter((f) => !isContactField(f.field_label)),
          })),
        });
        setPropertyName(detail.inspection?.address || detail.inspection?.property_id || '');
      } catch {
        if (!cancelled) toast.error('No pudimos abrir el informe');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <ContractorLayout
      title="Informe de hallazgos"
      subtitle={propertyName}
      backTo={`/contratista/orden/${id}`}
    >
      {loading ? (
        <>
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </>
      ) : !report ? (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">No hay informe disponible.</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Trabajos solicitados
              </p>
              {report.repairs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin trabajos cargados.</p>
              ) : (
                <ul className="space-y-2">
                  {report.repairs.map((r) => (
                    <li key={r.id} className="rounded-lg border p-3 space-y-1">
                      <p className="text-sm font-medium leading-snug">{r.title_snapshot}</p>
                      {r.description_snapshot && (
                        <p className="text-xs text-muted-foreground">{r.description_snapshot}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Cantidad: {r.quantity} {r.unit}
                        {r.category_snapshot ? ` · ${r.category_snapshot}` : ''}
                      </p>
                      {r.notes && <p className="text-[11px] text-muted-foreground">Nota: {r.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {report.sections.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-semibold">{s.section_title}</p>
                {s.final_observation && (
                  <p className="text-xs text-muted-foreground whitespace-pre-line">{s.final_observation}</p>
                )}
                {s.fields.length > 0 && (
                  <dl className="space-y-1">
                    {s.fields.map((f) => (
                      <div key={f.id} className="flex gap-2 text-xs">
                        <dt className="text-muted-foreground shrink-0 max-w-[55%]">{f.field_label}</dt>
                        <dd className="ml-auto text-right font-medium">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {s.photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {s.photos.map((p) => (
                      <SignedPhotoImg
                        key={p.id}
                        url=""
                        storagePath={p.storage_path}
                        alt={p.caption ?? `Foto de ${s.section_title}`}
                        loading="lazy"
                        className="aspect-square w-full rounded-lg object-cover bg-muted"
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </ContractorLayout>
  );
}
