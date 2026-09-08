/**
 * Genera el informe de check-in en PDF (cliente, con pdf-lib).
 *
 * Contenido: portada con datos del inmueble e inquilino, secciones con sus
 * respuestas y observación final, todas las fotos visibles y la firma del
 * inquilino si existe.
 *
 * Notas de implementación:
 *  - Se usan las fuentes estándar (Helvetica) con codificación WinAnsi, que
 *    cubre los acentos del español. Todo el texto pasa por `winAnsi()` para
 *    descartar caracteres fuera de Latin-1 (pdf-lib lanzaría error).
 *  - Las fotos se descargan por URL firmada con transformación (ancho 900,
 *    calidad 70) para mantener el archivo bien por debajo del límite de 50 MB.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';

/* ───────────────────────────── Constantes ──────────────────────────────── */

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 48;
const CONTENT_W = A4.w - MARGIN * 2;
const BRAND = rgb(0x52 / 255, 0x5e / 255, 0xa2 / 255); // Homie indigo #525EA2
const TEXT = rgb(0.13, 0.14, 0.18);
const MUTED = rgb(0.42, 0.44, 0.5);
const LINE = rgb(0.87, 0.88, 0.92);

const PHOTO_TRANSFORM = { width: 900, quality: 70, resize: 'contain' as const };
const PHOTO_CONCURRENCY = 6;

/* ────────────────────────────── Utilidades ─────────────────────────────── */

const MAP: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
  '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u00a0': ' ',
  '\u2022': '-', '\u20a9': ' ', '\u2192': '->',
};

/** Deja solo caracteres representables en WinAnsi (Latin-1). */
export function winAnsi(input: string | null | undefined): string {
  if (!input) return '';
  let out = '';
  for (const ch of String(input)) {
    if (MAP[ch]) { out += MAP[ch]; continue; }
    const code = ch.codePointAt(0) ?? 0;
    if (code === 10 || code === 13 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      out += ch;
    } else {
      out += ' ';
    }
  }
  return out;
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'.replace('—', '-');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
};

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
};

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(''); continue; }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        // Palabra más larga que el ancho: se corta por caracteres.
        let chunk = word;
        while (font.widthOfTextAtSize(chunk, size) > maxWidth && chunk.length > 1) {
          let cut = chunk.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(chunk.slice(0, cut), size) > maxWidth) cut -= 1;
          lines.push(chunk.slice(0, cut));
          chunk = chunk.slice(cut);
        }
        current = chunk;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/* ───────────────────────────── Tipos de datos ──────────────────────────── */

export interface CheckinPdfPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
  visible_to_owner?: boolean | null;
}

export interface CheckinPdfField {
  field_label: string;
  value_text: string | null;
  group_key?: string | null;
}

export interface CheckinPdfSection {
  id: string;
  title: string;
  final_observation: string | null;
  fields: CheckinPdfField[];
  photos: CheckinPdfPhoto[];
}

export interface CheckinPdfInput {
  propertyName: string;
  propertyId: string;
  address: string | null;
  marketLabel: string;
  propertyType: string | null;
  tenantName: string | null;
  tenantEmail: string | null;
  inspectorName: string | null;
  executiveName: string | null;
  deliveryDate: string | null;
  versionNumber: number;
  generatedAt: string;
  sections: CheckinPdfSection[];
  signature: { signer_name: string | null; signature_data: string | null; signed_at: string | null } | null;
  onProgress?: (done: number, total: number) => void;
}

/* ─────────────────────────── Descarga de fotos ─────────────────────────── */

