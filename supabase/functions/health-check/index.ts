// Edge function: health-check
// Public, unauthenticated health endpoint. Runs in the functions runtime, which
// is independent from the database, so it still answers (with 503) when the
// database is unreachable.
//
// GET/POST /health-check            -> plain check, returns 200 or 503
// GET/POST /health-check?notify=1   -> same check, and posts to Slack when the
//                                      state CHANGES (ok -> down, down -> ok).
//
// Anti-spam: state is persisted in public.system_health_state and Slack is only
// notified on transitions (or after a 30 min reminder while still down).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SLACK_GATEWAY = "https://connector-gateway.lovable.dev/slack/api";

// Paused temporarily at the team's request. The health check and state tracking
// remain active so Slack alerts can be re-enabled without rebuilding the monitor.
const SLACK_ALERTS_ENABLED = false;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
const SLACK_CHANNEL = Deno.env.get("SLACK_NOTIFICATIONS_CHANNEL_ID");
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://app.inspection.homie.mx";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DB_TIMEOUT_MS = 5000;
const REMINDER_MS = 30 * 60 * 1000;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`db_timeout_${ms}ms`)), ms) as unknown as number;
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function slackPost(text: string) {
  if (!LOVABLE_API_KEY || !SLACK_API_KEY || !SLACK_CHANNEL) return;
  try {
    await fetch(`${SLACK_GATEWAY}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SLACK_API_KEY,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL,
        username: "Homie Inspection",
        text,
        unfurl_links: false,
      }),
    });
  } catch (e) {
    console.error("slack_post_failed", (e as Error).message);
  }
}

function humanizeSince(since: string | null): string {
  if (!since) return "hace instantes";
  const ms = Date.now() - new Date(since).getTime();
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h ${min % 60} min`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const notify = url.searchParams.get("notify") === "1";

  const started = Date.now();
  let ok = false;
  let detail: string | null = null;

  const sb = admin();

  try {
    const { error } = await withTimeout(
      sb.from("system_health_state").select("id").eq("id", "singleton").maybeSingle(),
      DB_TIMEOUT_MS,
    );
    if (error) throw new Error(error.message);
    ok = true;
  } catch (e) {
    detail = (e as Error).message ?? "unknown_db_error";
  }

  const dbMs = Date.now() - started;
  const status = ok ? "ok" : "down";

  if (notify) {
    // Read previous state (best effort — may itself fail while the DB is down).
    let prev: { status: string; since: string | null; last_notified_at: string | null } | null = null;
    try {
      const { data } = await withTimeout(
        sb.from("system_health_state").select("status, since, last_notified_at").eq("id", "singleton").maybeSingle(),
        DB_TIMEOUT_MS,
      );
      prev = (data as typeof prev) ?? null;
    } catch { /* DB down: prev unknown */ }

    const prevStatus = prev?.status ?? (ok ? "ok" : "down");
    const changed = prevStatus !== status;
    const lastNotified = prev?.last_notified_at ? new Date(prev.last_notified_at).getTime() : 0;
    const needsReminder = !ok && !changed && Date.now() - lastNotified > REMINDER_MS;

    if (changed || needsReminder) {
      if (!ok) {
        await slackPost(
          `:rotating_light: *Homie Inspección — backend no responde*\n` +
            `La base de datos no está contestando (${detail}). Los usuarios no pueden iniciar sesión ni cargar inspecciones.\n` +
            `App: ${APP_BASE_URL}`,
        );
      } else {
        await slackPost(
          `:white_check_mark: *Homie Inspección — servicio recuperado*\n` +
            `La base de datos volvió a responder (${dbMs} ms). Caída detectada ${humanizeSince(prev?.since ?? null)}.`,
        );
      }
    }

    // Persist state (only possible when the DB is reachable).
    if (ok) {
      try {
        await withTimeout(
          sb.from("system_health_state").upsert({
            id: "singleton",
            status,
            detail,
            since: changed ? new Date().toISOString() : (prev?.since ?? new Date().toISOString()),
            last_checked_at: new Date().toISOString(),
            last_notified_at: changed || needsReminder ? new Date().toISOString() : prev?.last_notified_at ?? null,
          }).select("id"),
          DB_TIMEOUT_MS,
        );
      } catch (e) {
        console.error("state_persist_failed", (e as Error).message);
      }
    }
  }

  return json(ok ? 200 : 503, {
    status,
    db_ms: dbMs,
    detail,
    checked_at: new Date().toISOString(),
  });
});
