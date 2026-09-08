/**
 * Generación, almacenamiento y descarga del informe de check-in en PDF.
 *
 * El PDF se arma en el navegador (pdf-lib), se guarda en el bucket privado
 * `inspection-reports` y se registra en `inspection_report_files`. La descarga
 * usa una URL firmada de corta duración.
 */
import { supabase } from '@/integrations/supabase/client';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import { marketLabel } from '@/lib/markets';
import { buildCheckinReportPdf, type CheckinPdfSection } from '../pdf/checkinReportPdf';
import type { Inspection } from '@/lib/types';

export const REPORTS_BUCKET = 'inspection-reports';

export interface ReportFileRecord {
  id: string;
  inspection_id: string;
  report_version_id: string | null;
  audience: string;
  storage_path: string;
  bytes: number;
  created_at: string;
  generated_by: string | null;
}

/** Último PDF generado para una inspección (o null si no hay). */
export async function getLatestReportFile(inspectionId: string): Promise<ReportFileRecord | null> {
  const { data, error } = await supabase
    .from('inspection_report_files')
    .select('id, inspection_id, report_version_id, audience, storage_path, bytes, created_at, generated_by')
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ReportFileRecord | null;
}

/** URL firmada (5 min) para descargar un PDF ya generado. */
export async function getReportDownloadUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(storagePath, 300, { download: storagePath.split('/').pop() ?? 'informe.pdf' });
  if (error || !data?.signedUrl) throw error ?? new Error('No se pudo firmar la descarga');
  return data.signedUrl;
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

/**
 * Arma el PDF de check-in con los datos actuales de la inspección, lo sube al
 * bucket privado y registra el archivo. Devuelve el registro creado.
 */
export async function generateCheckinReportPdf(params: {
  inspectionId: string;
  profileId?: string | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<ReportFileRecord> {
  const { inspectionId, profileId, onProgress } = params;

  const [inspRes, sectionsRes, fieldsRes, photosRes, signatureRes, versionRes] = await Promise.all([
    supabase
      .from('inspections')
      .select(
        'id, property_id, property_name, address, market, property_type, inspection_type, scheduled_at, completed_at, property_snapshot_json, property_overrides_json, inspector:profiles!inspections_inspector_id_fkey(full_name), executive:profiles!inspections_executive_id_fkey(full_name)',
      )
      .eq('id', inspectionId)
      .single(),
    supabase
      .from('inspection_sections')
      .select('id, section_title, section_type, sort_order, final_observation')
      .eq('inspection_id', inspectionId)
      .eq('is_visible', true)
      .order('sort_order'),
    supabase
      .from('inspection_field_values')
      .select('inspection_section_id, field_label, value_text, group_key, sort_order')
      .eq('inspection_id', inspectionId)
      .eq('is_visible', true)
      .order('sort_order'),
    supabase
      .from('inspection_photos')
      .select('id, inspection_section_id, storage_path, caption, sort_order')
      .eq('inspection_id', inspectionId)
      .order('sort_order'),
    supabase
      .from('inspection_signatures')
      .select('signer_name, signature_data, signed_at, signature_status')
      .eq('inspection_id', inspectionId)
      .maybeSingle(),
    supabase
      .from('inspection_report_versions')
      .select('id, version_number')
      .eq('inspection_id', inspectionId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (inspRes.error || !inspRes.data) throw inspRes.error ?? new Error('Inspección no encontrada');
  const inspection = inspRes.data as unknown as Inspection & {
    inspector: { full_name: string } | null;
    executive: { full_name: string } | null;
  };

  const snapshot = getEffectiveSnapshot(inspection as unknown as Inspection);
  const sections = (sectionsRes.data ?? []) as Array<{
    id: string; section_title: string; section_type: string; final_observation: string | null;
  }>;
  const fields = (fieldsRes.data ?? []) as Array<{
    inspection_section_id: string; field_label: string; value_text: string | null; group_key: string | null;
  }>;
  const photos = (photosRes.data ?? []) as Array<{
    id: string; inspection_section_id: string; storage_path: string; caption: string | null;
  }>;

  const pdfSections: CheckinPdfSection[] = sections.map((s) => ({
    id: s.id,
    title: s.section_title,
    final_observation: s.final_observation,
    fields: fields
      .filter((f) => f.inspection_section_id === s.id)
      .map((f) => ({ field_label: f.field_label, value_text: f.value_text, group_key: f.group_key })),
    photos: photos
      .filter((p) => p.inspection_section_id === s.id)
      .map((p) => ({ id: p.id, storage_path: p.storage_path, caption: p.caption })),
  }));

  const signature = signatureRes.data as
    | { signer_name: string | null; signature_data: string | null; signed_at: string | null; signature_status: string }
    | null;

  const versionNumber = (versionRes.data as { version_number: number } | null)?.version_number ?? 1;
  const versionId = (versionRes.data as { id: string } | null)?.id ?? null;
  const generatedAt = new Date().toISOString();

  const bytes = await buildCheckinReportPdf({
    propertyName: inspection.property_name || inspection.property_id,
    propertyId: inspection.property_id,
    address: inspection.address ?? str(snapshot.address) ?? null,
    marketLabel: marketLabel(inspection.market),
    propertyType: inspection.property_type ?? null,
    tenantName: str(snapshot.tenant_name) ?? str(snapshot.nombre_inquilino),
    tenantEmail: str(snapshot.recipient_email) ?? str(snapshot.tenant_email),
    inspectorName: inspection.inspector?.full_name ?? null,
    executiveName: inspection.executive?.full_name ?? null,
    deliveryDate: inspection.completed_at ?? inspection.scheduled_at ?? null,
    versionNumber,
    generatedAt,
    sections: pdfSections,
    signature: signature?.signature_data ? signature : null,
    onProgress,
  });

  const stamp = generatedAt.replace(/[:.]/g, '-');
  const storagePath = `${inspectionId}/checkin-v${versionNumber}-${stamp}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(REPORTS_BUCKET)
    .upload(storagePath, new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data: inserted, error: insertError } = await supabase
    .from('inspection_report_files')
    .insert({
      inspection_id: inspectionId,
      report_version_id: versionId,
      audience: 'tenant',
      storage_path: storagePath,
      bytes: bytes.byteLength,
      generated_by: profileId ?? null,
    })
    .select('id, inspection_id, report_version_id, audience, storage_path, bytes, created_at, generated_by')
    .single();
  if (insertError) throw insertError;

  return inserted as unknown as ReportFileRecord;
}
