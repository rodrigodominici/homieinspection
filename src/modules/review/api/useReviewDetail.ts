/**
 * Loads everything the Executive review workstation needs for a single
 * inspection: header data, sections, field values, photos, reviews,
 * repairs, contractors and signature record.
 *
 * Internally split into multiple sub-queries so consumers can invalidate
 * granularly (e.g. only photos or only repairs) without retriggering the
 * whole bundle. The public return shape stays identical to the previous
 * monolithic version so existing callers work unchanged.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { groupBy } from '@/lib/utils';
import {
  CONTRACTOR_COLUMNS,
  INSPECTION_DETAIL_COLUMNS,
  PHOTO_COLUMNS,
  REPAIR_COLUMNS,
  REVIEW_COLUMNS,
  SECTION_COLUMNS,
} from '@/lib/inspection-columns';
import { measureOperation } from '@/lib/monitoring';
import type {
  Contractor,
  Inspection,
  InspectionFieldValue,
  InspectionPhoto,
  InspectionRepairItem,
  InspectionReview,
  InspectionSection,
} from '@/lib/types';

export interface ReviewDetailSignature {
  signature_status: string;
  signer_name: string | null;
  skip_reason: string | null;
}

export interface ReviewDetailData {
  inspection: Inspection | null;
  sections: InspectionSection[];
  fieldsBySection: Record<string, InspectionFieldValue[]>;
  photosBySection: Record<string, InspectionPhoto[]>;
  reviewsBySection: Record<string, InspectionReview[]>;
  repairsBySection: Record<string, InspectionRepairItem[]>;
  signatureRecord: ReviewDetailSignature | null;
  contractors: Contractor[];
  /** Map of section id → most recent `internal_note` comment (seeded from reviews). */
  initialInternalNotes: Record<string, string>;
}

export interface UseReviewDetailResult extends ReviewDetailData {
  loading: boolean;
  refetch: () => Promise<void>;
  /** Granular invalidators — invalidate only what changed. */
  invalidate: {
    all: () => Promise<void>;
    inspection: () => Promise<void>;
    sections: () => Promise<void>;
    fields: () => Promise<void>;
    photos: () => Promise<void>;
    reviews: () => Promise<void>;
    repairs: () => Promise<void>;
    signature: () => Promise<void>;
    contractors: () => Promise<void>;
  };
}

/** Umbrella key — invalidating it cascades to every sub-query via prefix match. */
export const reviewDetailKey = (id: string | undefined) => ['review-detail', id] as const;

export const reviewDetailKeys = {
  all: (id: string | undefined) => ['review-detail', id] as const,
  inspection: (id: string | undefined) => ['review-detail', id, 'inspection'] as const,
  sections: (id: string | undefined) => ['review-detail', id, 'sections'] as const,
  fields: (id: string | undefined) => ['review-detail', id, 'fields'] as const,
  photos: (id: string | undefined) => ['review-detail', id, 'photos'] as const,
  reviews: (id: string | undefined) => ['review-detail', id, 'reviews'] as const,
  repairs: (id: string | undefined) => ['review-detail', id, 'repairs'] as const,
  signature: (id: string | undefined) => ['review-detail', id, 'signature'] as const,
  contractors: () => ['review-detail', 'contractors'] as const,
};

const EMPTY_SECTIONS: InspectionSection[] = [];
const EMPTY_RECORD = {} as Record<string, never>;

