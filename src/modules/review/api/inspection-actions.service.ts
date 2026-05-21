/**
 * High-level inspection lifecycle actions for the Executive workstation:
 * start review, approve, request changes, publish.
 *
 * Pure async helpers — no React, no toasts. Callers handle UI feedback,
 * navigation and refetch. Each helper throws on error.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchTaxConfig } from '@/lib/tax';
import type { Inspection, InspectionPhoto, InspectionRepairItem, InspectionSection } from '@/lib/types';

export async function startReview(inspectionId: string): Promise<void> {
  const { error } = await supabase
    .from('inspections')
    .update({ status: 'in_review' })
    .eq('id', inspectionId);
  if (error) throw error;
}

export async function approveInspection(inspectionId: string, profileId: string | undefined): Promise<void> {
  const now = new Date().toISOString();
  const { error: e1 } = await supabase
    .from('inspections')
    .update({ status: 'approved', approved_at: now, approved_by: profileId })
    .eq('id', inspectionId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from('inspection_sections')
    .update({ status: 'reviewed', reviewed_by: profileId, reviewed_at: now })
    .eq('inspection_id', inspectionId);
  if (e2) throw e2;
}

export interface RequestChangesArgs {
  inspectionId: string;
  profileId: string | undefined;
  selectedSectionIds: string[];
  commentsBySection: Record<string, string>;
}

export async function requestChanges(args: RequestChangesArgs): Promise<void> {
  const { inspectionId, profileId, selectedSectionIds, commentsBySection } = args;
  for (const secId of selectedSectionIds) {
    const comment = commentsBySection[secId]?.trim();
    if (comment) {
      await supabase.from('inspection_reviews').insert({
        inspection_id: inspectionId,
        inspection_section_id: secId,
        comment_type: 'revision_request',
        comment,
        created_by: profileId,
      });
    }
    await supabase
      .from('inspection_sections')
      .update({ status: 'needs_changes' })
      .eq('id', secId);
  }
  const { error } = await supabase
    .from('inspections')
    .update({ status: 'needs_changes' })
    .eq('id', inspectionId);
  if (error) throw error;
}

export interface PublishArgs {
  inspection: Inspection;
  operationalSections: InspectionSection[];
  allRepairs: InspectionRepairItem[];
  photosBySection: Record<string, InspectionPhoto[]>;
  finalObservations: Record<string, string>;
  clientTotal: number;
  profileId: string | undefined;
}

export interface PublishResult {
  versionNumber: number;
  ownerUrl: string;
  tenantUrl: string;
}

/**
 * Atomic-in-practice publish:
 *  1) unset previous latest rows (all prior audiences)
 *  2) insert owner+tenant rows in a single .insert([...]) call sharing
 *     version_number and payload — only public_token + audience differ.
 *
 * Photo URLs are intentionally left `null` in the payload; the public
 * renderer exchanges photo ids for short-lived signed URLs via the
 * `sign-public-photo` edge function.
 */
export async function publishInspection(args: PublishArgs): Promise<PublishResult> {
  const { inspection, operationalSections, allRepairs, photosBySection, finalObservations, clientTotal, profileId } = args;

  const visibleRepairs = allRepairs.filter((r) => r.visible_to_owner);
  const visiblePhotos = Object.values(photosBySection).flat().filter((p: any) => p.visible_to_owner !== false);
  const taxConfig = await fetchTaxConfig(inspection.market);

  const payload = {
    property: {
      property_id: inspection.property_id,
      property_name: inspection.property_name,
      address: inspection.address,
      market: inspection.market,
      property_type: inspection.property_type,
      inspection_type: inspection.inspection_type,
    },
    sections: operationalSections.map((s) => ({
      id: s.id,
      title: s.section_title,
      type: s.section_type,
      final_observation: finalObservations[s.id]?.trim() || null,
      photos: visiblePhotos
        .filter((p) => p.inspection_section_id === s.id)
        .map((p) => ({ id: p.id, url: null, caption: p.caption })),
      repairs: visibleRepairs
        .filter((r) => r.inspection_section_id === s.id)
        .map((r) => ({
          name: r.owner_friendly_name_snapshot || r.title_snapshot,
          description: r.description_snapshot,
          category: r.category_snapshot,
          unit: r.unit,
          quantity: r.quantity,
          unit_price: r.unit_price,
          subtotal: r.quantity * r.unit_price,
          payer_role: r.payer_role,
          payment_nature: r.payment_nature,
        })),
    })),
    budget_total: clientTotal,
    tax_config: taxConfig
      ? {
          enabled: taxConfig.vat_enabled,
          percentage: Number(taxConfig.vat_percentage),
          label: taxConfig.vat_label,
          currency: taxConfig.currency,
        }
      : null,
    published_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from('inspection_report_versions')
    .select('version_number')
    .eq('inspection_id', inspection.id)
    .order('version_number', { ascending: false })
    .limit(1);
  const nextVersion = ((existing?.[0] as any)?.version_number ?? 0) + 1;

  await supabase.from('inspection_report_versions').update({ is_latest: false }).eq('inspection_id', inspection.id);

  const ownerToken = crypto.randomUUID();
  const tenantToken = crypto.randomUUID();
  const { error } = await supabase.from('inspection_report_versions').insert([
    { inspection_id: inspection.id, version_number: nextVersion, status: 'published',
      audience: 'owner',  public_token: ownerToken,  normalized_payload: payload as any, is_latest: true },
    { inspection_id: inspection.id, version_number: nextVersion, status: 'published',
      audience: 'tenant', public_token: tenantToken, normalized_payload: payload as any, is_latest: true },
  ]);
  if (error) throw error;

  const now = new Date().toISOString();
  await supabase.from('inspections').update({
    status: 'published',
    published_at: now,
    owner_url_generated_at: now,
    approved_at: now,
    approved_by: profileId,
  }).eq('id', inspection.id);

  const origin = window.location.origin;
  return {
    versionNumber: nextVersion,
    ownerUrl: `${origin}/reportes/${inspection.property_id}/${ownerToken}`,
    tenantUrl: `${origin}/reportes/${inspection.property_id}/${tenantToken}`,
  };
}

export async function togglePhotoVisibility(photoId: string, currentVisible: boolean): Promise<void> {
  const { error } = await supabase
    .from('inspection_photos')
    .update({ visible_to_owner: !currentVisible })
    .eq('id', photoId);
  if (error) throw error;
}
