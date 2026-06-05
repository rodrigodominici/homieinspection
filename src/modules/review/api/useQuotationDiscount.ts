/**
 * React Query wrapper around quotation discount persistence.
 * Mirrors the patterns used by `useReviewDetail`.
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyDiscount,
  fetchActiveDiscount,
  removeDiscount,
  type QuotationDiscountRow,
} from './quotation-discount.service';
import type { QuotationDiscountInput } from '@/lib/quotation-discount';

const key = (id: string | undefined) => ['quotation-discount', id] as const;

export function useQuotationDiscount(inspectionId: string | undefined, profileId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: key(inspectionId),
    queryFn: () => fetchActiveDiscount(inspectionId!),
    enabled: !!inspectionId,
    staleTime: 30_000,
  });

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: key(inspectionId) }),
    [qc, inspectionId],
  );

  const applyMutation = useMutation({
    mutationFn: (input: QuotationDiscountInput) => {
      if (!inspectionId) throw new Error('missing_inspection_id');
      return applyDiscount({ inspectionId, input, profileId });
    },
    onSuccess: () => invalidate(),
  });

  const removeMutation = useMutation({
    mutationFn: () => {
      if (!inspectionId) throw new Error('missing_inspection_id');
      return removeDiscount({ inspectionId, profileId });
    },
    onSuccess: () => invalidate(),
  });

  return {
    discount: (query.data ?? null) as QuotationDiscountRow | null,
    loading: query.isLoading,
    apply: applyMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
    saving: applyMutation.isPending || removeMutation.isPending,
    refetch: invalidate,
  };
}
