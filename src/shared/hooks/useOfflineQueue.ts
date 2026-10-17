import { useEffect, useState } from 'react';
import { listQueue, subscribeQueue, isFlushing, type QueueOp } from '@/shared/lib/offline-queue';

export function useOfflineQueue() {
  const [ops, setOps] = useState<QueueOp[]>([]);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      setSyncing(isFlushing());
      listQueue().then((o) => { if (alive) setOps(o); }).catch(() => {});
    };
    refresh();
    const unsub = subscribeQueue(refresh);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { alive = false; unsub(); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const photos = ops.filter((o) => o.kind === 'photo').length;
  return { ops, online, syncing, photos, changes: ops.length - photos, total: ops.length };
}
