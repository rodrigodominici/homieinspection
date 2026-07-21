import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Inspection, InspectionRepairItem, InspectionSection } from '@/lib/types';
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
  operationalSections: InspectionSection[];
}

interface SectionGroup {
  section: InspectionSection;
  items: InspectionRepairItem[];
  subtotal: number;
}

function groupBySection(
  repairs: InspectionRepairItem[],
  sections: InspectionSection[],
): SectionGroup[] {
  const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const groups: SectionGroup[] = [];
  for (const section of sorted) {
    const items = repairs.filter(r => r.inspection_section_id === section.id);
    if (items.length === 0) continue;
    const subtotal = items.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);
    groups.push({ section, items, subtotal });
  }
  // Orphans (section not found in operationalSections — defensive)
  const knownIds = new Set(sections.map(s => s.id));
  const orphans = repairs.filter(r => !knownIds.has(r.inspection_section_id));
  if (orphans.length > 0) {
    groups.push({
      section: { id: '__orphan__', section_title: 'Otros', sort_order: 9999 } as InspectionSection,
      items: orphans,
      subtotal: orphans.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0),
    });
  }
  return groups;
}

export function QuotationDialog({ open, onOpenChange, payer, inspection, repairs, operationalSections }: QuotationDialogProps) {
  const { toast } = useToast();
  const [taxConfig, setTaxConfig] = useState<MarketTaxSettings | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchTaxConfig(inspection.market).then(setTaxConfig);
  }, [open, inspection.market]);

  const title = payer === 'owner' ? 'Cotización Propietario' : 'Cotización Inquilino';

  const { groups, requiredTotal, optionalTotal, subtotal, vat } = useMemo(() => {
    const filtered = repairs.filter(r => r.payer_role === payer);
    const groups = groupBySection(filtered, operationalSections);
    const requiredTotal = filtered
      .filter(r => r.payment_nature === 'required')
      .reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);
    const optionalTotal = filtered
      .filter(r => r.payment_nature === 'optional')
      .reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);
    const subtotal = requiredTotal + optionalTotal;
    return { groups, requiredTotal, optionalTotal, subtotal, vat: applyVat(subtotal, taxConfig) };
  }, [repairs, payer, operationalSections, taxConfig]);
  const total = vat.total;

  const today = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

  const handlePrint = () => {
    const esc = (s: string | null | undefined) =>
      (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const sectionsHtml = groups.map(g => {
      const rows = g.items.map(r => `
        <tr>
          <td>
            <div class="repair-name">${esc(r.title_snapshot)}</div>
            ${r.description_snapshot ? `<div class="repair-desc">${esc(r.description_snapshot)}</div>` : ''}
            <span class="badge ${r.payment_nature === 'required' ? 'badge-required' : 'badge-optional'}">
              ${r.payment_nature === 'required' ? 'Recomendada' : 'Opcional'}
            </span>
          </td>
          <td class="r">${r.quantity}</td>
          <td class="r">${fmtCurrency(r.unit_price)}</td>
          <td class="r">${fmtCurrency(r.quantity * r.unit_price)}</td>
        </tr>`).join('');
      return `
        <div class="section-header">${esc(g.section.section_title)}</div>
        <table class="section-table">
          <thead>
            <tr>
              <th>Reparación</th>
              <th class="r" style="width:50px">Cant.</th>
              <th class="r" style="width:100px">Precio</th>
              <th class="r" style="width:110px">Subtotal</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="r">Subtotal sección</td>
              <td class="r">${fmtCurrency(g.subtotal)}</td>
            </tr>
          </tfoot>
        </table>`;
    }).join('');

    const PRINT_CSS = `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Inter, system-ui, sans-serif; font-size: 11px; color: #111; padding: 28px 36px; line-height: 1.5; }
      .doc-title { font-size: 18px; font-weight: 700; margin-bottom: 3px; }
      .doc-subtitle { font-size: 11px; color: #555; margin-bottom: 2px; }
      .doc-date { font-size: 10px; color: #777; margin-bottom: 18px; }
      .section-header {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .07em; padding: 5px 10px;
        border-left: 3px solid #525EA2; background: #EEF1F8;
        color: #525EA2; margin-top: 16px; margin-bottom: 6px;
      }
      table.section-table { width: 100%; border-collapse: collapse; }
      th, td { padding: 5px 7px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
      th { background: #f6f7fb; font-weight: 600; font-size: 10px; }
      tfoot td { border-top: 1px solid #111; font-weight: 600; background: #fafafa; }
      .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .repair-name { font-weight: 600; }
      .repair-desc { font-size: 10px; color: #666; margin-top: 1px; }
      .badge { display: inline-block; font-size: 9px; padding: 1px 6px; border-radius: 3px; margin-top: 3px; font-weight: 600; }
      .badge-required { background: #EEF1F8; color: #525EA2; border: 1px solid #c7cde6; }
      .badge-optional { background: #fff; color: #666; border: 1px solid #d1d5db; }
      .totals { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ccc; }
      .totals-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; }
      .totals-row.optional { font-style: italic; color: #666; }
      .totals-label { color: #555; }
      .totals-value { font-variant-numeric: tabular-nums; font-weight: 600; }
      .grand-line { border-top: 2px solid #111; margin-top: 6px; padding-top: 6px; }
      .grand-line .totals-label, .grand-line .totals-value { font-weight: 700; font-size: 13px; }
      @page { margin: 16mm 14mm; }
    `;
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return;
    const summary = `
      <div class="totals">
        <div class="totals-row"><span class="totals-label">Subtotal recomendadas</span><span class="totals-value">${fmtCurrency(requiredTotal)}</span></div>
        <div class="totals-row optional"><span class="totals-label">Subtotal opcionales</span><span class="totals-value">${fmtCurrency(optionalTotal)}</span></div>
        ${vat.enabled ? `<div class="totals-row"><span class="totals-label">${esc(vat.label)} ${vat.percentage}%</span><span class="totals-value">${fmtCurrency(vat.vatAmount)}</span></div>` : ''}
        <div class="totals-row grand-line"><span class="totals-label">Total</span><span class="totals-value">${fmtCurrency(total)}</span></div>
      </div>`;
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
      <div class="doc-title">${esc(title)}</div>
      <div class="doc-subtitle">${esc(inspection.property_name ?? inspection.property_id)}</div>
      ${inspection.address ? `<div class="doc-subtitle">${esc(inspection.address)}</div>` : ''}
      <div class="doc-date">${today}</div>
      ${sectionsHtml}
      ${summary}
    </body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  const handleCopy = () => {
    const lines: string[] = [];
    lines.push(title);
    lines.push(inspection.property_name ?? inspection.property_id);
    if (inspection.address) lines.push(inspection.address);
    lines.push('');
    for (const g of groups) {
      lines.push(g.section.section_title.toUpperCase());
      g.items.forEach(r => {
        const tag = r.payment_nature === 'required' ? '[Recomendada]' : '[Opcional]';
        lines.push(`- ${r.title_snapshot} ${tag} · ${r.quantity} × ${fmtCurrency(r.unit_price)} = ${fmtCurrency(r.quantity * r.unit_price)}`);
      });
      lines.push(`Subtotal sección: ${fmtCurrency(g.subtotal)}`);
      lines.push('');
    }
    lines.push(`Subtotal recomendadas: ${fmtCurrency(requiredTotal)}`);
    lines.push(`Subtotal opcionales: ${fmtCurrency(optionalTotal)}`);
    if (vat.enabled) lines.push(`${vat.label} ${vat.percentage}%: ${fmtCurrency(vat.vatAmount)}`);
    lines.push(`Total: ${fmtCurrency(total)}`);
    navigator.clipboard.writeText(lines.join('\n'));
    toast({ title: 'Resumen copiado al portapapeles' });
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

          {groups.length === 0 ? (
            <p className="text-caption text-muted-foreground py-8 text-center">
              No hay reparaciones asignadas a {payer === 'owner' ? 'el propietario' : 'el inquilino'}.
            </p>
          ) : (
            <>
              {groups.map(g => (
                <section key={g.section.id} className="space-y-2">
                  <h2 className="text-tiny font-semibold uppercase tracking-wider text-primary border-l-2 border-primary pl-2 py-1 bg-primary/5">
                    {g.section.section_title}
                  </h2>
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="bg-muted/40">
                        <th className="text-left font-medium px-2 py-1.5">Reparación</th>
                        <th className="text-right font-medium px-2 py-1.5">Cant.</th>
                        <th className="text-right font-medium px-2 py-1.5">Precio</th>
                        <th className="text-right font-medium px-2 py-1.5">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map(r => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="px-2 py-1.5">
                            <div className="font-medium">{r.title_snapshot}</div>
                            {r.description_snapshot && (
                              <div className="text-tiny text-muted-foreground">{r.description_snapshot}</div>
                            )}
                            <Badge
                              variant={r.payment_nature === 'required' ? 'secondary' : 'outline'}
                              className="mt-1 text-[10px] px-1.5 py-0"
                            >
                              {r.payment_nature === 'required' ? 'Obligatoria' : 'Opcional'}
                            </Badge>
                          </td>
                          <td className="text-right px-2 py-1.5 font-mono">{r.quantity}</td>
                          <td className="text-right px-2 py-1.5 font-mono">{fmtCurrency(r.unit_price)}</td>
                          <td className="text-right px-2 py-1.5 font-mono font-medium">{fmtCurrency(r.quantity * r.unit_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="text-right px-2 py-1.5 font-medium">Subtotal sección</td>
                        <td className="text-right px-2 py-1.5 font-mono font-semibold">{fmtCurrency(g.subtotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </section>
              ))}

              <div className="totals border-t border-border/70 pt-3 space-y-1.5 text-caption">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal obligatorias</span>
                  <MoneyDisplay value={requiredTotal} market={inspection.market} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal opcionales</span>
                  <MoneyDisplay value={optionalTotal} market={inspection.market} />
                </div>
                <TaxBreakdown
                  net={subtotal}
                  market={inspection.market}
                  config={taxConfig}
                  className="pt-2 mt-1"
                />
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
