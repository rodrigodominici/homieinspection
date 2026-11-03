import { PDFDocument, StandardFonts } from 'pdf-lib';
import { snapshotRepairs, snapshotTotals, historicalAmount, decisionLabel, type QuotationSnapshot, type HistoricalDecision } from './quotation-history';

export async function downloadQuotationHistory(version: { version_number: number; created_at: string; published_by_name: string | null; normalized_payload: QuotationSnapshot; decisions: HistoricalDecision[]; document_title?: string; file_name?: string }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const payload = version.normalized_payload;
  const totals = snapshotTotals(payload);
  const currency = payload.tax_config?.currency ?? (payload.property?.market === 'MX' ? 'MXN' : 'CLP');
  const money = (n: number) => `${currency} ${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })}`;
  const lines = [
    version.document_title ?? `Homie - Cotización v${version.version_number}`,
    payload.property?.property_name ?? payload.property?.property_id ?? 'Inmueble',
    payload.property?.address ?? '',
    `Publicada: ${new Date(version.created_at).toLocaleString('es-CL')}`,
    `Responsable: ${version.published_by_name ?? 'No registrado'}`, '',
  ];
  const decisions = new Map(version.decisions.map(d => [d.repair_item_id, d]));
  for (const r of snapshotRepairs(payload)) {
    const d = r.id ? decisions.get(r.id) : undefined;
    lines.push(`${r.section} - ${r.name ?? 'Partida'}`);
    if (r.description) lines.push(r.description);
    lines.push(`${r.quantity ?? 0} ${r.unit ?? ''} | ${r.is_pending_quote ? 'Por cotizar' : money(Number(r.unit_price ?? 0))} | ${r.is_pending_quote ? 'Por cotizar' : money(historicalAmount(r))}`);
    lines.push(`${r.payer_role === 'tenant' ? 'Inquilino' : 'Propietario'} | ${r.payment_nature === 'optional' ? 'Opcional' : 'Recomendada'} | ${r.is_pending_quote ? 'Pendiente de precio' : decisionLabel(d?.decision)}`);
    if (d?.comment) lines.push(`Comentario: ${d.comment}`);
    if (d?.submitter_name) lines.push(`Respondió: ${d.submitter_name}${d.submitted_at ? ` - ${new Date(d.submitted_at).toLocaleString('es-CL')}` : ''}`);
    lines.push('');
  }
  lines.push(`Subtotal propietario: ${money(totals.owner)}`, `Subtotal inquilino: ${money(totals.tenant)}`,
    `Descuento: ${money(totals.discount)}`, `Impuesto: ${money(totals.tax)}`, `Total: ${money(totals.total)}`);
  if (payload.discount?.reason) lines.push(`Motivo descuento: ${payload.discount.reason}`);
  let page = pdf.addPage([595, 842]);
  let y = 794;
  const clean = (text: string) => text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '-');
  for (const line of lines) {
    const words = clean(line).split(' ');
    let wrapped = '';
    const render = (text: string) => {
      if (y < 48) { page = pdf.addPage([595, 842]); y = 794; }
      page.drawText(text, { x: 42, y, size: 10, font }); y -= 16;
    };
    for (const word of words) {
      const candidate = wrapped ? `${wrapped} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, 10) > 510 && wrapped) { render(wrapped); wrapped = word; }
      else wrapped = candidate;
    }
    render(wrapped);
  }
  const bytes = await pdf.save();
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = version.file_name ?? `cotizacion-v${version.version_number}.pdf`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}