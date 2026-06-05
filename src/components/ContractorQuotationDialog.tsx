/**
 * ContractorQuotationDialog — quotation for the contractor.
 *
 * Groups repairs by property section. Shows contractor unit cost (not client
 * price). Excludes payer (owner/tenant) and nature (required/optional) info.
 * No VAT, no utility.
 */
import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import type { Inspection, InspectionRepairItem, InspectionSection } from '@/lib/types';

interface ContractorQuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspection: Inspection;
  operationalSections: InspectionSection[];
  allRepairs: InspectionRepairItem[];
  contractorName?: string | null;
}

const fmtNum = (n: number) =>
  `$${Number(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface SectionGroup {
  section: InspectionSection;
  items: InspectionRepairItem[];
  subtotal: number;
}

function groupBySection(repairs: InspectionRepairItem[], sections: InspectionSection[]): SectionGroup[] {
  const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const groups: SectionGroup[] = [];
  for (const section of sorted) {
    const items = repairs.filter(r => r.inspection_section_id === section.id);
    if (items.length === 0) continue;
    const subtotal = items.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.contractor_unit_price) || 0), 0);
    groups.push({ section, items, subtotal });
  }
  return groups;
}

const PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, system-ui, sans-serif; font-size: 11px; color: #111; padding: 28px 36px; line-height: 1.5; }
  .doc-title { font-size: 18px; font-weight: 700; margin-bottom: 3px; }
  .doc-subtitle { font-size: 11px; color: #555; margin-bottom: 2px; }
  .doc-date { font-size: 10px; color: #777; margin-bottom: 6px; }
  .doc-contractor { font-size: 11px; color: #333; margin-bottom: 4px; }
  .doc-contractor strong { font-weight: 600; }
  .confidential {
    display: inline-block; font-size: 9px; font-weight: 700;
    letter-spacing: .08em; text-transform: uppercase;
    color: #b91c1c; background: #fff1f2;
    border: 1px solid #fca5a5; border-radius: 3px;
    padding: 1px 7px; margin-bottom: 18px;
  }
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
  .totals { margin-top: 20px; padding-top: 10px; border-top: 2px solid #111; }
  .totals-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; font-weight: 700; }
  @page { margin: 16mm 14mm; }
`;

export function ContractorQuotationDialog({
  open, onOpenChange, inspection, operationalSections, allRepairs, contractorName,
}: ContractorQuotationDialogProps) {
  const groups = useMemo(() => groupBySection(allRepairs, operationalSections), [allRepairs, operationalSections]);
  const grandTotal = groups.reduce((s, g) => s + g.subtotal, 0);
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
          </td>
          <td class="r">${r.quantity}</td>
          <td class="r">${fmtNum(r.contractor_unit_price)}</td>
          <td class="r">${fmtNum(r.quantity * r.contractor_unit_price)}</td>
        </tr>`).join('');
      return `
        <div class="section-header">${esc(g.section.section_title)}</div>
        <table class="section-table">
          <thead>
            <tr>
              <th>Reparación</th>
              <th class="r" style="width:50px">Cant.</th>
              <th class="r" style="width:110px">Costo unit.</th>
              <th class="r" style="width:120px">Subtotal</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="r">Subtotal sección</td>
              <td class="r">${fmtNum(g.subtotal)}</td>
            </tr>
          </tfoot>
        </table>`;
    }).join('');

    const title = `Cotización Contratista — ${inspection.property_name ?? inspection.property_id}`;
    const win = window.open('', '_blank', 'width=960,height=1200');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
      <div class="doc-title">Cotización Contratista</div>
      <div class="doc-subtitle">${esc(inspection.property_name ?? inspection.property_id)}</div>
      ${inspection.address ? `<div class="doc-subtitle">${esc(inspection.address)}</div>` : ''}
      <div class="doc-date">${today}</div>
      ${contractorName ? `<div class="doc-contractor"><strong>Contratista:</strong> ${esc(contractorName)}</div>` : ''}
      <div class="confidential">Confidencial — uso interno</div>
      ${sectionsHtml}
      <div class="totals">
        <div class="totals-row"><span>Total contratista</span><span>${fmtNum(grandTotal)}</span></div>
      </div>
    </body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 400);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cotización Contratista</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-[12px]">
          <div>
            <h1 className="text-body-lg font-bold leading-tight">{inspection.property_name ?? inspection.property_id}</h1>
            {inspection.address && <p className="text-caption text-muted-foreground">{inspection.address}</p>}
            <p className="text-[11px] text-muted-foreground mt-0.5">{today}</p>
            {contractorName && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                <span className="font-semibold text-foreground">Contratista:</span> {contractorName}
              </p>
            )}
            <span className="inline-block mt-2 text-[9px] font-bold uppercase tracking-widest text-destructive border border-destructive/40 bg-destructive/10 px-2 py-0.5 rounded">
              Confidencial — uso interno
            </span>
          </div>

          {groups.length === 0 ? (
            <p className="text-caption text-muted-foreground py-10 text-center">No hay reparaciones presupuestadas.</p>
          ) : (
            <>
              {groups.map(g => (
                <section key={g.section.id} className="space-y-1">
                  <h2 className="text-tiny font-semibold uppercase tracking-wider text-primary border-l-2 border-primary pl-2 py-1 bg-primary/5">
                    {g.section.section_title}
                  </h2>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-muted/40">
                        <th className="text-left px-2 py-1.5 font-semibold text-[10px]">Reparación</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-[10px] w-12">Cant.</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-[10px] w-28">Costo unit.</th>
                        <th className="text-right px-2 py-1.5 font-semibold text-[10px] w-28">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map(r => (
                        <tr key={r.id} className="border-b border-border/40">
                          <td className="px-2 py-1.5">
                            <div className="font-semibold leading-snug">{r.title_snapshot}</div>
                            {r.description_snapshot && <div className="text-[10px] text-muted-foreground">{r.description_snapshot}</div>}
                          </td>
                          <td className="text-right px-2 py-1.5 font-mono">{r.quantity}</td>
                          <td className="text-right px-2 py-1.5 font-mono">{fmtNum(r.contractor_unit_price)}</td>
                          <td className="text-right px-2 py-1.5 font-mono font-semibold">{fmtNum(r.quantity * r.contractor_unit_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="text-right px-2 py-1.5 font-medium">Subtotal sección</td>
                        <td className="text-right px-2 py-1.5 font-mono font-semibold">{fmtNum(g.subtotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </section>
              ))}

              <div className="mt-4 pt-3 border-t-2 border-foreground flex justify-between font-bold text-[14px]">
                <span>Total contratista</span>
                <span className="font-mono">{fmtNum(grandTotal)}</span>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handlePrint}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir / Guardar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
