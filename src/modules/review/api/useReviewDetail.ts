/**
 * Loads everything the Executive review workstation needs for a single
 * inspection: header data, sections, field values, photos, reviews,
 * repairs, contractors and signature record.
 *
 * Encapsulates the legacy `fetchAll` from ExecutiveReviewDetail.tsx without
 * changing query shape or behavior. Returns a `refetch` callback callers
 * invoke after every mutation (same coarse refresh as before).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  Contractor,
  Inspection,
  InspectionFieldValue,
  InspectionPhoto,
  InspectionRepairItem,
  InspectionReview,
  InspectionSection,
} from '@/lib/types';

function groupBy<T extends { inspection_section_id: string }>(arr: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    (map[item.inspection_section_id] ||= []).push(item);
  }
  return map;
}

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

export function useReviewDetail(inspectionId: string | undefined): UseReviewDetailResult {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, InspectionFieldValue[]>>({});
  const [photosBySection, setPhotosBySection] = useState<Record<string, InspectionPhoto[]>>({});
  const [reviewsBySection, setReviewsBySection] = useState<Record<string, InspectionReview[]>>({});
  const [repairsBySection, setRepairsBySection] = useState<Record<string, InspectionRepairItem[]>>({});
  const [signatureRecord, setSignatureRecord] = useState<ReviewDetailSignature | null>(null);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [initialInternalNotes, setInitialInternalNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!inspectionId) return;

    const [{ data: insp }, { data: contractorData }] = await Promise.all([
      supabase.from('inspections').select('*').eq('id', inspectionId).single(),
      supabase.from('contractors').select('*').eq('is_active', true).order('name'),
    ]);
    const inspData = insp as unknown as Inspection;
    setInspection(inspData);
    setContractors((contractorData ?? []) as unknown as Contractor[]);

    const { data: secs } = await supabase
      .from('inspection_sections')
      .select('*')
      .eq('inspection_id', inspectionId)
      .eq('is_visible', true)
      .order('sort_order');
    const secList = (secs ?? []) as unknown as InspectionSection[];
    setSections(secList);

    const secIds = secList.map((s) => s.id);
    if (secIds.length > 0) {
      const [{ data: fields }, { data: photos }, { data: reviews }, { data: repairs }] = await Promise.all([
        supabase.from('inspection_field_values').select('*').in('inspection_section_id', secIds).order('sort_order'),
        supabase.from('inspection_photos').select('*').in('inspection_section_id', secIds).order('sort_order'),
        supabase.from('inspection_reviews').select('*').in('inspection_section_id', secIds).order('created_at'),
        supabase.from('inspection_repair_items').select('*').in('inspection_section_id', secIds).order('sort_order'),
      ]);

      setFieldsBySection(groupBy((fields ?? []) as unknown as InspectionFieldValue[]));
      setPhotosBySection(groupBy((photos ?? []) as unknown as InspectionPhoto[]));
      setReviewsBySection(groupBy((reviews ?? []) as unknown as InspectionReview[]));
      setRepairsBySection(groupBy((repairs ?? []) as unknown as InspectionRepairItem[]));

      const notesMap: Record<string, string> = {};
      for (const r of (reviews ?? []) as unknown as InspectionReview[]) {
        if (r.comment_type === 'internal_note') notesMap[r.inspection_section_id] = r.comment;
      }
      setInitialInternalNotes(notesMap);
    } else {
      setFieldsBySection({});
      setPhotosBySection({});
      setReviewsBySection({});
      setRepairsBySection({});
      setInitialInternalNotes({});
    }

    const { data: sigData } = await supabase
      .from('inspection_signatures')
      .select('signature_status, signer_name, skip_reason')
      .eq('inspection_id', inspectionId)
      .limit(1);
    setSignatureRecord(sigData && sigData.length > 0 ? (sigData[0] as ReviewDetailSignature) : null);

    setLoading(false);
  }, [inspectionId]);

  useEffect(() => { refetch(); }, [refetch]);

  return {
    inspection,
    sections,
    fieldsBySection,
    photosBySection,
    reviewsBySection,
    repairsBySection,
    signatureRecord,
    contractors,
    initialInternalNotes,
    loading,
    refetch,
  };
}