export function useReviewDetail(inspectionId: string | undefined): UseReviewDetailResult {
  const qc = useQueryClient();
  const enabled = !!inspectionId;

  const inspectionQ = useQuery({
    queryKey: reviewDetailKeys.inspection(inspectionId),
    queryFn: () =>
      measureOperation('review_detail_inspection', async () => {
        const { data } = await supabase
          .from('inspections')
          .select(INSPECTION_DETAIL_COLUMNS)
          .eq('id', inspectionId!)
          .single();
        return (data ?? null) as unknown as Inspection | null;
      }),
    enabled,
    staleTime: 30_000,
  });

  const contractorsQ = useQuery({
    queryKey: reviewDetailKeys.contractors(),
    queryFn: () =>
      measureOperation('review_detail_contractors', async () => {
        const { data } = await supabase
          .from('contractors')
          .select(CONTRACTOR_COLUMNS)
          .eq('is_active', true)
          .order('name');
        return (data ?? []) as unknown as Contractor[];
      }),
    staleTime: 5 * 60_000,
  });

  const sectionsQ = useQuery({
    queryKey: reviewDetailKeys.sections(inspectionId),
    queryFn: () =>
      measureOperation('review_detail_sections', async () => {
        const { data } = await supabase
          .from('inspection_sections')
          .select(SECTION_COLUMNS)
          .eq('inspection_id', inspectionId!)
          .eq('is_visible', true)
          .order('sort_order');
        return (data ?? []) as unknown as InspectionSection[];
      }),
    enabled,
    staleTime: 30_000,
  });

  const sections = sectionsQ.data ?? EMPTY_SECTIONS;

  // NOTE: these used to filter by `inspection_section_id IN (secIds)`, which
  // forced a network waterfall (sections had to resolve first). All four tables
  // carry an indexed `inspection_id`, so we filter by it and fire in parallel
  // with the sections query — one round-trip instead of two.
  const fieldsQ = useQuery({
    queryKey: reviewDetailKeys.fields(inspectionId),
    queryFn: () =>
      measureOperation('review_detail_fields', async () => {
        const { data } = await supabase
          .from('inspection_field_values')
          .select('id, inspection_section_id, sort_order, field_label, group_key, value_text')
          .eq('inspection_id', inspectionId!)
          .order('sort_order');
        return groupBy((data ?? []) as unknown as InspectionFieldValue[]);
      }),
    enabled,
    staleTime: 30_000,
  });

  const photosQ = useQuery({
    queryKey: reviewDetailKeys.photos(inspectionId),
    queryFn: () =>
      measureOperation('review_detail_photos', async () => {
        const { data } = await supabase
          .from('inspection_photos')
          .select(PHOTO_COLUMNS)
          .eq('inspection_id', inspectionId!)
          .order('sort_order');
        return groupBy((data ?? []) as unknown as InspectionPhoto[]);
      }),
    enabled,
    staleTime: 30_000,
  });

  const reviewsQ = useQuery({
    queryKey: reviewDetailKeys.reviews(inspectionId),
    queryFn: () =>
      measureOperation('review_detail_reviews', async () => {
        const { data } = await supabase
          .from('inspection_reviews')
          .select(REVIEW_COLUMNS)
          .eq('inspection_id', inspectionId!)
          .order('created_at');
        const list = (data ?? []) as unknown as InspectionReview[];
        const bySection = groupBy(list);
        const initialInternalNotes: Record<string, string> = {};
        for (const r of list) {
          if (r.comment_type === 'internal_note') initialInternalNotes[r.inspection_section_id] = r.comment;
        }
        return { bySection, initialInternalNotes };
      }),
    enabled,
    staleTime: 30_000,
  });

  const repairsQ = useQuery({
    queryKey: reviewDetailKeys.repairs(inspectionId),
    queryFn: () =>
      measureOperation('review_detail_repairs', async () => {
        const { data } = await supabase
          .from('inspection_repair_items')
          .select(REPAIR_COLUMNS)
          .eq('inspection_id', inspectionId!)
          .order('sort_order');
        return groupBy((data ?? []) as unknown as InspectionRepairItem[]);
      }),
    enabled,
    staleTime: 30_000,
  });

  const signatureQ = useQuery({
    queryKey: reviewDetailKeys.signature(inspectionId),
    queryFn: () =>
      measureOperation('review_detail_signature', async () => {
        const { data } = await supabase
          .from('inspection_signatures')
          .select('signature_status, signer_name, skip_reason')
          .eq('inspection_id', inspectionId!)
          .limit(1);
        return data && data.length > 0 ? (data[0] as ReviewDetailSignature) : null;
      }),
    enabled,
    staleTime: 30_000,
  });

  // Loading: every bundle query now runs in parallel off `inspectionId`.
  const loading =
    enabled &&
    (inspectionQ.isLoading || sectionsQ.isLoading ||
      fieldsQ.isLoading || photosQ.isLoading || reviewsQ.isLoading || repairsQ.isLoading);

  const invalidate = useMemo(
    () => ({
      all: () => qc.invalidateQueries({ queryKey: reviewDetailKeys.all(inspectionId) }),
      inspection: () => qc.invalidateQueries({ queryKey: reviewDetailKeys.inspection(inspectionId) }),
      sections: () => qc.invalidateQueries({ queryKey: reviewDetailKeys.sections(inspectionId) }),
      fields: () => qc.invalidateQueries({ queryKey: reviewDetailKeys.fields(inspectionId) }),
      photos: () => qc.invalidateQueries({ queryKey: reviewDetailKeys.photos(inspectionId) }),
      reviews: () => qc.invalidateQueries({ queryKey: reviewDetailKeys.reviews(inspectionId) }),
      repairs: () => qc.invalidateQueries({ queryKey: reviewDetailKeys.repairs(inspectionId) }),
      signature: () => qc.invalidateQueries({ queryKey: reviewDetailKeys.signature(inspectionId) }),
      contractors: () => qc.invalidateQueries({ queryKey: reviewDetailKeys.contractors() }),
    }),
    [qc, inspectionId],
  );

  const refetch = useCallback(async () => {
    await invalidate.all();
  }, [invalidate]);

  return {
    inspection: inspectionQ.data ?? null,
    sections,
    fieldsBySection: fieldsQ.data ?? EMPTY_RECORD,
    photosBySection: photosQ.data ?? EMPTY_RECORD,
    reviewsBySection: reviewsQ.data?.bySection ?? EMPTY_RECORD,
    repairsBySection: repairsQ.data ?? EMPTY_RECORD,
    signatureRecord: signatureQ.data ?? null,
    contractors: contractorsQ.data ?? [],
    initialInternalNotes: reviewsQ.data?.initialInternalNotes ?? EMPTY_RECORD,
    loading,
    refetch,
    invalidate,
  };
}
