/**
 * WorkOrderDetailsDialog — internal OT details grouped by category.
 *
 * Columns: categoría | total venta | costo contratista | utilidad.
 * Shows ALL repairs regardless of visible_to_owner.
 */
import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import type { Inspection, InspectionRepairItem } from '@/lib/types';

interface WorkOrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspection: Inspection;
  allRepairs: InspectionRepairItem[];
  contractorName?: string | null;
}

const fmtNum = (n: number) =>
  `$${Number(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

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
  .cat-header {
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .08em; color: #444;
    margin-top: 8px; margin-bottom: 6px;
    padding-bottom: 4px; border-bottom: 1px solid #ccc;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  .cat-table th { background: #111; color: #fff; font-size: 10px; }
  .cat-table tfoot td { background: #EEF1F8; font-weight: 700; border-top: 2px solid #111; }
  .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pos { color: #15803d; }
  .neg { color: #b91c1c; }
  @page { margin: 16mm 14mm; }
`;

export function WorkOrderDetailsDialog({
  open, onOpenChange, inspection, allRepairs, contractorName,
}: WorkOrderDetailsDialogProps) {
  const categoryRows = useMemo(() => {
    const map = new Map<string, { venta: number; costo: number }>();
    for (const r of allRepairs) {
      const cat = r.category_snapshot || 'Sin categoría';
      const prev = map.get(cat) ?? { venta: 0, costo: 0 };
      map.set(cat, {
        venta: prev.venta + r.quantity * r.unit_price,
        costo: prev.costo + r.quantity * r.contractor_unit_price,
      });
    }
    return [...map.entries()]
      .map(([cat, v]) => ({ cat, ...v, util: v.venta - v.costo }))
      .sort((a, b) => b.venta - a.venta);
  }, [allRepairs]);

  const grandVenta = categoryRows.reduce((s, r) => s + r.venta, 0);
  const grandCosto = categoryRows.reduce((s, r) => s + r.costo, 0);
  const grandUtil = grandVenta - grandCosto;
  const today = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

  const handlePrint = () => {
    const esc = (s: string | null | undefined) =>
      (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = categoryRows.map(row => `
      <tr>
        <td>${esc(row.cat)}</td>
        <td class="r">${fmtNum(row.venta)}</td>
        <td class="r" style="color:#555">${fmtNum(row.costo)}</td>
        <td class="r ${row.util >= 0 ? 'pos' : 'neg'}">${fmtNum(row.util)}</td>
      </tr>`).join('');
    const title = `Detalles de la OT — ${inspection.property_name ?? inspection.property_id}`;
    const win = window.open('', '_blank', 'width=960,height=1200');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
      <div class="doc-title">Detalles de la OT</div>
      <div class="doc-subtitle">${esc(inspection.property_name ?? inspection.property_id)}</div>
      ${inspection.address ? `<div class="doc-subtitle">${esc(inspection.address)}</div>` : ''}
      <div class="doc-date">${today}</div>
      ${contractorName ? `<div class="doc-contractor"><strong>Contratista:</strong> ${esc(contractorName)}</div>` : ''}
      <div class="confidential">Confidencial — uso interno</div>
      <div class="cat-header">Resumen por categoría</div>
      <table class="cat-table">
        <thead>
          <tr>
            <th>Categoría</th>
            <th class="r" style="width:110px">Total venta</th>
            <th class="r" style="width:130px">Costo contratista</th>
            <th class="r" style="width:90px">Utilidad</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td>Total general</td>
            <td class="r">${fmtNum(grandVenta)}</td>
            <td class="r" style="color:#555">${fmtNum(grandCosto)}</td>
            <td class="r ${grandUtil >= 0 ? 'pos' : 'neg'}">${fmtNum(grandUtil)}</td>
          </tr>
        </tfoot>
      </table>
    </body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 400);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalles de la OT</DialogTitle>
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

          {categoryRows.length === 0 ? (
            <p className="text-caption text-muted-foreground py-10 text-center">No hay reparaciones presupuestadas.</p>
          ) : (
            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1 border-b">
                Resumen por categoría
              </p>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-foreground text-background">
                    <th className="text-left px-2 py-1.5 text-[10px] font-semibold">Categoría</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold">Total venta</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold">Costo contratista</th>
                    <th className="text-right px-2 py-1.5 text-[10px] font-semibold">Utilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map(row => (
                    <tr key={row.cat} className="border-b border-border/40">
                      <td className="px-2 py-1.5 font-medium">{row.cat}</td>
                      <td className="text-right px-2 py-1.5 font-mono">{fmtNum(row.venta)}</td>
                      <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">{fmtNum(row.costo)}</td>
                      <td className={`text-right px-2 py-1.5 font-mono font-semibold ${row.util >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]'}`}>
                        {fmtNum(row.util)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-primary/10">
                    <td className="px-2 py-1.5 font-bold">Total general</td>
                    <td className="text-right px-2 py-1.5 font-mono font-bold">{fmtNum(grandVenta)}</td>
                    <td className="text-right px-2 py-1.5 font-mono font-bold text-muted-foreground">{fmtNum(grandCosto)}</td>
                    <td className={`text-right px-2 py-1.5 font-mono font-bold ${grandUtil >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]'}`}>
                      {fmtNum(grandUtil)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
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
