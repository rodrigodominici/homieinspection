import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { SectionStatusBadge } from '@/components/StatusBadge';
import {
  MapPin, Clock, Wrench, PenLine, XCircle, AlertTriangle,
  RotateCcw, Send, RefreshCw, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCurrency, statusLabel } from './helpers';
import type { InspectionSection } from '@/lib/types';

interface MobileReviewViewProps {
  inspection: any;
  operationalSections: InspectionSection[];
  fieldsBySection: Record<string, any[]>;
  photosBySection: Record<string, any[]>;
  repairsBySection: Record<string, any[]>;
  finalObservations: Record<string, string>;
  setFinalObservations: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saveFinalObservationSilent: (sectionId: string, value: string) => Promise<void>;
  urlOf: (id: string) => string | undefined;
  signatureRecord: any | null;
  allRepairs: any[];
  clientTotal: number;
  warrantyDeposit: number | null;
  inspectorProgressLabel: string;
  progress: { completed: number; total: number };
  submitting: boolean;
  returnMode: boolean;
  setReturnMode: (v: boolean) => void;
  onOpenCatalog: (sectionId: string) => void;
  onOpenRepairsDrawer: (sectionId: string) => void;
  onPublish: () => void;
}

export function MobileReviewView({
  inspection, operationalSections, fieldsBySection, photosBySection, repairsBySection,
  finalObservations, setFinalObservations, saveFinalObservationSilent, urlOf,
  signatureRecord, allRepairs, clientTotal, warrantyDeposit, inspectorProgressLabel,
  progress, submitting, returnMode, setReturnMode, onOpenCatalog, onOpenRepairsDrawer,
  onPublish,
}: MobileReviewViewProps) {
  return (
    <div className="lg:hidden pb-24">
      <div className="px-4 py-4 space-y-4">
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-caption">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{inspection.address}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-caption">
              <div>
                <span className="text-muted-foreground">Depósito:</span>{' '}
                <span className="font-mono">{warrantyDeposit !== null ? fmtCurrency(warrantyDeposit) : '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Presupuesto:</span>{' '}
                <span className="font-mono">{fmtCurrency(clientTotal)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-tiny text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{inspectorProgressLabel} · {progress.completed}/{progress.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <div className={cn(
              'flex items-center justify-center h-8 w-8 rounded-md shrink-0',
              allRepairs.length > 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              <Wrench className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-caption font-medium">
                Presupuesto
                {allRepairs.length > 0 && (
                  <span className="ml-1.5 text-tiny font-normal text-muted-foreground">· {allRepairs.length}</span>
                )}
              </p>
              <p className="text-tiny text-muted-foreground truncate">
                {allRepairs.length === 0
                  ? 'Aún no se han agregado reparaciones.'
                  : `Total cliente ${fmtCurrency(clientTotal)}`}
              </p>
            </div>
            {allRepairs.length > 0 && (() => {
              const firstWith = operationalSections.find(s => (repairsBySection[s.id] ?? []).length > 0);
              if (!firstWith) return null;
              return (
                <Button size="sm" variant="outline" className="shrink-0 h-8 text-tiny"
                  onClick={() => onOpenRepairsDrawer(firstWith.id)}>
                  Ver
                </Button>
              );
            })()}
          </CardContent>
        </Card>

        {signatureRecord && (
          <Card className="border-0 ring-1 ring-border shadow-sm">
            <CardContent className="p-3 flex items-center gap-2 text-caption">
              {signatureRecord.signature_status === 'signed' ? <PenLine className="h-4 w-4 text-[hsl(var(--status-good))]" /> :
                signatureRecord.signature_status === 'refused' ? <XCircle className="h-4 w-4 text-[hsl(var(--status-bad))]" /> :
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-regular))]" />}
              <span>Firma: {signatureRecord.signature_status === 'signed' ? `Firmado${signatureRecord.signer_name ? ` - ${signatureRecord.signer_name}` : ''}` :
                signatureRecord.signature_status === 'refused' ? 'Rechazada' : 'No disponible'}</span>
            </CardContent>
          </Card>
        )}

        {operationalSections.map((section) => {
          const sFields = fieldsBySection[section.id] ?? [];
          const sPhotos = photosBySection[section.id] ?? [];
          const sRepairs = repairsBySection[section.id] ?? [];
          const inspectorObs = sFields.find(f => f.group_key === 'observation')?.value_text ?? '';
          return (
            <Card key={section.id} className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-body-lg">{section.section_title}</CardTitle>
                  <SectionStatusBadge status={section.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {sFields.filter(f => f.group_key === 'status').map(f => {
                  const label = statusLabel(f.value_text);
                  return (
                    <div key={f.id} className="flex justify-between text-caption">
                      <span className="text-muted-foreground">{f.field_label}</span>
                      {label && <span className={label.cls}>{label.text}</span>}
                    </div>
                  );
                })}
                {inspectorObs && (
                  <div className="bg-accent/30 rounded-lg p-3">
                    <p className="text-tiny font-medium text-muted-foreground mb-1">Inspector</p>
                    <p className="text-caption">{inspectorObs}</p>
                  </div>
                )}
                <div>
                  <p className="text-tiny font-medium text-muted-foreground mb-1">Observación final</p>
                  <Textarea value={finalObservations[section.id] ?? ''} rows={2} className="text-caption"
                    onChange={(e) => setFinalObservations(p => ({ ...p, [section.id]: e.target.value }))}
                    onBlur={(e) => saveFinalObservationSilent(section.id, e.target.value)} />
                </div>
                {sPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-1">
                    {sPhotos.map(p => (
                      <img key={p.id} src={urlOf(p.id)} className="aspect-square rounded object-cover w-full" />
                    ))}
                  </div>
                )}
                {(() => {
                  const sSubtotal = sRepairs.filter(r => r.visible_to_owner).reduce((s, r) => s + r.quantity * r.unit_price, 0);
                  return (
                    <div className="rounded-lg border border-border bg-card overflow-hidden">
                      <div className="flex flex-col gap-2 px-3 py-2 border-b border-border/60 bg-muted/30">
                        <div className="flex items-center gap-2 min-w-0">
                          <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <p className="text-caption font-semibold leading-tight">Reparaciones de esta sección</p>
                        </div>
                        <p className="text-tiny text-muted-foreground leading-tight">
                          {sRepairs.length} {sRepairs.length === 1 ? 'reparación' : 'reparaciones'}
                          {sRepairs.length > 0 && (
                            <> · Subtotal <span className="font-mono">{fmtCurrency(sSubtotal)}</span></>
                          )}
                        </p>
                        <Button size="sm" onClick={() => onOpenCatalog(section.id)} className="w-full h-8 text-tiny">
                          <Plus className="mr-1 h-3.5 w-3.5" /> Agregar reparación
                        </Button>
                      </div>
                      {sRepairs.length === 0 ? (
                        <p className="text-tiny text-muted-foreground italic px-3 py-2">
                          Sin reparaciones. Agrega desde el catálogo.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border/60">
                          {sRepairs.map(r => (
                            <li key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-caption">
                              <span className="flex-1 min-w-0 truncate">{r.title_snapshot}</span>
                              <span className="font-mono shrink-0">{fmtCurrency(r.quantity * r.unit_price)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {['in_review', 'approved', 'published', 'sent'].includes(inspection.status) && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t">
          <div className="flex gap-2">
            {inspection.status === 'in_review' && (
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setReturnMode(!returnMode)}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Devolver
              </Button>
            )}
            {inspection.status === 'approved' && (
              <Button size="sm" className="flex-1" onClick={onPublish} disabled={submitting}>
                <Send className="mr-1 h-3.5 w-3.5" /> Publicar
              </Button>
            )}
            {(inspection.status === 'published' || inspection.status === 'sent') && (
              <Button size="sm" variant="outline" className="flex-1" onClick={onPublish} disabled={submitting}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Republicar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
