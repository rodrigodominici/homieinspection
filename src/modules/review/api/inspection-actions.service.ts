/**
 * High-level inspection lifecycle actions for the Executive workstation:
 * start review, approve, request changes, publish.
 *
 * Pure async helpers — no React, no toasts. Callers handle UI feedback,
 * navigation and refetch. Each helper throws on error.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchTaxConfig } from '@/lib/tax';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import { fetchActiveDiscount } from './quotation-discount.service';
import { applyQuotationDiscount, type QuotationDiscountInput } from '@/lib/quotation-discount';
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

  // Batch insert all review comments in a single round-trip
  const reviewRows = selectedSectionIds
    .filter((secId) => commentsBySection[secId]?.trim())
    .map((secId) => ({
      inspection_id: inspectionId,
      inspection_section_id: secId,
      comment_type: 'revision_request',
      comment: commentsBySection[secId].trim(),
      created_by: profileId,
    }));
  if (reviewRows.length > 0) {
    await supabase.from('inspection_reviews').insert(reviewRows);
  }

  // Update all sections and the inspection status in parallel
  const [, { error }] = await Promise.all([
    Promise.all(
      selectedSectionIds.map((secId) =>
        supabase.from('inspection_sections').update({ status: 'needs_changes' }).eq('id', secId),
      ),
    ),
    supabase.from('inspections').update({ status: 'needs_changes' }).eq('id', inspectionId),
  ]);
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
  const activeDiscount = await fetchActiveDiscount(inspection.id);
  const discountInput: QuotationDiscountInput | null = activeDiscount
    ? { type: activeDiscount.discount_type, value: Number(activeDiscount.discount_value), reason: activeDiscount.discount_reason }
    : null;

  // Subtotals for the discount snapshot are derived from the OWNER-VISIBLE
  // (published) universe so the report's discount line ties out to what the
  // owner actually sees in the budget tab.
  const visibleSubtotalOwner = visibleRepairs
    .filter((r) => r.payer_role !== 'tenant')
    .reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const visibleSubtotalTenant = visibleRepairs
    .filter((r) => r.payer_role === 'tenant')
    .reduce((s, r) => s + r.quantity * r.unit_price, 0);

  const discountBreakdown = applyQuotationDiscount({
    subtotalOwner: visibleSubtotalOwner,
    subtotalTenant: visibleSubtotalTenant,
    discount: discountInput,
    taxConfig,
  });

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
          id: r.id,
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
    discount: activeDiscount && discountBreakdown.discountAmount > 0
      ? {
          type: activeDiscount.discount_type,
          value: Number(activeDiscount.discount_value),
          amount: discountBreakdown.discountAmount,
          amount_owner: discountBreakdown.discountOwner,
          amount_tenant: discountBreakdown.discountTenant,
          reason: activeDiscount.discount_reason,
        }
      : null,
    published_at: new Date().toISOString(),
    // fecha_recoleccion_llaves lives in property_overrides_json / property_snapshot_json,
    // not in the direct inspections column. Read it via getEffectiveSnapshot.
    fecha_recoleccion_llaves: (getEffectiveSnapshot(inspection)?.fecha_recoleccion_llaves as string | undefined) ?? null,
  };

  const { data: existing } = await supabase
    .from('inspection_report_versions')
    .select('version_number')
    .eq('inspection_id', inspection.id)
    .order('version_number', { ascending: false })
    .limit(1);
  const nextVersion = ((existing?.[0] as any)?.version_number ?? 0) + 1;

  // Reuse prior public tokens so the owner/tenant link stays stable across re-publishes.
  const { data: priorTokens } = await supabase
    .from('inspection_report_versions')
    .select('audience, public_token')
    .eq('inspection_id', inspection.id)
    .in('audience', ['owner', 'tenant']);
  const priorOwner = priorTokens?.find((r: any) => r.audience === 'owner')?.public_token as string | undefined;
  const priorTenant = priorTokens?.find((r: any) => r.audience === 'tenant')?.public_token as string | undefined;

  await supabase.from('inspection_report_versions').update({ is_latest: false }).eq('inspection_id', inspection.id);

  const ownerToken = priorOwner ?? crypto.randomUUID();
  const tenantToken = priorTenant ?? crypto.randomUUID();
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
    // Re-publishing resets the owner feedback loop for the new version.
    owner_feedback_status: 'none',
  } as any).eq('id', inspection.id);

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
