import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info, ChevronDown, PenLine, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InspectionSection } from '@/lib/types';

interface ContextPopoverProps {
  metaSections: InspectionSection[];
  activeSectionId: string | null;
  onOpenMetaSection: (id: string) => void;
  signatureRecord: any | null;
}

/**
 * Houses the inspection metadata (Introducción, Datos del inmueble, Acceso,
 * Datos de entrega, Firma del inquilino) as a top-rail popover so they
 * stop competing with physical spaces in the primary navigation.
 */
export function ContextPopover({
  metaSections, activeSectionId, onOpenMetaSection, signatureRecord,
}: ContextPopoverProps) {
  if (metaSections.length === 0 && !signatureRecord) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 shrink-0">
          <Info className="h-3.5 w-3.5" />
          Contexto
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-2 py-1 text-tiny font-medium text-muted-foreground uppercase tracking-wider">
          Datos de la inspección
        </p>
        <div className="space-y-0.5">
          {metaSections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenMetaSection(s.id)}
              className={cn(
                'w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors',
                s.id === activeSectionId
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted/60 text-foreground',
              )}
            >
              {s.section_title}
            </button>
          ))}
        </div>

        {signatureRecord && (
          <div className="mt-2 pt-2 border-t border-border/60 px-2 py-1.5 text-tiny">
            <div className="flex items-center gap-1.5 font-medium">
              {signatureRecord.signature_status === 'signed' ? (
                <PenLine className="h-3.5 w-3.5 text-[hsl(var(--status-good))]" />
              ) : signatureRecord.signature_status === 'refused' ? (
                <XCircle className="h-3.5 w-3.5 text-[hsl(var(--status-bad))]" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--status-regular))]" />
              )}
              <span>Firma del inquilino</span>
            </div>
            <p className="text-muted-foreground mt-0.5">
              {signatureRecord.signature_status === 'signed'
                ? `Firmado${signatureRecord.signer_name ? ` por ${signatureRecord.signer_name}` : ''}`
                : signatureRecord.signature_status === 'refused'
                  ? 'Rechazada por el inquilino'
                  : 'Inquilino no disponible'}
            </p>
            {signatureRecord.skip_reason && (
              <p className="text-muted-foreground italic mt-0.5">{signatureRecord.skip_reason}</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
