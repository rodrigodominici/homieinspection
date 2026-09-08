/**
 * Tarjeta del informe de entrega en PDF (solo check-in).
 *
 * Muestra si el PDF ya está generado, permite descargarlo y regenerarlo con
 * los datos actuales. Se usa tanto en la revisión del ejecutivo como en la
 * ficha de administración.
 */
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileDown, Loader2, RefreshCw } from 'lucide-react';
import { useCheckinReport } from '@/modules/review/api/useCheckinReport';

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });

const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function ReportPdfCard({ inspectionId }: { inspectionId: string }) {
  const { file, loading, generating, progress, generate, download } = useCheckinReport(inspectionId);

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-2.5 border-b flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          Informe de entrega (PDF)
        </p>
        {file && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
            Disponible
          </Badge>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando informe…
          </div>
        ) : file ? (
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-primary/10 p-2">
              <FileDown className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Informe de entrega al inquilino</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generado el {fmtDateTime(file.created_at)} · {fmtSize(file.bytes)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Aún no hay PDF generado. Se crea automáticamente al publicar el informe, o puedes generarlo ahora.
          </p>
        )}

        {generating && (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {progress && progress.total > 0
              ? `Procesando fotos ${progress.done}/${progress.total}…`
              : 'Generando el PDF…'}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button size="sm" className="gap-1.5" onClick={download} disabled={!file || generating}>
            <Download className="h-3.5 w-3.5" /> Descargar PDF
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={generate} disabled={generating}>
            <RefreshCw className="h-3.5 w-3.5" /> {file ? 'Regenerar' : 'Generar PDF'}
          </Button>
        </div>
      </div>
    </div>
  );
}
