/**
 * Estado del informe de check-in en PDF: último archivo generado, generación
 * manual (regenerar) y descarga por URL firmada.
 */
import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  generateCheckinReportPdf,
  getLatestReportFile,
  getReportDownloadUrl,
  type ReportFileRecord,
} from './checkin-report.service';

export const checkinReportKey = (inspectionId: string | undefined) =>
  ['checkin-report-file', inspectionId] as const;

export function useCheckinReport(inspectionId: string | undefined, enabled = true) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const fileQ = useQuery({
    queryKey: checkinReportKey(inspectionId),
    queryFn: () => getLatestReportFile(inspectionId!),
    enabled: !!inspectionId && enabled,
    staleTime: 30_000,
  });

  const generate = useMutation({
    mutationFn: async () => {
      setProgress({ done: 0, total: 0 });
      return generateCheckinReportPdf({
        inspectionId: inspectionId!,
        onProgress: (done, total) => setProgress({ done, total }),
      });
    },
    onSuccess: (record: ReportFileRecord) => {
      setProgress(null);
      qc.setQueryData(checkinReportKey(inspectionId), record);
      toast.success('Informe PDF generado');
    },
    onError: (err: unknown) => {
      setProgress(null);
      toast.error('No se pudo generar el PDF', {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  const download = useCallback(async () => {
    const file = fileQ.data;
    if (!file) return;
    try {
      const url = await getReportDownloadUrl(file.storage_path);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error('No se pudo abrir el PDF', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }, [fileQ.data]);

  return {
    file: fileQ.data ?? null,
    loading: fileQ.isLoading,
    generating: generate.isPending,
    progress,
    generate: () => generate.mutate(),
    download,
  };
}
