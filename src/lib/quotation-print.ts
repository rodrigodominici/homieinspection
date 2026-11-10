// Shared printable layout so quotation PDFs (live and historical) look the same.
export const escHtml = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** File name used by "Guardar como PDF": title + property address. */
export function quotationFileTitle(title: string, address?: string | null, propertyName?: string | null) {
  const place = (address || propertyName || '').trim();
  return (place ? `${title} - ${place}` : title).replace(/[\\/:*?"<>|#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface PrintRow { name: string; description?: string | null; badges: { text: string; kind: 'required' | 'optional' }[]; quantity: string | number; price: string; subtotal: string; notes?: string[] }
export interface PrintGroup { title: string; rows: PrintRow[]; subtotal: string }
export interface PrintTotal { label: string; value: string; kind?: 'optional' | 'grand' }

export const QUOTATION_PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, system-ui, sans-serif; font-size: 11px; color: #111; padding: 28px 36px; line-height: 1.5; }
  .doc-title { font-size: 18px; font-weight: 700; margin-bottom: 3px; }
  .doc-subtitle { font-size: 11px; color: #555; margin-bottom: 2px; }
  .doc-date { font-size: 10px; color: #777; margin-bottom: 18px; }
  .section-header { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; padding: 5px 10px; border-left: 3px solid #525EA2; background: #EEF1F8; color: #525EA2; margin-top: 16px; margin-bottom: 6px; }
  table.section-table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 7px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
  th { background: #f6f7fb; font-weight: 600; font-size: 10px; }
  tr { break-inside: avoid; }
  tfoot td { border-top: 1px solid #111; font-weight: 600; background: #fafafa; }
  .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .repair-name { font-weight: 600; }
  .repair-desc, .repair-note { font-size: 10px; color: #666; margin-top: 1px; }
  .badge { display: inline-block; font-size: 9px; padding: 1px 6px; border-radius: 3px; margin-top: 3px; margin-right: 4px; font-weight: 600; }
  .badge-required { background: #EEF1F8; color: #525EA2; border: 1px solid #c7cde6; }
  .badge-optional { background: #fff; color: #666; border: 1px solid #d1d5db; }
  .totals { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ccc; }
  .totals-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; }
  .totals-row.optional { font-style: italic; color: #666; }
  .totals-label { color: #555; }
  .totals-value { font-variant-numeric: tabular-nums; font-weight: 600; }
  .grand-line { border-top: 2px solid #111; margin-top: 6px; padding-top: 6px; }
  .grand-line .totals-label, .grand-line .totals-value { font-weight: 700; font-size: 13px; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { margin: 16mm 14mm; }
`;

export function buildQuotationHtml(doc: { title: string; fileTitle: string; propertyName?: string | null; address?: string | null; dateLabel: string; extraSubtitles?: string[]; groups: PrintGroup[]; totals: PrintTotal[]; footer?: string }) {
  const sections = doc.groups.map(g => `
    <div class="section-header">${escHtml(g.title)}</div>
    <table class="section-table">
      <thead><tr><th>Reparación</th><th class="r" style="width:50px">Cant.</th><th class="r" style="width:100px">Precio</th><th class="r" style="width:110px">Subtotal</th></tr></thead>
      <tbody>${g.rows.map(r => `<tr><td>
        <div class="repair-name">${escHtml(r.name)}</div>
        ${r.description ? `<div class="repair-desc">${escHtml(r.description)}</div>` : ''}
        ${r.badges.map(b => `<span class="badge badge-${b.kind}">${escHtml(b.text)}</span>`).join('')}
        ${(r.notes ?? []).map(n => `<div class="repair-note">${escHtml(n)}</div>`).join('')}
      </td><td class="r">${escHtml(String(r.quantity))}</td><td class="r">${escHtml(r.price)}</td><td class="r">${escHtml(r.subtotal)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3" class="r">Subtotal sección</td><td class="r">${escHtml(g.subtotal)}</td></tr></tfoot>
    </table>`).join('');
  const totals = `<div class="totals">${doc.totals.map(t => `<div class="totals-row ${t.kind === 'optional' ? 'optional' : t.kind === 'grand' ? 'grand-line' : ''}"><span class="totals-label">${escHtml(t.label)}</span><span class="totals-value">${escHtml(t.value)}</span></div>`).join('')}</div>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(doc.fileTitle)}</title><style>${QUOTATION_PRINT_CSS}</style></head><body>
    <div class="doc-title">${escHtml(doc.title)}</div>
    ${doc.propertyName ? `<div class="doc-subtitle">${escHtml(doc.propertyName)}</div>` : ''}
    ${doc.address ? `<div class="doc-subtitle">${escHtml(doc.address)}</div>` : ''}
    ${(doc.extraSubtitles ?? []).map(s => `<div class="doc-subtitle">${escHtml(s)}</div>`).join('')}
    <div class="doc-date">${escHtml(doc.dateLabel)}</div>
    ${sections}${totals}
    ${doc.footer ? `<p style="margin-top:10px">${escHtml(doc.footer)}</p>` : ''}
  </body></html>`;
}

/** Must be called synchronously from a click handler (popup blockers). */
export function openPrintWindow(): Window | null {
  return window.open('', '_blank', 'width=900,height=1100');
}

export function writeAndPrint(win: Window, html: string) {
  win.document.open(); win.document.write(html); win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}
