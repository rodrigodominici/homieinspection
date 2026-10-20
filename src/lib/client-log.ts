/**
 * Client-side diagnostic log.
 *
 * Writes to `client_error_log` so failures that happen in the user's browser
 * (blank screens, stale chunks, boot timeouts) are visible in
 * /admin/monitoring. PostHog covers the same ground but is not queryable from
 * the app, and replay is off on sensitive routes.
 *
 * Rules:
 *  - Never throws and never blocks the UI (fire and forget).
 *  - Never logs PII: no emails, no addresses, no tenant data. Only route,
 *    role, build version, error kind/message and user agent.
 *  - Deduplicated in-memory so a render loop can't flood the table.
 */
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/app-version';

export type ClientEventKind =
  | 'chunk_load_failed'
  | 'chunk_reload_recovered'
  | 'render_crash'
  | 'window_error'
  | 'unhandled_rejection'
  | 'auth_boot_timeout'
  | 'profile_missing'
  | 'owner_feedback_submit_failed'
  | 'app_boot_ok';

interface LogParams {
  kind: ClientEventKind;
  message?: string | null;
  statusCode?: number | null;
  role?: string | null;
  context?: Record<string, unknown>;
}

const seen = new Map<string, number>();
const DEDUPE_MS = 60_000;
const MAX_MESSAGE_LEN = 500;

function shouldSend(key: string): boolean {
  const now = Date.now();
  const last = seen.get(key);
  if (last && now - last < DEDUPE_MS) return false;
  seen.set(key, now);
  if (seen.size > 100) seen.clear();
  return true;
}

/** Best-effort diagnostic write. Safe to call from anywhere, including error handlers. */
export function logClientEvent(params: LogParams): void {
  const { kind, message, statusCode, role, context } = params;
  const route = typeof window !== 'undefined' ? window.location.pathname : null;
  if (!shouldSend(`${kind}|${route}|${message ?? ''}`)) return;

  const row = {
    error_kind: kind,
    event_kind: kind,
    message: message ? String(message).slice(0, MAX_MESSAGE_LEN) : null,
    status_code: statusCode ?? null,
    route,
    role: role ?? null,
    app_version: APP_VERSION,
    context: {
      ...(context ?? {}),
      online: typeof navigator !== 'undefined' ? navigator.onLine : null,
      sw_controlled: typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? !!navigator.serviceWorker.controller : false,
      at: new Date().toISOString(),
    },
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
  };

  void (async () => {
    // Without signal keep the event on the phone and send it when signal returns,
    // so failures that only happen offline are still visible in monitoring.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { bufferRow(row); return; }
    try {
      const { data } = await supabase.auth.getSession();
      const { error } = await supabase.from('client_error_log').insert([
        { ...row, user_id: data?.session?.user?.id ?? null, context: row.context as never },
      ]);
      if (error) bufferRow(row);
    } catch {
      bufferRow(row);
    }
  })();
}

const BUFFER_KEY = 'homie:pending-client-logs';
type Row = Record<string, unknown>;

function bufferRow(row: Row) {
  try {
    const list = JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]') as Row[];
    list.push(row);
    localStorage.setItem(BUFFER_KEY, JSON.stringify(list.slice(-50)));
  } catch { /* storage unavailable */ }
}

let flushing = false;
export async function flushBufferedClientLogs(): Promise<void> {
  if (flushing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  let list: Row[] = [];
  try { list = JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]') as Row[]; } catch { return; }
  if (!list.length) return;
  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id ?? null;
    const { error } = await supabase.from('client_error_log').insert(
      list.map((r) => ({ ...r, user_id: uid, context: { ...(r.context as Row), buffered: true } as never })) as never,
    );
    if (!error) localStorage.removeItem(BUFFER_KEY);
  } catch { /* try again later */ } finally { flushing = false; }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { setTimeout(() => void flushBufferedClientLogs(), 3000); });
  setTimeout(() => void flushBufferedClientLogs(), 5000);
}