async function fetchPhotoBytes(storagePath: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await supabase.storage
      .from('inspection-photos')
      .createSignedUrl(storagePath, 600, { transform: PHOTO_TRANSFORM });
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function loadAllPhotos(
  paths: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, Uint8Array>> {
  const result = new Map<string, Uint8Array>();
  let done = 0;
  for (let i = 0; i < paths.length; i += PHOTO_CONCURRENCY) {
    const chunk = paths.slice(i, i + PHOTO_CONCURRENCY);
    await Promise.all(chunk.map(async (p) => {
      const bytes = await fetchPhotoBytes(p);
      if (bytes) result.set(p, bytes);
      done += 1;
      onProgress?.(done, paths.length);
    }));
  }
  return result;
}

/* ─────────────────────────── Motor de layout ───────────────────────────── */

class Doc {
  page!: PDFPage;
  y = 0;
  pageIndex = 0;

  constructor(
    private pdf: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
    private folio: string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.pageIndex += 1;
    // Franja superior de marca
    this.page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: BRAND });
    this.page.drawText(winAnsi(this.folio), {
      x: MARGIN, y: 28, size: 7.5, font: this.regular, color: MUTED,
    });
    this.page.drawText(String(this.pageIndex), {
      x: A4.w - MARGIN - 12, y: 28, size: 7.5, font: this.regular, color: MUTED,
    });
    this.y = A4.h - 60;
  }

  ensure(height: number) {
    if (this.y - height < 56) this.newPage();
  }

  gap(h: number) {
    this.y -= h;
  }

  text(raw: string, opts: { size?: number; bold?: boolean; color?: any; indent?: number; lineGap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const indent = opts.indent ?? 0;
    const lines = wrap(winAnsi(raw), font, size, CONTENT_W - indent);
    const lh = size * 1.35 + (opts.lineGap ?? 0);
    for (const line of lines) {
      this.ensure(lh);
      this.page.drawText(line, {
        x: MARGIN + indent, y: this.y - size, size, font, color: opts.color ?? TEXT,
      });
      this.y -= lh;
    }
  }

  rule(color = LINE) {
    this.ensure(10);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 4 },
      end: { x: A4.w - MARGIN, y: this.y - 4 },
      thickness: 0.7,
      color,
    });
    this.y -= 12;
  }

  sectionHeader(index: number, title: string) {
    this.ensure(46);
    const h = 24;
    this.page.drawRectangle({
      x: MARGIN, y: this.y - h, width: CONTENT_W, height: h,
      color: rgb(0.933, 0.945, 0.973), // #EEF1F8
    });
    this.page.drawRectangle({ x: MARGIN, y: this.y - h, width: 3, height: h, color: BRAND });
    this.page.drawText(winAnsi(`${index}. ${title}`), {
      x: MARGIN + 12, y: this.y - h + 8, size: 11, font: this.bold, color: BRAND,
    });
    this.y -= h + 10;
  }

  keyValue(label: string, value: string) {
    const size = 9.5;
    const labelW = 150;
    const lines = wrap(winAnsi(value || '-'), this.regular, size, CONTENT_W - labelW - 8);
    const lh = size * 1.35;
    this.ensure(lh * lines.length + 2);
    this.page.drawText(winAnsi(label), {
      x: MARGIN, y: this.y - size, size, font: this.bold, color: MUTED,
    });
    lines.forEach((line, i) => {
      this.page.drawText(line, {
        x: MARGIN + labelW, y: this.y - size - i * lh, size, font: this.regular, color: TEXT,
      });
    });
    this.y -= lh * lines.length + 2;
  }

  get pdfDoc() { return this.pdf; }
  get fontRegular() { return this.regular; }
}

/* ──────────────────────────── Generación ───────────────────────────────── */

