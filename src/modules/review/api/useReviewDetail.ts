/**
 * Loads everything the Executive review workstation needs for a single
 * inspection: header data, sections, field values, photos, reviews,
 * repairs, contractors and signature record.
 *
 * Powered by React Query for caching + invalidation. The exposed shape
 * stays identical to the previous useState/useEffect version so callers
 * (ExecutiveReviewDetail, useReviewActions) work unchanged.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { groupBy } from '@/lib/utils';
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
}

export const reviewDetailKey = (id: string | undefined) => ['review-detail', id] as const;

const EMPTY: ReviewDetailData = {
  inspection: null,
  sections: [],
  fieldsBySection: {},
  photosBySection: {},
  reviewsBySection: {},
  repairsBySection: {},
  signatureRecord: null,
  contractors: [],
  initialInternalNotes: {},
};

async function fetchReviewDetail(inspectionId: string): Promise<ReviewDetailData> {
  const [{ data: insp }, { data: contractorData }] = await Promise.all([
    supabase.from('inspections').select('*').eq('id', inspectionId).single(),
    supabase.from('contractors').select('*').eq('is_active', true).order('name'),
  ]);

  const { data: secs } = await supabase
    .from('inspection_sections')
    .select('*')
    .eq('inspection_id', inspectionId)
    .eq('is_visible', true)
    .order('sort_order');
  const secList = (secs ?? []) as unknown as InspectionSection[];

  let fieldsBySection: Record<string, InspectionFieldValue[]> = {};
  let photosBySection: Record<string, InspectionPhoto[]> = {};
  let reviewsBySection: Record<string, InspectionReview[]> = {};
  let repairsBySection: Record<string, InspectionRepairItem[]> = {};
  let initialInternalNotes: Record<string, string> = {};

  const secIds = secList.map((s) => s.id);
  if (secIds.length > 0) {
    const [{ data: fields }, { data: photos }, { data: reviews }, { data: repairs }] = await Promise.all([
      supabase.from('inspection_field_values').select('*').in('inspection_section_id', secIds).order('sort_order'),
      supabase.from('inspection_photos').select('*').in('inspection_section_id', secIds).order('sort_order'),
      supabase.from('inspection_reviews').select('*').in('inspection_section_id', secIds).order('created_at'),
      supabase.from('inspection_repair_items').select('*').in('inspection_section_id', secIds).order('sort_order'),
    ]);

    fieldsBySection = groupBy((fields ?? []) as unknown as InspectionFieldValue[]);
    photosBySection = groupBy((photos ?? []) as unknown as InspectionPhoto[]);
    reviewsBySection = groupBy((reviews ?? []) as unknown as InspectionReview[]);
    repairsBySection = groupBy((repairs ?? []) as unknown as InspectionRepairItem[]);

    for (const r of (reviews ?? []) as unknown as InspectionReview[]) {
      if (r.comment_type === 'internal_note') initialInternalNotes[r.inspection_section_id] = r.comment;
    }
  }

  const { data: sigData } = await supabase
    .from('inspection_signatures')
    .select('signature_status, signer_name, skip_reason')
    .eq('inspection_id', inspectionId)
    .limit(1);

  return {
    inspection: (insp ?? null) as unknown as Inspection | null,
    sections: secList,
    fieldsBySection,
    photosBySection,
    reviewsBySection,
    repairsBySection,
    signatureRecord: sigData && sigData.length > 0 ? (sigData[0] as ReviewDetailSignature) : null,
    contractors: (contractorData ?? []) as unknown as Contractor[],
    initialInternalNotes,
  };
}

export function useReviewDetail(inspectionId: string | undefined): UseReviewDetailResult {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: reviewDetailKey(inspectionId),
    queryFn: () => fetchReviewDetail(inspectionId!),
    enabled: !!inspectionId,
    staleTime: 30_000,
  });

  const data = query.data ?? EMPTY;

  const refetch = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: reviewDetailKey(inspectionId) });
  }, [qc, inspectionId]);

  return {
    ...data,
    loading: query.isLoading,
    refetch,
  };
}
