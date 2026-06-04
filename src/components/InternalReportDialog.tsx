/**
 * InternalReportDialog — confidential full quotation for the executive.
 *
 * Structure:
 *  1. Header (property, date, CONFIDENTIAL)
 *  2. PROPIETARIO section — obligatorias → opcionales → totals
 *  3. INQUILINO section — same
 *  4. RESUMEN POR CATEGORÍA — category | total venta | total costo | utilidad
 *
 * Shows ALL repairs regardless of visible_to_owner.
 * Print via window.open so it renders in a clean, print-ready page.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { fetchTaxConfig, applyVat, type MarketTaxSettings } from '@/lib/tax';
import type { Inspection, InspectionRepairItem, InspectionSection } from '@/lib/types';

interface InternalReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspection: Inspection;
  operationalSections: InspectionSection[];
  allRepairs: InspectionRepairItem[];
}

const fmt = (n: number) =>
  `$${Number(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const PRINT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Inter,system-ui,sans-serif;padding:28px 32px;color:#111;font-size:11px;line-height:1.45;}
  h1{font-size:17px;font-weight:700;margin-bottom:2px;}
  .subtitle{color:#666;font-size:11px;}
  .confidential{display:inline-block;margin-top:4px;color:#b91c1c;font-size:9px;font-weight:700;
    letter-spacing:.08em;text-transform:uppercase;border:1px solid #fca5a5;
    background:#fff1f2;padding:1px 6px;border-radius:3px;}
  .section-header{margin-top:20px;margin-bottom:6px;padding:5px 8px;
    font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
    border-left:3px solid #3b4bdb;background:#f0f1ff;color:#3b4bdb;}
  .section-header.tenant{border-color:#7c3aed;background:#f5f3ff;color:#7c3aed;}
  h3{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
     color:#666;margin:10px 0 4px;}
  table{width:100%;border-collapse:collapse;}
  th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #f0f0f0;vertical-align:top;}
  th{background:#f6f7fb;font-weight:600;font-size:10px;}
  td.r,th.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  .totals{margin-top:8px;padding-top:6px;border-top:1px solid #d1d5db;}
  .totals .row{display:flex;justify-content:space-between;padding:2px 0;font-size:11px;}
  .totals .row.grand{font-weight:700;font-size:12px;border-top:2px solid #111;margin-top:6px;padding-top:6px;}
  .totals .row.vat{color:#666;font-size:10px;}
  .category-table{margin-top:20px;}
  .category-table thead th{background:#111;color:#fff;}
  .category-table tfoot td{background:#f0f1f8;font-weight:700;border-top:2px solid #111;}
  .pos{color:#15803d;}.neg{color:#b91c1c;}
  .hidden-note{font-style:italic;font-size:9px;color:#9ca3af;}
  @page{margin:18mm 14mm;}
`;

export function InternalReportDialog({
  open, onOpenChange, inspection, operationalSections, allRepairs,
}: InternalReportDialogProps) {
  const [taxConfig, setTaxConfig] = useState<MarketTaxSettings | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchTaxConfig(inspection.market).then(setTaxConfig);
  }, [open, inspection.market]);

  // Split repairs by payer
  const { ownerRepairs, tenantRepairs } = useMemo(() => ({
    ownerRepairs: allRepairs.filter(r => r.payer_role === 'owner'),
    tenantRepairs: allRepairs.filter(r => r.payer_role === 'tenant'),
  }), [allRepairs]);

  // Category summary across all repairs
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
      .map(([cat, vals]) => ({ cat, ...vals, util: vals.venta - vals.costo }))
      .sort((a, b) => b.venta - a.venta);
  }, [allRepairs]);

  const grandVenta = categoryRows.reduce((s, r) => s + r.venta, 0);
  const grandCosto = categoryRows.reduce((s, r) => s + r.costo, 0);
  const grandUtil = grandVenta - grandCosto;

  const ownerVat = applyVat(ownerRepairs.reduce((s, r) => s + r.quantity * r.unit_price, 0), taxConfig);
  const tenantVat = applyVat(tenantRepairs.reduce((s, r) => s + r.quantity * r.unit_price, 0), taxConfig);

  const handlePrint = () => {
    const node = document.getElementById('internal-report-print-area');
    if (!node) return;
    const win = window.open('', '_blank', 'width=1000,height=1200');
    if (!win) return;
    win.document.write(
      `<html><head><title>Informe Interno — ${inspection.property_name ?? inspection.property_id}</title>` +
      `<style>${PRINT_CSS}</style></head><body>${node.innerHTML}</body></html>`
    );
    win.document.close();
    setTimeout(() => { win.print(); }, 400);
  };

  const today = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Informe Interno</DialogTitle>
        </DialogHeader>

        <div id="internal-report-print-area" className="space-y-1 text-[12px]">

          {/* ── Document header ──────────────────────── */}
          <div className="mb-2">
            <h1 className="text-body-lg font-bold leading-tight">
              {inspection.property_name ?? inspection.property_id}
            </h1>
            {inspection.address && (
              <p className="text-caption text-muted-foreground">{inspection.address}</p>
            )}
            <p className="text-muted-foreground text-[11px] mt-0.5">{today}</p>
            <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-widest text-red-600 border border-red-300 bg-red-50 px-2 py-0.5 rounded">
              Confidencial — uso interno
            </span>
          </div>

          {allRepairs.length === 0 ? (
            <p className="text-caption text-muted-foreground py-10 text-center">
              No hay reparaciones presupuestadas.
            </p>
          ) : (
            <>
              {/* ── PROPIETARIO ─────────────────────── */}
              <PayerSection
                label="Propietario"
                accent="blue"
                repairs={ownerRepairs}
                vatData={ownerVat}
              />

              {/* ── INQUILINO ───────────────────────── */}
              <PayerSection
                label="Inquilino"
                accent="violet"
                repairs={tenantRepairs}
                vatData={tenantVat}
              />

              {/* ── RESUMEN POR CATEGORÍA ───────────── */}
              <div className="mt-6 pt-4 border-t border-border">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Resumen por categoría
                </p>
                <table className="w-full">
                  <thead>
                    <tr className="bg-foreground text-background">
                      <th className="text-left px-2 py-1.5 text-[10px] font-semibold">Categoría</th>
                      <th className="r text-right px-2 py-1.5 text-[10px] font-semibold">Total venta</th>
                      <th className="r text-right px-2 py-1.5 text-[10px] font-semibold">Costo contratista</th>
                      <th className="r text-right px-2 py-1.5 text-[10px] font-semibold">Utilidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.map(row => (
                      <tr key={row.cat} className="border-b border-border/40">
                        <td className="px-2 py-1.5 font-medium">{row.cat}</td>
                        <td className="r text-right px-2 py-1.5 font-mono">{fmt(row.venta)}</td>
                        <td className="r text-right px-2 py-1.5 font-mono text-muted-foreground">{fmt(row.costo)}</td>
                        <td className={`r text-right px-2 py-1.5 font-mono font-semibold ${row.util >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {fmt(row.util)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30">
                      <td className="px-2 py-1.5 font-bold">Total general</td>
                      <td className="r text-right px-2 py-1.5 font-mono font-bold">{fmt(grandVenta)}</td>
                      <td className="r text-right px-2 py-1.5 font-mono font-bold text-muted-foreground">{fmt(grandCosto)}</td>
                      <td className={`r text-right px-2 py-1.5 font-mono font-bold ${grandUtil >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmt(grandUtil)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
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

// ─── Payer section ──────────────────────────────────
interface VatData {
  subtotal: number;
  vatAmount: number;
  total: number;
  enabled: boolean;
  percentage: number;
  label: string;
}

function PayerSection({
  label, accent, repairs, vatData,
}: {
  label: string;
  accent: 'blue' | 'violet';
  repairs: InspectionRepairItem[];
  vatData: VatData;
}) {
  const required = repairs.filter(r => r.payment_nature === 'required');
  const optional = repairs.filter(r => r.payment_nature === 'optional');

  const accentClasses = accent === 'blue'
    ? 'border-l-blue-600 bg-blue-50 text-blue-700'
    : 'border-l-violet-600 bg-violet-50 text-violet-700';

  if (repairs.length === 0) {
    return (
      <div className="mt-4">
        <div className={`border-l-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${accentClasses}`}>
          {label}
        </div>
        <p className="text-[11px] text-muted-foreground px-1 mt-2">Sin reparaciones asignadas.</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className={`border-l-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${accentClasses}`}>
        {label}
      </div>

      {required.length > 0 && <RepairGroup heading="Obligatorias" repairs={required} />}
      {optional.length > 0 && <RepairGroup heading="Opcionales" repairs={optional} />}

      {/* Totals */}
      <div className="mt-3 space-y-1 border-t border-border/60 pt-2 text-[11px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal {label.toLowerCase()}</span>
          <span className="font-mono font-semibold">
            {`$${vatData.subtotal.toLocaleString('es-CL', { minimumFractionDigits: 0 })}`}
          </span>
        </div>
        {vatData.enabled && (
          <div className="flex justify-between text-muted-foreground">
            <span>{vatData.label} {vatData.percentage}%</span>
            <span className="font-mono">
              {`$${vatData.vatAmount.toLocaleString('es-CL', { minimumFractionDigits: 0 })}`}
            </span>
          </div>
        )}
        <div className="flex justify-between font-bold text-[12px] border-t border-border/60 pt-1.5 mt-1">
          <span>Total {label.toLowerCase()}</span>
          <span className="font-mono">
            {`$${vatData.total.toLocaleString('es-CL', { minimumFractionDigits: 0 })}`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Repair group (obligatorias / opcionales) ────────
function RepairGroup({ heading, repairs }: { heading: string; repairs: InspectionRepairItem[] }) {
  return (
    <div className="mt-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1 px-1">
        {heading}
      </p>
      <table className="w-full">
        <thead>
          <tr className="bg-muted/30">
            <th className="text-left px-2 py-1 text-[10px] font-semibold">Reparación</th>
            <th className="r text-right px-2 py-1 text-[10px] font-semibold w-10">Cant.</th>
            <th className="r text-right px-2 py-1 text-[10px] font-semibold w-24">Precio unit.</th>
            <th className="r text-right px-2 py-1 text-[10px] font-semibold w-28">Total venta</th>
          </tr>
        </thead>
        <tbody>
          {repairs.map(r => (
            <tr key={r.id} className="border-b border-border/30">
              <td className="px-2 py-1.5">
                <div className="font-medium leading-snug">
                  {r.owner_friendly_name_snapshot || r.title_snapshot}
                </div>
                {r.description_snapshot && (
                  <div className="text-[10px] text-muted-foreground">{r.description_snapshot}</div>
                )}
                {!r.visible_to_owner && (
                  <div className="text-[9px] text-muted-foreground italic">Oculto al propietario</div>
                )}
              </td>
              <td className="r text-right px-2 py-1.5 font-mono">{r.quantity}</td>
              <td className="r text-right px-2 py-1.5 font-mono text-muted-foreground">
                {`$${r.unit_price.toLocaleString('es-CL', { minimumFractionDigits: 0 })}`}
              </td>
              <td className="r text-right px-2 py-1.5 font-mono font-semibold">
                {`$${(r.quantity * r.unit_price).toLocaleString('es-CL', { minimumFractionDigits: 0 })}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
