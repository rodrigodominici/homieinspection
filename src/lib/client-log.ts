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

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      await supabase.from('client_error_log').insert([
        {
          user_id: data?.session?.user?.id ?? null,
          error_kind: kind,
          event_kind: kind,
          message: message ? String(message).slice(0, MAX_MESSAGE_LEN) : null,
          status_code: statusCode ?? null,
          route,
          role: role ?? null,
          app_version: APP_VERSION,
          context: (context ?? null) as never,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
        },
      ]);
    } catch {
      // Diagnostics must never break the app.
    }
  })();
}
