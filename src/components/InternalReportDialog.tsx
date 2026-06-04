/**
 * InternalReportDialog — confidential full quotation for the executive.
 *
 * Shows ALL repairs (regardless of visible_to_owner), grouped by section,
 * with both client price and contractor price columns, plus a summary table
 * by payer (owner / tenant) including margin/utility.
 *
 * The print button opens a clean print window (same approach as QuotationDialog).
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

const PAYER_LABEL: Record<string, string> = { owner: 'Propietario', tenant: 'Inquilino' };
const NATURE_LABEL: Record<string, string> = { required: 'Obligatoria', optional: 'Opcional' };

const PRINT_CSS = `
  *{box-sizing:border-box;}
  body{font-family:Inter,system-ui,sans-serif;padding:28px 32px;color:#111;font-size:11px;line-height:1.4;}
  h1{font-size:17px;margin:0 0 2px;font-weight:700;}
  .subtitle{color:#666;margin:0 0 4px;font-size:11px;}
  .confidential{color:#b91c1c;font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;}
  h2{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#3b4bdb;
     margin:16px 0 5px;padding-bottom:3px;border-bottom:1px solid #e5e7eb;}
  table{width:100%;border-collapse:collapse;margin-bottom:2px;}
  th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #f0f0f0;vertical-align:top;}
  th{background:#f6f7fb;font-weight:600;font-size:10px;}
  td.r,th.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  tfoot td{background:#f0f1f8;font-weight:700;}
  .grand td{border-top:2px solid #111;font-weight:700;}
  .badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:600;}
  .owner{color:#1d4ed8;background:#eff6ff;}
  .tenant{color:#7c3aed;background:#f5f3ff;}
  .req{color:#166534;background:#f0fdf4;}
  .opt{color:#854d0e;background:#fefce8;}
  .hidden-badge{color:#9ca3af;font-style:italic;font-size:9px;}
  .pos{color:#15803d;}.neg{color:#b91c1c;}
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

  const repairsBySection = useMemo(() => {
    const map: Record<string, InspectionRepairItem[]> = {};
    for (const r of allRepairs) {
      if (!map[r.inspection_section_id]) map[r.inspection_section_id] = [];
      map[r.inspection_section_id].push(r);
    }
    return map;
  }, [allRepairs]);

  const sectionsWithRepairs = useMemo(
    () => operationalSections.filter(s => (repairsBySection[s.id] ?? []).length > 0),
    [operationalSections, repairsBySection],
  );

  const totals = useMemo(() => {
    const byPayer = (payer: 'owner' | 'tenant') => {
      const items = allRepairs.filter(r => r.payer_role === payer);
      return {
        client: items.reduce((s, r) => s + r.quantity * r.unit_price, 0),
        contractor: items.reduce((s, r) => s + r.quantity * r.contractor_unit_price, 0),
      };
    };
    const owner = byPayer('owner');
    const tenant = byPayer('tenant');
    return {
      owner, tenant,
      grandClient: owner.client + tenant.client,
      grandContractor: owner.contractor + tenant.contractor,
    };
  }, [allRepairs]);

  const ownerVat = applyVat(totals.owner.client, taxConfig);
  const tenantVat = applyVat(totals.tenant.client, taxConfig);
  const vatEnabled = ownerVat.enabled;
  const vatLabel = ownerVat.label;
  const vatPct = ownerVat.percentage;

  const handlePrint = () => {
    const node = document.getElementById('internal-report-print-area');
    if (!node) return;
    const win = window.open('', '_blank', 'width=1050,height=1200');
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Informe Interno</DialogTitle>
        </DialogHeader>

        <div id="internal-report-print-area" className="space-y-1 text-[13px]">
          {/* Document header */}
          <div className="mb-4">
            <h1 className="text-body-lg font-bold leading-tight">
              {inspection.property_name ?? inspection.property_id}
            </h1>
            {inspection.address && (
              <p className="text-caption text-muted-foreground">{inspection.address}</p>
            )}
            <p className="text-tiny text-muted-foreground mt-0.5">
              {today} ·{' '}
              <span className="text-red-600 font-semibold uppercase tracking-wide text-[10px]">
                Confidencial — uso interno
              </span>
            </p>
          </div>

          {allRepairs.length === 0 ? (
            <p className="text-caption text-muted-foreground py-10 text-center">
              No hay reparaciones presupuestadas.
            </p>
          ) : (
            <>
              {/* ── Section-by-section breakdown ─────────── */}
              {sectionsWithRepairs.map(section => {
                const repairs = repairsBySection[section.id] ?? [];
                const secClient = repairs.reduce((s, r) => s + r.quantity * r.unit_price, 0);
                const secContractor = repairs.reduce((s, r) => s + r.quantity * r.contractor_unit_price, 0);

                return (
                  <div key={section.id} className="mt-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-primary bg-muted/50 px-2 py-1 border-l-2 border-primary">
                      {section.section_title}
                    </div>
                    <table className="w-full mt-0.5">
                      <thead>
                        <tr className="bg-muted/30">
                          <th className="text-left px-2 py-1.5 text-[10px] font-semibold">Reparación</th>
                          <th className="text-left px-2 py-1.5 text-[10px] font-semibold w-24">Pagador</th>
                          <th className="text-left px-2 py-1.5 text-[10px] font-semibold w-24">Nat.</th>
                          <th className="r text-right px-2 py-1.5 text-[10px] font-semibold w-10">Cant.</th>
                          <th className="r text-right px-2 py-1.5 text-[10px] font-semibold w-24">P. Cliente</th>
                          <th className="r text-right px-2 py-1.5 text-[10px] font-semibold w-28">Tot. Cliente</th>
                          <th className="r text-right px-2 py-1.5 text-[10px] font-semibold w-28 text-muted-foreground">P. Contratista</th>
                          <th className="r text-right px-2 py-1.5 text-[10px] font-semibold w-32 text-muted-foreground">Tot. Contratista</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repairs.map(r => (
                          <tr key={r.id} className="border-b border-border/40">
                            <td className="px-2 py-1.5">
                              <div className="font-medium leading-snug">
                                {r.owner_friendly_name_snapshot || r.title_snapshot}
                              </div>
                              {r.description_snapshot && (
                                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                                  {r.description_snapshot}
                                </div>
                              )}
                              {!r.visible_to_owner && (
                                <div className="text-[10px] text-muted-foreground italic mt-0.5">
                                  Oculto al propietario
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                r.payer_role === 'owner'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-violet-50 text-violet-700'
                              }`}>
                                {PAYER_LABEL[r.payer_role]}
                              </span>
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                r.payment_nature === 'required'
                                  ? 'bg-green-50 text-green-700'
                                  : 'bg-yellow-50 text-yellow-700'
                              }`}>
                                {NATURE_LABEL[r.payment_nature]}
                              </span>
                            </td>
                            <td className="r text-right px-2 py-1.5 font-mono">{r.quantity}</td>
                            <td className="r text-right px-2 py-1.5 font-mono">{fmt(r.unit_price)}</td>
                            <td className="r text-right px-2 py-1.5 font-mono font-semibold">
                              {fmt(r.quantity * r.unit_price)}
                            </td>
                            <td className="r text-right px-2 py-1.5 font-mono text-muted-foreground">
                              {fmt(r.contractor_unit_price)}
                            </td>
                            <td className="r text-right px-2 py-1.5 font-mono text-muted-foreground">
                              {fmt(r.quantity * r.contractor_unit_price)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/20">
                          <td colSpan={5} className="text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">
                            Subtotal sección
                          </td>
                          <td className="r text-right px-2 py-1.5 font-mono font-bold">{fmt(secClient)}</td>
                          <td />
                          <td className="r text-right px-2 py-1.5 font-mono font-bold text-muted-foreground">
                            {fmt(secContractor)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })}

              {/* ── Summary by payer ─────────────────────── */}
              <div className="mt-6 pt-4 border-t border-border">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Resumen por pagador
                </p>
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30">
                      <th className="text-left px-2 py-1.5 text-[10px] font-semibold">Pagador</th>
                      <th className="r text-right px-2 py-1.5 text-[10px] font-semibold">Total Cliente</th>
                      {vatEnabled && (
                        <th className="r text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">
                          {vatLabel} {vatPct}%
                        </th>
                      )}
                      {vatEnabled && (
                        <th className="r text-right px-2 py-1.5 text-[10px] font-semibold">
                          Total c/ {vatLabel}
                        </th>
                      )}
                      <th className="r text-right px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">
                        Total Contratista
                      </th>
                      <th className="r text-right px-2 py-1.5 text-[10px] font-semibold">Utilidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['owner', 'tenant'] as const).map(payer => {
                      const t = totals[payer];
                      const vatData = applyVat(t.client, taxConfig);
                      const utility = t.client - t.contractor;
                      return (
                        <tr key={payer} className="border-b border-border/50">
                          <td className="px-2 py-1.5 font-semibold">{PAYER_LABEL[payer]}</td>
                          <td className="r text-right px-2 py-1.5 font-mono">{fmt(t.client)}</td>
                          {vatEnabled && (
                            <td className="r text-right px-2 py-1.5 font-mono text-muted-foreground">
                              {fmt(vatData.vatAmount)}
                            </td>
                          )}
                          {vatEnabled && (
                            <td className="r text-right px-2 py-1.5 font-mono font-semibold">
                              {fmt(vatData.total)}
                            </td>
                          )}
                          <td className="r text-right px-2 py-1.5 font-mono text-muted-foreground">
                            {fmt(t.contractor)}
                          </td>
                          <td className={`r text-right px-2 py-1.5 font-mono font-bold ${utility >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {fmt(utility)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/20">
                      <td className="px-2 py-1.5 font-bold">Total general</td>
                      <td className="r text-right px-2 py-1.5 font-mono font-bold">{fmt(totals.grandClient)}</td>
                      {vatEnabled && (
                        <td className="r text-right px-2 py-1.5 font-mono font-bold text-muted-foreground">
                          {fmt(ownerVat.vatAmount + tenantVat.vatAmount)}
                        </td>
                      )}
                      {vatEnabled && (
                        <td className="r text-right px-2 py-1.5 font-mono font-bold">
                          {fmt(ownerVat.total + tenantVat.total)}
                        </td>
                      )}
                      <td className="r text-right px-2 py-1.5 font-mono font-bold text-muted-foreground">
                        {fmt(totals.grandContractor)}
                      </td>
                      <td className={`r text-right px-2 py-1.5 font-mono font-bold ${
                        totals.grandClient - totals.grandContractor >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {fmt(totals.grandClient - totals.grandContractor)}
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
