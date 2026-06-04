import { Button } from '@/components/ui/button';
import { FileText, Download, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCurrency } from './helpers';

interface QuotationViewProps {
  budgetBreakdown: {
    ownerRequired: number; ownerOptional: number; ownerTotal: number;
    tenantRequired: number; tenantOptional: number; tenantTotal: number;
    grandTotal: number;
  };
  clientTotal: number;
  contractorTotal: number;
  utility: number;
  warrantyDeposit: number | null;
  depositDiff: number | null;
  hasRepairs: boolean;
  onOpenQuotation: (payer: 'owner' | 'tenant') => void;
  onOpenInternalReport: () => void;
  onGoToRepairs: () => void;
  onGoToPublish: () => void;
}

export function QuotationView({
  budgetBreakdown, clientTotal, contractorTotal, utility,
  warrantyDeposit, depositDiff, hasRepairs,
  onOpenQuotation, onOpenInternalReport, onGoToRepairs, onGoToPublish,
}: QuotationViewProps) {
  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-h3 font-semibold tracking-tight">Cotización</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Revisa los totales por responsable antes de publicar. Genera las cotizaciones de propietario e inquilino o descarga el informe interno.
        </p>
      </div>

      {!hasRepairs && (
        <div className="rounded-lg border border-[hsl(var(--status-regular))]/30 bg-[hsl(var(--status-regular))]/8 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-regular))]" />
          <p className="text-sm flex-1">No hay reparaciones cargadas todavía.</p>
          <Button size="sm" variant="outline" onClick={onGoToRepairs}>Ir a Reparaciones</Button>
        </div>
      )}

      {/* Side-by-side: owner vs tenant */}
      <div className="grid md:grid-cols-2 gap-4">
        <PayerCard
          title="Propietario"
          required={budgetBreakdown.ownerRequired}
          optional={budgetBreakdown.ownerOptional}
          total={budgetBreakdown.ownerTotal}
          onGenerate={() => onOpenQuotation('owner')}
          generateLabel="Generar cotización propietario"
          accent="primary"
        />
        <PayerCard
          title="Inquilino"
          required={budgetBreakdown.tenantRequired}
          optional={budgetBreakdown.tenantOptional}
          total={budgetBreakdown.tenantTotal}
          onGenerate={() => onOpenQuotation('tenant')}
          generateLabel="Generar cotización inquilino"
          accent="muted"
        />
      </div>

      {/* Deposit reconciliation */}
      {warrantyDeposit !== null && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            Conciliación con depósito de garantía
          </p>
          <div className="flex items-center justify-between text-sm">
            <span>Depósito de garantía</span>
            <span className="font-mono">{fmtCurrency(warrantyDeposit)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Propietario obligatorio</span>
            <span className="font-mono">{fmtCurrency(budgetBreakdown.ownerRequired)}</span>
          </div>
          {depositDiff !== null && (
            <div className="flex items-center justify-between text-sm pt-2 border-t border-border/60">
              <span className="font-medium">Diferencia</span>
              <span className={cn(
                'font-mono font-semibold',
                depositDiff >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]',
              )}>
                {depositDiff >= 0 ? '+' : ''}{fmtCurrency(depositDiff)}
                {depositDiff >= 0 ? ' (cubre)' : ' (excede)'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Internal totals */}
      <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          Solo equipo
        </p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Precio cliente</p>
            <p className="font-mono font-semibold">{fmtCurrency(clientTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Costo contratista</p>
            <p className="font-mono font-semibold text-muted-foreground">{fmtCurrency(contractorTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Utilidad</p>
            <p className={cn(
              'font-mono font-semibold',
              utility >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]',
            )}>
              {fmtCurrency(utility)}
            </p>
          </div>
        </div>
        <div className="pt-2 border-t border-border/60">
          <Button variant="outline" size="sm" onClick={onOpenInternalReport}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Informe interno
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onGoToRepairs}>Volver a Reparaciones</Button>
        <Button onClick={onGoToPublish}>Continuar a Publicación</Button>
      </div>
    </div>
  );
}

function PayerCard({
  title, required, optional, total, onGenerate, generateLabel, accent,
}: {
  title: string; required: number; optional: number; total: number;
  onGenerate: () => void; generateLabel: string; accent: 'primary' | 'muted';
}) {
  return (
    <div className={cn(
      'rounded-lg border bg-card p-4 space-y-3',
      accent === 'primary' && 'border-l-[3px] border-l-primary',
    )}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="font-mono font-semibold text-lg">{fmtCurrency(total)}</span>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Obligatorio</span>
          <span className="font-mono">{fmtCurrency(required)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Opcional</span>
          <span className="font-mono">{fmtCurrency(optional)}</span>
        </div>
      </div>
      <Button size="sm" variant="outline" className="w-full" onClick={onGenerate}>
        <FileText className="mr-1.5 h-3.5 w-3.5" /> {generateLabel}
      </Button>
    </div>
  );
}
