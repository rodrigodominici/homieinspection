import { snapshotRepairs, snapshotTotals, historicalAmount, decisionLabel, type QuotationSnapshot, type HistoricalDecision } from './quotation-history';
import { buildQuotationHtml, openPrintWindow, quotationFileTitle, writeAndPrint, type PrintGroup, type PrintTotal } from './quotation-print';

// Same layout as the live quotation PDF; the browser's "Guardar como PDF" uses the title (with address) as file name.
export async function downloadQuotationHistory(version: { version_number: number; created_at: string; published_by_name: string | null; normalized_payload: QuotationSnapshot; decisions: HistoricalDecision[]; document_title?: string; file_name?: string }) {
  const win = openPrintWindow();
  if (!win) throw new Error('El navegador bloqueó la ventana. Permití ventanas emergentes e intentá de nuevo.');
  const payload = version.normalized_payload;
  const totals = snapshotTotals(payload);
  const currency = payload.tax_config?.currency ?? (payload.property?.market === 'MX' ? 'MXN' : 'CLP');
  const money = (n: number) => `${currency} ${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })}`;
  const decisions = new Map(version.decisions.map(d => [d.repair_item_id, d]));
  const groupMap = new Map<string, PrintGroup & { sum: number }>();
  for (const r of snapshotRepairs(payload)) {
    const d = r.id ? decisions.get(r.id) : undefined;
    const g = groupMap.get(r.section) ?? { title: r.section, rows: [], subtotal: '', sum: 0 };
    g.sum += historicalAmount(r);
    const notes = [r.is_pending_quote ? 'Pendiente de precio' : `Decisión: ${decisionLabel(d?.decision)}`];
    if (d?.comment) notes.push(`Comentario: ${d.comment}`);
    if (d?.submitter_name) notes.push(`Respondió: ${d.submitter_name}${d.submitted_at ? ` - ${new Date(d.submitted_at).toLocaleString('es-CL')}` : ''}`);
    g.rows.push({
      name: r.name ?? 'Partida', description: r.description,
      badges: [
        { text: r.payment_nature === 'optional' ? 'Opcional' : 'Recomendada', kind: r.payment_nature === 'optional' ? 'optional' : 'required' },
        { text: r.payer_role === 'tenant' ? 'Inquilino' : 'Propietario', kind: 'optional' },
      ],
      quantity: `${r.quantity ?? 0}${r.unit ? ` ${r.unit}` : ''}`,
      price: r.is_pending_quote ? 'Por cotizar' : money(Number(r.unit_price ?? 0)),
      subtotal: r.is_pending_quote ? 'Por cotizar' : money(historicalAmount(r)),
      notes,
    });
    groupMap.set(r.section, g);
  }
  const groups = [...groupMap.values()].map(g => ({ ...g, subtotal: money(g.sum) }));
  const rows: PrintTotal[] = [
    { label: 'Subtotal propietario', value: money(totals.owner) },
    { label: 'Subtotal inquilino', value: money(totals.tenant) },
  ];
  if (totals.discount > 0) rows.push({ label: `Descuento comercial${payload.discount?.reason ? ` · ${payload.discount.reason}` : ''}`, value: `−${money(totals.discount)}` });
  if (totals.tax > 0) rows.push({ label: `${payload.tax_config?.label ?? 'Impuesto'}${payload.tax_config?.percentage ? ` ${payload.tax_config.percentage}%` : ''}`, value: money(totals.tax) });
  rows.push({ label: 'Total', value: money(totals.total), kind: 'grand' });
  const title = version.document_title ?? `Cotización v${version.version_number}`;
  const address = payload.property?.address;
  const html = buildQuotationHtml({
    title, fileTitle: quotationFileTitle(title, address, payload.property?.property_name),
    propertyName: payload.property?.property_name ?? payload.property?.property_id,
    address, dateLabel: `Publicada: ${new Date(version.created_at).toLocaleString('es-CL')}`,
    extraSubtitles: [`Responsable: ${version.published_by_name ?? 'No registrado'}`],
    groups, totals: rows,
  });
  writeAndPrint(win, html);
}