export async function buildCheckinReportPdf(input: CheckinPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(`Informe de entrega - ${input.propertyName}`));
  pdf.setSubject('Informe de check-in');
  pdf.setCreator('Homie Inspection');

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const allPhotos = input.sections.flatMap((s) => s.photos);
  const photoBytes = await loadAllPhotos(
    Array.from(new Set(allPhotos.map((p) => p.storage_path))),
    input.onProgress,
  );

  const folio = `Homie Inspection · ${input.propertyId} · v${input.versionNumber}`;
  const doc = new Doc(pdf, regular, bold, folio);

  /* Portada */
  doc.text('Informe de entrega', { size: 22, bold: true, color: BRAND });
  doc.gap(2);
  doc.text('Check-in de arriendo', { size: 11, color: MUTED });
  doc.gap(14);
  doc.text(input.propertyName || input.propertyId, { size: 15, bold: true });
  if (input.address) doc.text(input.address, { size: 10, color: MUTED });
  doc.gap(10);
  doc.rule();

  doc.keyValue('Código de inmueble', input.propertyId);
  doc.keyValue('Tipo de inmueble', input.propertyType || '-');
  doc.keyValue('País', input.marketLabel);
  doc.keyValue('Fecha de entrega', fmtDate(input.deliveryDate));
  doc.keyValue('Inquilino', input.tenantName || '-');
  if (input.tenantEmail) doc.keyValue('Correo del inquilino', input.tenantEmail);
  doc.keyValue('Receptor / inspector', input.inspectorName || '-');
  doc.keyValue('Ejecutivo responsable', input.executiveName || '-');
  doc.keyValue('Versión del informe', `v${input.versionNumber}`);
  doc.keyValue('Generado', fmtDateTime(input.generatedAt));
  doc.gap(6);
  doc.rule();
  doc.text(
    'Este documento registra el estado del inmueble al momento de la entrega, con las observaciones del receptor y el respaldo fotográfico de cada espacio.',
    { size: 9, color: MUTED },
  );
  doc.gap(10);

  /* Secciones */
  let index = 0;
  for (const section of input.sections) {
    index += 1;
    doc.sectionHeader(index, section.title);

    const answered = section.fields.filter((f) => (f.value_text ?? '').trim().length > 0);
    if (answered.length) {
      for (const f of answered) doc.keyValue(f.field_label, f.value_text ?? '');
      doc.gap(4);
    }

    if (section.final_observation?.trim()) {
      doc.text('Observación final', { size: 9, bold: true, color: MUTED });
      doc.text(section.final_observation.trim(), { size: 10 });
      doc.gap(4);
    }

    if (!answered.length && !section.final_observation?.trim() && section.photos.length === 0) {
      doc.text('Sin registros en esta sección.', { size: 9, color: MUTED });
      doc.gap(4);
    }

    /* Fotos: grilla 2x2 */
    const photos = section.photos;
    if (photos.length) {
      doc.text(`Fotos (${photos.length})`, { size: 9, bold: true, color: MUTED });
      doc.gap(4);

      const cellW = (CONTENT_W - 12) / 2;
      const cellH = 150;
      const captionH = 12;

      for (let i = 0; i < photos.length; i += 2) {
        const row = photos.slice(i, i + 2);
        doc.ensure(cellH + captionH + 10);
        const rowTop = doc.y;

        for (let c = 0; c < row.length; c++) {
          const photo = row[c];
          const x = MARGIN + c * (cellW + 12);
          const bytes = photoBytes.get(photo.storage_path);

          if (bytes) {
            let image: any = null;
            try {
              image = await pdf.embedJpg(bytes);
            } catch {
              try { image = await pdf.embedPng(bytes); } catch { image = null; }
            }
            if (image) {
              const scale = Math.min(cellW / image.width, cellH / image.height);
              const w = image.width * scale;
              const h = image.height * scale;
              doc.page.drawImage(image, {
                x: x + (cellW - w) / 2,
                y: rowTop - cellH + (cellH - h) / 2,
                width: w,
                height: h,
              });
            } else {
              doc.page.drawText('Foto no disponible', {
                x: x + 6, y: rowTop - cellH / 2, size: 8, font: regular, color: MUTED,
              });
            }
          } else {
            doc.page.drawRectangle({
              x, y: rowTop - cellH, width: cellW, height: cellH,
              borderColor: LINE, borderWidth: 0.7,
            });
            doc.page.drawText('Foto no disponible', {
              x: x + 8, y: rowTop - cellH / 2, size: 8, font: regular, color: MUTED,
            });
          }

          if (photo.caption) {
            const caption = wrap(winAnsi(photo.caption), regular, 7.5, cellW)[0] ?? '';
            doc.page.drawText(caption, {
              x, y: rowTop - cellH - 9, size: 7.5, font: regular, color: MUTED,
            });
          }
        }

        doc.y = rowTop - cellH - captionH - 8;
      }
      doc.gap(2);
    }

    doc.gap(6);
    doc.rule();
  }

  /* Firma */
  doc.ensure(150);
  doc.text('Firma del inquilino', { size: 12, bold: true, color: BRAND });
  doc.gap(6);
  if (input.signature?.signature_data) {
    const raw = input.signature.signature_data;
    const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
    let img: any = null;
    try {
      img = raw.includes('image/jpeg') ? await pdf.embedJpg(base64) : await pdf.embedPng(base64);
    } catch {
      try { img = await pdf.embedPng(base64); } catch { img = null; }
    }
    if (img) {
      const maxW = 240;
      const scale = Math.min(maxW / img.width, 90 / img.height);
      doc.ensure(img.height * scale + 30);
      doc.page.drawImage(img, {
        x: MARGIN,
        y: doc.y - img.height * scale,
        width: img.width * scale,
        height: img.height * scale,
      });
      doc.y -= img.height * scale + 8;
    }
    doc.text(input.signature.signer_name || 'Inquilino', { size: 10, bold: true });
    doc.text(`Firmado el ${fmtDateTime(input.signature.signed_at)}`, { size: 9, color: MUTED });
  } else {
    doc.text('Sin firma registrada del inquilino.', { size: 9.5, color: MUTED });
  }

  return await pdf.save();
}
