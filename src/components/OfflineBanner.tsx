import { CloudOff, Loader2 } from 'lucide-react';
import { useOfflineQueue } from '@/shared/hooks/useOfflineQueue';

/** Thin top bar telling the receptor what's waiting to be sent. */
export default function OfflineBanner() {
  const { online, syncing, photos, changes, total } = useOfflineQueue();
  if (online && total === 0) return null;

  const parts: string[] = [];
  if (changes) parts.push(`${changes} ${changes === 1 ? 'cambio' : 'cambios'}`);
  if (photos) parts.push(`${photos} ${photos === 1 ? 'foto' : 'fotos'}`);
  const pending = parts.length ? `${parts.join(' y ')} pendientes` : 'tus cambios se guardan en el celular';

  return (
    <div className="relative z-[70] flex items-center justify-center gap-2 bg-warning px-3 py-1.5 text-caption font-medium text-warning-foreground" style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}>
      {online ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudOff className="h-3.5 w-3.5" />}
      {online ? `${syncing ? 'Subiendo' : 'Por subir'}: ${pending}` : `Sin conexión — ${pending}`}
    </div>
  );
}
