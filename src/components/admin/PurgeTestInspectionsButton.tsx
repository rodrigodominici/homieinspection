import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { purgeInspections } from '@/lib/purge-inspections';

/** Solo admins: borra por completo todas las inspecciones marcadas como prueba. */
export default function PurgeTestInspectionsButton({ onDone }: { onDone?: () => void }) {
  const { toast } = useToast();
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const prepare = async () => {
    setBusy(true);
    try {
      const r = await purgeInspections({ all_test: true, dry_run: true });
      setCount(r.count ?? 0);
    } catch (e: any) {
      toast({ title: 'No se pudo contar', description: e.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await purgeInspections({ all_test: true });
      toast({ title: `${r.deleted ?? 0} inspecciones de prueba eliminadas` });
      onDone?.();
    } catch (e: any) {
      toast({ title: 'Error al borrar', description: e.message, variant: 'destructive' });
    }
    setBusy(false);
    setCount(null);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={prepare} disabled={busy}>
        <Trash2 className="h-4 w-4" /> Borrar todas las de prueba
      </Button>
      <AlertDialog open={count !== null} onOpenChange={(o) => !o && setCount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {count === 0 ? 'No hay inspecciones de prueba' : `¿Borrar ${count} inspecciones de prueba?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {count === 0
                ? 'No hay nada para borrar.'
                : 'Se eliminan por completo, con fotos, PDF, avisos a Rent Manager, eventos de entrada, referencias y enlaces del informe. No se puede deshacer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {!!count && (
              <AlertDialogAction onClick={confirm} disabled={busy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Sí, borrar {count}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
