import { Button } from '@/components/ui/button';
import { FileText, Download, AlertTriangle, Tag, Pencil, Trash2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCurrency } from './helpers';
import type { QuotationDiscountBreakdown, QuotationDiscountInput } from '@/lib/quotation-discount';

interface QuotationViewProps {
  budgetBreakdown: {
    ownerRequired: number; ownerOptional: number; ownerTotal: number;
    tenantRequired: number; tenantOptional: number; tenantTotal: number;
    grandTotal: number;
  };
  discountBreakdown: QuotationDiscountBreakdown;
  activeDiscount: QuotationDiscountInput | null;
  discountReason: string | null;
  onOpenDiscount: () => void;
  onRemoveDiscount: () => void;
  discountSaving: boolean;
  clientTotal: number;
  contractorTotal: number;
  utility: number;
  warrantyDeposit: number | null;
  depositDiff: number | null;
  hasRepairs: boolean;
  onOpenQuotation: (payer: 'owner' | 'tenant') => void;
  onOpenContractorQuotation: () => void;
  onOpenWorkOrderDetails: () => void;
  onGoToRepairs: () => void;
  onGoToPublish: () => void;
  /** Si el propietario pidió ajustes, mostramos banner con CTA a Reparaciones filtradas. */
  ownerPendingFeedbackCount?: number;
  ownerFeedbackVersionNumber?: number | null;
}

export function QuotationView({
  budgetBreakdown, discountBreakdown, activeDiscount, discountReason,
  onOpenDiscount, onRemoveDiscount, discountSaving,
  clientTotal, contractorTotal, utility,
  warrantyDeposit, depositDiff, hasRepairs,
  onOpenQuotation, onOpenContractorQuotation, onOpenWorkOrderDetails,
  onGoToRepairs, onGoToPublish,
  ownerPendingFeedbackCount = 0, ownerFeedbackVersionNumber = null,
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
          subtotal={discountBreakdown.subtotalOwner}
          discount={discountBreakdown.discountOwner}
          base={discountBreakdown.baseOwner}
          vat={discountBreakdown.vatOwner}
          vatLabel={discountBreakdown.vatLabel}
          vatPercentage={discountBreakdown.vatPercentage}
          vatEnabled={discountBreakdown.vatEnabled}
          total={discountBreakdown.totalOwner}
          onGenerate={() => onOpenQuotation('owner')}
          generateLabel="Generar cotización propietario"
          accent="primary"
        />
        <PayerCard
          title="Inquilino"
          required={budgetBreakdown.tenantRequired}
          optional={budgetBreakdown.tenantOptional}
          subtotal={discountBreakdown.subtotalTenant}
          discount={discountBreakdown.discountTenant}
          base={discountBreakdown.baseTenant}
          vat={discountBreakdown.vatTenant}
          vatLabel={discountBreakdown.vatLabel}
          vatPercentage={discountBreakdown.vatPercentage}
          vatEnabled={discountBreakdown.vatEnabled}
          total={discountBreakdown.totalTenant}
          onGenerate={() => onOpenQuotation('tenant')}
          generateLabel="Generar cotización inquilino"
          accent="muted"
        />
      </div>

      {/* Discount card */}
      {hasRepairs && (
        <DiscountCard
          active={activeDiscount}
          reason={discountReason}
          amount={discountBreakdown.discountAmount}
          subtotal={discountBreakdown.subtotalTotal}
          onOpen={onOpenDiscount}
          onRemove={onRemoveDiscount}
          saving={discountSaving}
        />
      )}

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
        <div className="pt-2 border-t border-border/60 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onOpenContractorQuotation}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Cotización contratista
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenWorkOrderDetails}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Detalles de la OT
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

function DiscountCard({
  active, reason, amount, subtotal, onOpen, onRemove, saving,
}: {
  active: QuotationDiscountInput | null;
  reason: string | null;
  amount: number;
  subtotal: number;
  onOpen: () => void;
  onRemove: () => void;
  saving: boolean;
}) {
  const disabled = subtotal <= 0;

  if (!active) {
    return (
      <div className="rounded-lg border border-dashed bg-primary/[0.03] px-4 py-3 flex items-center gap-3">
        <Tag className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Aplicar descuento global</p>
          <p className="text-xs text-muted-foreground">
            Descuento comercial sobre la cotización (antes de IVA). No modifica las reparaciones.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onOpen} disabled={disabled || saving}>
          <Tag className="mr-1.5 h-3.5 w-3.5" /> Aplicar descuento
        </Button>
      </div>
    );
  }

  const valueLabel = active.type === 'percentage' ? `${active.value}%` : fmtCurrency(active.value);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.05] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="rounded-md bg-primary/15 p-1.5 mt-0.5">
            <Tag className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Descuento comercial · {valueLabel}
              <span className="ml-2 font-mono text-primary">−{fmtCurrency(amount)}</span>
            </p>
            {reason && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{reason}</p>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={onOpen} disabled={saving}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove} disabled={saving} className="text-destructive hover:text-destructive">
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
          </Button>
        </div>
      </div>
    </div>
  );
}

function PayerCard({
  title, required, optional, subtotal, discount, base, vat, vatLabel, vatPercentage, vatEnabled, total,
  onGenerate, generateLabel, accent,
}: {
  title: string; required: number; optional: number;
  subtotal: number; discount: number; base: number;
  vat: number; vatLabel: string; vatPercentage: number; vatEnabled: boolean;
  total: number;
  onGenerate: () => void; generateLabel: string; accent: 'primary' | 'muted';
}) {
  const hasDiscount = discount > 0;
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
        <Row label="Obligatorio" value={fmtCurrency(required)} muted />
        <Row label="Opcional" value={fmtCurrency(optional)} muted />
        <Row label="Subtotal" value={fmtCurrency(subtotal)} divider />
        {hasDiscount && (
          <>
            <Row label="Descuento" value={`−${fmtCurrency(discount)}`} accent />
            <Row label="Base" value={fmtCurrency(base)} muted />
          </>
        )}
        {vatEnabled && (
          <Row label={`${vatLabel} ${vatPercentage}%`} value={fmtCurrency(vat)} muted />
        )}
        <Row label="Total" value={fmtCurrency(total)} strong divider />
      </div>
      <Button size="sm" variant="outline" className="w-full" onClick={onGenerate}>
        <FileText className="mr-1.5 h-3.5 w-3.5" /> {generateLabel}
      </Button>
    </div>
  );
}

function Row({ label, value, muted, strong, divider, accent }: {
  label: string; value: string; muted?: boolean; strong?: boolean; divider?: boolean; accent?: boolean;
}) {
  return (
    <div className={cn(
      'flex justify-between',
      divider && 'pt-1 border-t border-border/60',
    )}>
      <span className={cn(muted && 'text-muted-foreground', strong && 'font-medium')}>{label}</span>
      <span className={cn(
        'font-mono',
        muted && 'text-muted-foreground',
        strong && 'font-semibold',
        accent && 'text-primary',
      )}>{value}</span>
    </div>
  );
}
