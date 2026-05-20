import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Inspection, InspectionRepairItem } from '@/lib/types';
import { fetchTaxConfig, applyVat, type MarketTaxSettings } from '@/lib/tax';
import { MoneyDisplay } from '@/shared/ui/MoneyDisplay';
import { TaxBreakdown } from '@/shared/ui/TaxBreakdown';

const fmt = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtCurrency = (n: number) => `$${fmt(n)}`;

interface QuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payer: 'owner' | 'tenant';
  inspection: Inspection;
  repairs: InspectionRepairItem[];
}

export function QuotationDialog({ open, onOpenChange, payer, inspection, repairs }: QuotationDialogProps) {
  const { toast } = useToast();
  const [taxConfig, setTaxConfig] = useState<MarketTaxSettings | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchTaxConfig(inspection.market).then(setTaxConfig);
  }, [open, inspection.market]);

  const title = payer === 'owner' ? 'Cotización Propietario' : 'Cotización Inquilino';

  const { required, optional, requiredTotal, optionalTotal, subtotal, vat } = useMemo(() => {
    const filtered = repairs.filter(r => r.payer_role === payer);
    const required = filtered.filter(r => r.payment_nature === 'required');
    const optional = filtered.filter(r => r.payment_nature === 'optional');
    const sum = (arr: InspectionRepairItem[]) =>
      arr.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);
    const requiredTotal = sum(required);
    const optionalTotal = sum(optional);
    const subtotal = requiredTotal + optionalTotal;
    return { required, optional, requiredTotal, optionalTotal, subtotal, vat: applyVat(subtotal, taxConfig) };
  }, [repairs, payer, taxConfig]);
  const total = vat.total;

  const handlePrint = () => {
    const node = document.getElementById('quotation-print-area');
    if (!node) return;
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return;
    win.document.write(`
      <html><head><title>${title}</title>
      <style>
        body{font-family:Inter,system-ui,sans-serif;padding:32px;color:#111;}
        h1{font-size:20px;margin:0 0 4px;}
        h2{font-size:14px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.05em;color:#525EA2;}
        p{margin:0;font-size:12px;color:#555;}
        table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;}
        th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee;}
        th{background:#F6F7FB;font-weight:600;}
        td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;}
        tfoot td{border-top:2px solid #111;font-weight:600;}
        .totals{margin-top:24px;font-size:13px;}
        .totals .row{display:flex;justify-content:space-between;padding:4px 0;}
        .totals .grand{border-top:2px solid #111;margin-top:8px;padding-top:8px;font-weight:700;font-size:15px;}
      </style></head><body>${node.innerHTML}</body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  const handleCopy = () => {
    const lines: string[] = [];
    lines.push(title);
    lines.push(inspection.property_name ?? inspection.property_id);
    if (inspection.address) lines.push(inspection.address);
    lines.push('');
    if (required.length > 0) {
      lines.push('REPARACIONES OBLIGATORIAS');
      required.forEach(r => {
        lines.push(`- ${r.title_snapshot} · ${r.quantity} × ${fmtCurrency(r.unit_price)} = ${fmtCurrency(r.quantity * r.unit_price)}`);
      });
      lines.push(`Subtotal obligatorias: ${fmtCurrency(requiredTotal)}`);
      lines.push('');
    }
    if (optional.length > 0) {
      lines.push('REPARACIONES OPCIONALES');
      optional.forEach(r => {
        lines.push(`- ${r.title_snapshot} · ${r.quantity} × ${fmtCurrency(r.unit_price)} = ${fmtCurrency(r.quantity * r.unit_price)}`);
      });
      lines.push(`Subtotal opcionales: ${fmtCurrency(optionalTotal)}`);
      lines.push('');
    }
    lines.push(`Subtotal: ${fmtCurrency(subtotal)}`);
    if (vat.enabled) lines.push(`${vat.label} ${vat.percentage}%: ${fmtCurrency(vat.vatAmount)}`);
    lines.push(`Total: ${fmtCurrency(total)}`);
    navigator.clipboard.writeText(lines.join('\n'));
    toast({ title: 'Resumen copiado al portapapeles' });
  };

  const renderTable = (items: InspectionRepairItem[], heading: string, subtotal: number) => {
    if (items.length === 0) return null;
    return (
      <section className="space-y-2">
        <h2 className="text-tiny font-semibold uppercase tracking-wider text-primary">{heading}</h2>
        <table className="w-full text-caption">
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left font-medium px-2 py-1.5">Reparación</th>
              <th className="num text-right font-medium px-2 py-1.5">Cant.</th>
              <th className="num text-right font-medium px-2 py-1.5">Precio</th>
              <th className="num text-right font-medium px-2 py-1.5">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} className="border-b border-border/60">
                <td className="px-2 py-1.5">
                  <div className="font-medium">{r.title_snapshot}</div>
                  {r.description_snapshot && (
                    <div className="text-tiny text-muted-foreground">{r.description_snapshot}</div>
                  )}
                </td>
                <td className="num text-right px-2 py-1.5 font-mono">{r.quantity}</td>
                <td className="num text-right px-2 py-1.5 font-mono">{fmtCurrency(r.unit_price)}</td>
                <td className="num text-right px-2 py-1.5 font-mono font-medium">{fmtCurrency(r.quantity * r.unit_price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right px-2 py-1.5 font-medium">Subtotal</td>
              <td className="num text-right px-2 py-1.5 font-mono font-semibold">{fmtCurrency(subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div id="quotation-print-area" className="space-y-4">
          <div>
            <h1 className="text-body-lg font-semibold">{inspection.property_name ?? inspection.property_id}</h1>
            {inspection.address && <p className="text-caption text-muted-foreground">{inspection.address}</p>}
          </div>

          {required.length === 0 && optional.length === 0 ? (
            <p className="text-caption text-muted-foreground py-8 text-center">
              No hay reparaciones asignadas a {payer === 'owner' ? 'el propietario' : 'el inquilino'}.
            </p>
          ) : (
            <>
              {renderTable(required, 'Reparaciones obligatorias', requiredTotal)}
              {renderTable(optional, 'Reparaciones opcionales', optionalTotal)}
              <div className="totals border-t border-border/70 pt-3 space-y-1.5 text-caption">
                {required.length > 0 && (
                  <div className="row flex justify-between">
                    <span className="text-muted-foreground">Subtotal obligatorias</span>
                    <MoneyDisplay value={requiredTotal} market={inspection.market} />
                  </div>
                )}
                {optional.length > 0 && (
                  <div className="row flex justify-between">
                    <span className="text-muted-foreground">Subtotal opcionales</span>
                    <MoneyDisplay value={optionalTotal} market={inspection.market} />
                  </div>
                )}
                {(required.length > 0 || optional.length > 0) && (
                  <TaxBreakdown
                    net={subtotal}
                    market={inspection.market}
                    config={taxConfig}
                    className="pt-2 mt-1"
                  />
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar resumen
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
