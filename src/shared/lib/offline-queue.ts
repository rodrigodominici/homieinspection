import { supabase } from '@/integrations/supabase/client';
import { compressImage, PhotoUploadError } from '@/shared/lib/inspection-photos';

/**
 * Offline outbox for the inspector flow. Row updates and photos that can't
 * reach the backend are stored in IndexedDB and replayed in order when the
 * connection comes back. Updates for the same row are merged (latest wins).
 */

type UpdateOp = {
  id: string;
  kind: 'update';
  table: 'inspection_field_values' | 'inspection_sections';
  rowId: string;
  patch: Record<string, unknown>;
  createdAt: number;
};

export type PhotoOp = {
  id: string;
  kind: 'photo';
  blob: Blob;
  inspectionId: string;
  sectionId: string;
  sectionKey: string;
  fieldKey: string | null;
  uploadedBy: string | null;
  sortOrder: number;
  createdAt: number;
};

export type QueueOp = UpdateOp | PhotoOp;

const DB = 'homie-offline';
const STORE = 'outbox';
let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => {
        const conn = req.result;
        // iOS Safari closes idle connections (app in background, low memory).
        // Forget the closed one so the next call reopens it.
        conn.onclose = () => { dbPromise = null; };
        conn.onversionchange = () => { conn.close(); dbPromise = null; };
        resolve(conn);
      };
      req.onerror = () => { dbPromise = null; reject(req.error); };
      req.onblocked = () => { dbPromise = null; reject(new Error('indexeddb_blocked')); };
    });
  }
  return dbPromise;
}

function runTx<T>(d: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const t = d.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      t.onabort = () => reject(t.error ?? new Error('transaction_aborted'));
    } catch (e) {
      reject(e);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  try {
    return await runTx(await db(), mode, fn);
  } catch {
    // Connection was closing / internal IDB error: reopen once and retry.
    try { (await dbPromise)?.close(); } catch { /* ignore */ }
    dbPromise = null;
    return runTx(await db(), mode, fn);
  }
}

/** Rejects after `ms` so a hanging request on weak signal does not freeze the screen. */
export function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('network timeout')), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export function subscribeQueue(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function listQueue(): Promise<QueueOp[]> {
  const all = (await tx('readonly', (s) => s.getAll())) as QueueOp[];
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

async function put(op: QueueOp) { await tx('readwrite', (s) => s.put(op)); notify(); }
async function remove(id: string) { await tx('readwrite', (s) => s.delete(id)); notify(); }

export async function clearQueue() { await tx('readwrite', (s) => s.clear()); notify(); }

function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  const msg = String((err as { message?: string })?.message ?? err ?? '');
  return /fetch|network|load failed|timeout/i.test(msg);
}

/**
 * Update a row now when online; otherwise (or on network failure) keep it in
 * the outbox. Returns 'saved' | 'queued' | 'error'.
 */
export async function saveOrQueueUpdate(
  table: UpdateOp['table'],
  rowId: string,
  patch: Record<string, unknown>,
): Promise<'saved' | 'queued' | 'error'> {
  if (navigator.onLine) {
    try {
      const { error } = await withTimeout(supabase.from(table).update(patch as never).eq('id', rowId), 8000);
      if (!error) return 'saved';
      if (!isNetworkError(error)) return 'error';
    } catch (e) {
      if (!isNetworkError(e)) return 'error';
    }
  }
  // Merge with a pending update for the same row (latest wins).
  const existing = (await listQueue()).find(
    (o): o is UpdateOp => o.kind === 'update' && o.table === table && o.rowId === rowId,
  );
  await put({
    id: existing?.id ?? crypto.randomUUID(),
    kind: 'update',
    table,
    rowId,
    patch: { ...(existing?.patch ?? {}), ...patch },
    createdAt: existing?.createdAt ?? Date.now(),
  });
  return 'queued';
}

/** Compress and store photos in the outbox. */
export async function queuePhotos(opts: {
  files: File[];
  inspectionId: string;
  sectionId: string;
  sectionKey: string;
  fieldKey: string | null;
  uploadedBy: string | null;
  startingSortOrder: number;
}): Promise<number> {
  let n = 0;
  for (const [i, file] of opts.files.entries()) {
    const blob = await compressImage(file);
    if (!blob) throw new PhotoUploadError('unsupported_format', 'No se pudo procesar la imagen.');
    await put({
      id: crypto.randomUUID(),
      kind: 'photo',
      blob,
      inspectionId: opts.inspectionId,
      sectionId: opts.sectionId,
      sectionKey: opts.sectionKey,
      fieldKey: opts.fieldKey,
      uploadedBy: opts.uploadedBy,
      sortOrder: opts.startingSortOrder + i,
      createdAt: Date.now() + i,
    });
    n++;
  }
  return n;
}

async function runOp(op: QueueOp) {
  if (op.kind === 'update') {
    const { error } = await withTimeout(supabase.from(op.table).update(op.patch as never).eq('id', op.rowId), 15000);
    if (error) throw error;
    return;
  }
  const path = `inspections/${op.inspectionId}/${op.sectionKey}/${op.id}.jpg`;
  const up = await withTimeout(supabase.storage.from('inspection-photos')
    .upload(path, op.blob, { contentType: 'image/jpeg', upsert: true }), 60000);
  if (up.error) throw up.error;
  const { error } = await withTimeout(supabase.from('inspection_photos').insert({
    inspection_id: op.inspectionId,
    inspection_section_id: op.sectionId,
    field_key: op.fieldKey,
    group_key: 'photo',
    storage_bucket: 'inspection-photos',
    storage_path: path,
    uploaded_by: op.uploadedBy,
    sort_order: op.sortOrder,
  }), 15000);
  if (error) throw error;
}

let flushing: Promise<void> | null = null;
let flushingState = false;
export const isFlushing = () => flushingState;

/** Replay the outbox in order. Stops at the first failure and retries later. */
export function flushQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    flushingState = true; notify();
    try {
      for (const op of await listQueue()) {
        if (!navigator.onLine) break;
        try {
          await runOp(op);
          await remove(op.id);
        } catch {
          break;
        }
      }
    } finally {
      flushingState = false;
      flushing = null;
      notify();
    }
  })();
  return flushing;
}

let started = false;
export function startOfflineSync() {
  if (started || typeof window === 'undefined' || !('indexedDB' in window)) return;
  started = true;
  window.addEventListener('online', () => void flushQueue());
  window.setInterval(() => { if (navigator.onLine) void flushQueue(); }, 60_000);
  void flushQueue();
}
