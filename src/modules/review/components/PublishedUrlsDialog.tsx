import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link2, Copy, ExternalLink } from 'lucide-react';

export interface PublishedUrls {
  owner: string;
  tenant: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  urls: PublishedUrls | null;
  onCopy: (text: string) => void;
}

export function PublishedUrlsDialog({ open, onOpenChange, urls, onCopy }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-[hsl(var(--status-good))]" /> Reporte publicado
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-caption text-muted-foreground">
            Se generaron dos enlaces. Comparte cada uno con la audiencia correspondiente.
          </p>

          <div className="space-y-1.5">
            <label className="text-tiny font-semibold uppercase tracking-wide text-muted-foreground">Cotización Propietario</label>
            <div className="flex gap-2">
              <Input readOnly value={urls?.owner ?? ''} className="flex-1 text-caption font-mono" />
              <Button variant="outline" size="icon" onClick={() => urls && onCopy(urls.owner)}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => urls && window.open(urls.owner, '_blank')}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-tiny font-semibold uppercase tracking-wide text-muted-foreground">Cotización Inquilino</label>
            <div className="flex gap-2">
              <Input readOnly value={urls?.tenant ?? ''} className="flex-1 text-caption font-mono" />
              <Button variant="outline" size="icon" onClick={() => urls && onCopy(urls.tenant)}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => urls && window.open(urls.tenant, '_blank')}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
