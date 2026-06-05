import { useEffect, useMemo, useState } from 'react';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertTriangle, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCurrency } from '@/pages/executive/review-detail/helpers';
import {
  applyQuotationDiscount,
  validateDiscount,
  type DiscountType,
  type QuotationDiscountInput,
} from '@/lib/quotation-discount';
import type { MarketTaxSettings } from '@/lib/tax';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtotalOwner: number;
  subtotalTenant: number;
  taxConfig: MarketTaxSettings | null;
  initial: QuotationDiscountInput | null;
  saving: boolean;
  onSubmit: (input: QuotationDiscountInput) => Promise<unknown> | void;
}

export function QuotationDiscountSheet({
  open, onOpenChange, subtotalOwner, subtotalTenant, taxConfig, initial, saving, onSubmit,
}: Props) {
  const [type, setType] = useState<DiscountType>('percentage');
  const [value, setValue] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setType(initial?.type ?? 'percentage');
    setValue(initial?.value ? String(initial.value) : '');
    setReason(initial?.reason ?? '');
  }, [open, initial]);

  const numericValue = Number(value);
  const input: QuotationDiscountInput = { type, value: Number.isFinite(numericValue) ? numericValue : 0, reason };
  const subtotalTotal = subtotalOwner + subtotalTenant;
  const error = numericValue > 0 ? validateDiscount(input, subtotalTotal) : null;

  const preview = useMemo(
    () => applyQuotationDiscount({
      subtotalOwner, subtotalTenant,
      discount: numericValue > 0 && !error ? input : null,
      taxConfig,
    }),
    [subtotalOwner, subtotalTenant, type, numericValue, error, taxConfig], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const canSubmit = !!numericValue && numericValue > 0 && !error && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({ type, value: numericValue, reason: reason.trim() || null });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" /> Descuento global
          </SheetTitle>
          <SheetDescription>
            Se aplica sobre el subtotal antes de IVA y se distribuye proporcionalmente entre propietario e inquilino. No modifica los precios de las reparaciones.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          <div className="space-y-2">
            <Label>Tipo de descuento</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as DiscountType)} className="grid grid-cols-2 gap-2">
              <label className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                type === 'percentage' ? 'border-primary bg-primary/[0.06]' : 'border-border hover:bg-muted/40',
              )}>
                <RadioGroupItem value="percentage" /> <span className="text-sm">Porcentaje</span>
              </label>
              <label className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                type === 'fixed' ? 'border-primary bg-primary/[0.06]' : 'border-border hover:bg-muted/40',
              )}>
                <RadioGroupItem value="fixed" /> <span className="text-sm">Monto fijo</span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discount-value">Valor</Label>
            <div className="relative">
              {type === 'fixed' && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              )}
              <Input
                id="discount-value"
                inputMode="decimal"
                type="number"
                min={0}
                max={type === 'percentage' ? 100 : undefined}
                step={type === 'percentage' ? 1 : 1000}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={cn(type === 'fixed' && 'pl-6', type === 'percentage' && 'pr-8')}
                placeholder={type === 'percentage' ? '10' : '15000'}
              />
              {type === 'percentage' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              )}
            </div>
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> {error}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="discount-reason">Motivo (opcional)</Label>
            <Textarea
              id="discount-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Negociación comercial, cliente recurrente, ajuste manual, campaña…"
              rows={3}
            />
          </div>

          {/* Preview */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Vista previa</p>
            <PreviewRow label="Subtotal" value={fmtCurrency(preview.subtotalTotal)} />
            {preview.discountAmount > 0 && (
              <PreviewRow label="Descuento" value={`−${fmtCurrency(preview.discountAmount)}`} accent="primary" />
            )}
            <PreviewRow label="Base" value={fmtCurrency(preview.baseTotal)} muted />
            {preview.vatEnabled && (
              <PreviewRow label={`${preview.vatLabel} ${preview.vatPercentage}%`} value={fmtCurrency(preview.vatTotal)} muted />
            )}
            <div className="border-t pt-1.5 mt-1">
              <PreviewRow label="Nuevo total" value={fmtCurrency(preview.grandTotal)} strong />
            </div>
            <div className="pt-2 mt-1 border-t grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="space-y-0.5">
                <p>Propietario</p>
                <p className="font-mono text-foreground">{fmtCurrency(preview.totalOwner)}</p>
              </div>
              <div className="space-y-0.5">
                <p>Inquilino</p>
                <p className="font-mono text-foreground">{fmtCurrency(preview.totalTenant)}</p>
              </div>
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
            {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Aplicar descuento'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PreviewRow({
  label, value, muted, strong, accent,
}: { label: string; value: string; muted?: boolean; strong?: boolean; accent?: 'primary' }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(
        muted && 'text-muted-foreground text-xs',
        strong && 'font-semibold',
      )}>{label}</span>
      <span className={cn(
        'font-mono',
        muted && 'text-muted-foreground text-xs',
        strong && 'font-semibold text-base',
        accent === 'primary' && 'text-primary',
      )}>{value}</span>
    </div>
  );
}
