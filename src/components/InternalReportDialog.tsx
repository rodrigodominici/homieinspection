/**
 * InternalReportDialog — confidential full quotation for the executive.
 *
 * Structure:
 *  1. Header (property, date, CONFIDENTIAL)
 *  2. PROPIETARIO — obligatorias → opcionales → subtotal/IVA/total
 *  3. INQUILINO  — same
 *  4. RESUMEN POR CATEGORÍA — categoría | total venta | costo | utilidad
 *
 * Shows ALL repairs regardless of visible_to_owner.
 *
 * Key: the print window is built from a pure HTML string derived from
 * the data — NOT from node.innerHTML — so Tailwind classes are irrelevant
 * and the CSS in PRINT_CSS fully controls the output.
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
  contractorName?: string | null;
}

// ─── Formatting helpers ─────────────────────────────
const fmtNum = (n: number) =>
  `$${Number(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ─── Print CSS (no Tailwind dependency) ────────────
const PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Inter, system-ui, -apple-system, sans-serif;
    font-size: 11px; line-height: 1.5; color: #111;
    padding: 28px 36px;
  }
  /* ── Header ── */
  .doc-title { font-size: 18px; font-weight: 700; margin-bottom: 3px; }
  .doc-subtitle { font-size: 11px; color: #555; margin-bottom: 2px; }
  .doc-date { font-size: 10px; color: #777; margin-bottom: 6px; }
  .doc-contractor {
    font-size: 11px; color: #333; margin-bottom: 4px;
  }
  .doc-contractor strong { font-weight: 600; }
  .confidential {
    display: inline-block; font-size: 9px; font-weight: 700;
    letter-spacing: .08em; text-transform: uppercase;
    color: #b91c1c; background: #fff1f2;
    border: 1px solid #fca5a5; border-radius: 3px;
    padding: 1px 7px; margin-bottom: 18px;
  }
  /* ── Payer sections ── */
  .payer-header {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; padding: 5px 10px;
    border-left: 3px solid #3b4bdb; background: #eef0ff;
    color: #3b4bdb; margin-top: 18px; margin-bottom: 8px;
  }
  .payer-header.tenant {
    border-color: #7c3aed; background: #f5f3ff; color: #7c3aed;
  }
  .empty-payer { font-size: 11px; color: #777; padding: 4px 2px; margin-bottom: 12px; }
  /* ── Nature heading ── */
  .nature-heading {
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .08em; color: #666;
    margin-top: 10px; margin-bottom: 4px;
  }
  /* ── Repair tables ── */
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 7px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  th { background: #f6f7fb; font-weight: 600; font-size: 10px; }
  .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .repair-name { font-weight: 600; }
  .repair-desc { font-size: 10px; color: #666; }
  .repair-hidden { font-size: 9px; color: #aaa; font-style: italic; }
  /* ── Payer totals ── */
  .payer-totals { margin-top: 8px; padding-top: 6px; border-top: 1px solid #d1d5db; }
  .totals-row { display: flex; justify-content: space-between; padding: 2px 2px; }
  .totals-label { font-size: 11px; color: #444; }
  .totals-label.vat { color: #777; font-size: 10px; }
  .totals-label.grand { font-weight: 700; font-size: 12px; }
  .totals-value { font-size: 11px; font-variant-numeric: tabular-nums; font-weight: 600; }
  .totals-value.vat { color: #666; font-weight: 400; font-size: 10px; }
  .totals-value.grand { font-weight: 700; font-size: 12px; }
  .grand-line { border-top: 2px solid #111; margin-top: 5px; padding-top: 5px; }
  /* ── Category summary ── */
  .cat-header {
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .08em; color: #444;
    margin-top: 22px; margin-bottom: 6px;
    padding-bottom: 4px; border-bottom: 1px solid #ccc;
  }
  .cat-table th { background: #111; color: #fff; font-size: 10px; }
  .cat-table tfoot td { background: #eef0ff; font-weight: 700; border-top: 2px solid #111; }
  .pos { color: #15803d; }
  .neg { color: #b91c1c; }
  @page { margin: 16mm 14mm; }
`;

// ─── HTML builder (pure string — no DOM capture) ────
function buildPrintBody(
  inspection: Inspection,
  ownerRepairs: InspectionRepairItem[],
  tenantRepairs: InspectionRepairItem[],
  categoryRows: { cat: string; venta: number; costo: number; util: number }[],
  grandVenta: number,
  grandCosto: number,
  grandUtil: number,
  ownerVat: ReturnType<typeof applyVat>,
  tenantVat: ReturnType<typeof applyVat>,
  today: string,
  contractorName?: string | null,
): string {
  const esc = (s: string | null | undefined) =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const repairTable = (repairs: InspectionRepairItem[]) => {
    if (repairs.length === 0) return '';
    const rows = repairs.map(r => `
      <tr>
        <td>
          <div class="repair-name">${esc(r.owner_friendly_name_snapshot || r.title_snapshot)}</div>
          ${r.description_snapshot ? `<div class="repair-desc">${esc(r.description_snapshot)}</div>` : ''}
          ${!r.visible_to_owner ? `<div class="repair-hidden">Oculto al propietario</div>` : ''}
        </td>
        <td class="r">${r.quantity}</td>
        <td class="r">${fmtNum(r.unit_price)}</td>
        <td class="r">${fmtNum(r.quantity * r.unit_price)}</td>
      </tr>`).join('');
    return `
      <table>
        <thead>
          <tr>
            <th>Reparación</th>
            <th class="r" style="width:40px">Cant.</th>
            <th class="r" style="width:90px">Precio unit.</th>
            <th class="r" style="width:100px">Total venta</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  };

  const payerSection = (
    label: string,
    cls: string,
    repairs: InspectionRepairItem[],
    vatData: ReturnType<typeof applyVat>,
  ) => {
    const required = repairs.filter(r => r.payment_nature === 'required');
    const optional = repairs.filter(r => r.payment_nature === 'optional');
    const isEmpty = repairs.length === 0;
    return `
      <div class="payer-header ${cls}">${label}</div>
      ${isEmpty
        ? `<div class="empty-payer">Sin reparaciones asignadas.</div>`
        : `
          ${required.length > 0 ? `<div class="nature-heading">Obligatorias</div>${repairTable(required)}` : ''}
          ${optional.length > 0 ? `<div class="nature-heading">Opcionales</div>${repairTable(optional)}` : ''}
          <div class="payer-totals">
            <div class="totals-row">
              <span class="totals-label">Subtotal ${label.toLowerCase()}</span>
              <span class="totals-value">${fmtNum(vatData.subtotal)}</span>
            </div>
            ${vatData.enabled ? `
            <div class="totals-row">
              <span class="totals-label vat">${vatData.label} ${vatData.percentage}%</span>
              <span class="totals-value vat">${fmtNum(vatData.vatAmount)}</span>
            </div>` : ''}
            <div class="totals-row grand-line">
              <span class="totals-label grand">Total ${label.toLowerCase()}</span>
              <span class="totals-value grand">${fmtNum(vatData.total)}</span>
            </div>
          </div>`
      }`;
  };

  const catRows = categoryRows.map(row => `
    <tr>
      <td>${esc(row.cat)}</td>
      <td class="r">${fmtNum(row.venta)}</td>
      <td class="r" style="color:#555">${fmtNum(row.costo)}</td>
      <td class="r ${row.util >= 0 ? 'pos' : 'neg'}">${fmtNum(row.util)}</td>
    </tr>`).join('');

  return `
    <div class="doc-title">${esc(inspection.property_name ?? inspection.property_id)}</div>
    ${inspection.address ? `<div class="doc-subtitle">${esc(inspection.address)}</div>` : ''}
    <div class="doc-date">${today}</div>
    ${contractorName ? `<div class="doc-contractor"><strong>Contratista:</strong> ${esc(contractorName)}</div>` : ''}
    <div class="confidential">Confidencial — uso interno</div>

    ${payerSection('Propietario', '', ownerRepairs, ownerVat)}
    ${payerSection('Inquilino', 'tenant', tenantRepairs, tenantVat)}

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
      <tbody>${catRows}</tbody>
      <tfoot>
        <tr>
          <td>Total general</td>
          <td class="r">${fmtNum(grandVenta)}</td>
          <td class="r" style="color:#555">${fmtNum(grandCosto)}</td>
          <td class="r ${grandUtil >= 0 ? 'pos' : 'neg'}">${fmtNum(grandUtil)}</td>
        </tr>
      </tfoot>
    </table>`;
}

// ─── Component ──────────────────────────────────────
export function InternalReportDialog({
  open, onOpenChange, inspection, operationalSections, allRepairs, contractorName,
}: InternalReportDialogProps) {
  const [taxConfig, setTaxConfig] = useState<MarketTaxSettings | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchTaxConfig(inspection.market).then(setTaxConfig);
  }, [open, inspection.market]);

  const { ownerRepairs, tenantRepairs } = useMemo(() => ({
    ownerRepairs: allRepairs.filter(r => r.payer_role === 'owner'),
    tenantRepairs: allRepairs.filter(r => r.payer_role === 'tenant'),
  }), [allRepairs]);

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

  const ownerVat = applyVat(ownerRepairs.reduce((s, r) => s + r.quantity * r.unit_price, 0), taxConfig);
  const tenantVat = applyVat(tenantRepairs.reduce((s, r) => s + r.quantity * r.unit_price, 0), taxConfig);

  const today = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

  const handlePrint = () => {
    const body = buildPrintBody(
      inspection, ownerRepairs, tenantRepairs,
      categoryRows, grandVenta, grandCosto, grandUtil,
      ownerVat, tenantVat, today, contractorName,
    );
    const title = `Informe Interno — ${inspection.property_name ?? inspection.property_id}`;
    const win = window.open('', '_blank', 'width=960,height=1200');
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">` +
      `<title>${title}</title><style>${PRINT_CSS}</style></head>` +
      `<body>${body}</body></html>`
    );
    win.document.close();
    setTimeout(() => { win.print(); }, 400);
  };

  // ── Preview (React render — visual only, not used for print) ──
  const renderRepairGroup = (repairs: InspectionRepairItem[], heading: string) => {
    if (repairs.length === 0) return null;
    return (
      <div className="mt-3">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{heading}</p>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left px-2 py-1 font-semibold text-[10px]">Reparación</th>
              <th className="text-right px-2 py-1 font-semibold text-[10px] w-10">Cant.</th>
              <th className="text-right px-2 py-1 font-semibold text-[10px] w-24">Precio unit.</th>
              <th className="text-right px-2 py-1 font-semibold text-[10px] w-28">Total venta</th>
            </tr>
          </thead>
          <tbody>
            {repairs.map(r => (
              <tr key={r.id} className="border-b border-border/30">
                <td className="px-2 py-1.5">
                  <div className="font-semibold leading-snug">{r.owner_friendly_name_snapshot || r.title_snapshot}</div>
                  {r.description_snapshot && <div className="text-[10px] text-muted-foreground">{r.description_snapshot}</div>}
                  {!r.visible_to_owner && <div className="text-[9px] text-muted-foreground italic">Oculto al propietario</div>}
                </td>
                <td className="text-right px-2 py-1.5 font-mono">{r.quantity}</td>
                <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">{fmtNum(r.unit_price)}</td>
                <td className="text-right px-2 py-1.5 font-mono font-semibold">{fmtNum(r.quantity * r.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderPayerSection = (
    label: string,
    accent: 'blue' | 'violet',
    repairs: InspectionRepairItem[],
    vatData: ReturnType<typeof applyVat>,
  ) => {
    const accentCls = accent === 'blue'
      ? 'border-l-blue-600 bg-blue-50 text-blue-700'
      : 'border-l-violet-600 bg-violet-50 text-violet-700';
    const required = repairs.filter(r => r.payment_nature === 'required');
    const optional = repairs.filter(r => r.payment_nature === 'optional');
    return (
      <div className="mt-5">
        <div className={`border-l-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${accentCls}`}>
          {label}
        </div>
        {repairs.length === 0
          ? <p className="text-[11px] text-muted-foreground px-1 mt-2">Sin reparaciones asignadas.</p>
          : (
            <>
              {renderRepairGroup(required, 'Obligatorias')}
              {renderRepairGroup(optional, 'Opcionales')}
              <div className="mt-3 pt-2 border-t border-border/60 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal {label.toLowerCase()}</span>
                  <span className="font-mono font-semibold">{fmtNum(vatData.subtotal)}</span>
                </div>
                {vatData.enabled && (
                  <div className="flex justify-between text-muted-foreground text-[10px]">
                    <span>{vatData.label} {vatData.percentage}%</span>
                    <span className="font-mono">{fmtNum(vatData.vatAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[12px] border-t pt-1.5">
                  <span>Total {label.toLowerCase()}</span>
                  <span className="font-mono">{fmtNum(vatData.total)}</span>
                </div>
              </div>
            </>
          )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Informe Interno</DialogTitle>
        </DialogHeader>

        {/* ── In-app preview ── */}
        <div className="space-y-1 text-[12px]">
          <div>
            <h1 className="text-body-lg font-bold leading-tight">{inspection.property_name ?? inspection.property_id}</h1>
            {inspection.address && <p className="text-caption text-muted-foreground">{inspection.address}</p>}
            <p className="text-[11px] text-muted-foreground mt-0.5">{today}</p>
            {contractorName && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                <span className="font-semibold text-foreground">Contratista:</span> {contractorName}
              </p>
            )}
            <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-widest text-red-600 border border-red-300 bg-red-50 px-2 py-0.5 rounded">
              Confidencial — uso interno
            </span>
          </div>

          {allRepairs.length === 0
            ? <p className="text-caption text-muted-foreground py-10 text-center">No hay reparaciones presupuestadas.</p>
            : (
              <>
                {renderPayerSection('Propietario', 'blue', ownerRepairs, ownerVat)}
                {renderPayerSection('Inquilino', 'violet', tenantRepairs, tenantVat)}

                {/* Category summary */}
                <div className="mt-6 pt-4 border-t border-border">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Resumen por categoría</p>
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
                          <td className={`text-right px-2 py-1.5 font-mono font-semibold ${row.util >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {fmtNum(row.util)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30">
                        <td className="px-2 py-1.5 font-bold">Total general</td>
                        <td className="text-right px-2 py-1.5 font-mono font-bold">{fmtNum(grandVenta)}</td>
                        <td className="text-right px-2 py-1.5 font-mono font-bold text-muted-foreground">{fmtNum(grandCosto)}</td>
                        <td className={`text-right px-2 py-1.5 font-mono font-bold ${grandUtil >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {fmtNum(grandUtil)}
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
