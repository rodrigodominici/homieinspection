// Edge function: notify-executive-slack
// Sends Slack notifications to the assigned executive (in a shared channel)
// when an inspection is submitted for review or the owner sends feedback.
//
// Public endpoint (verify_jwt=false) because owner-feedback flow is invoked
// from the unauthenticated public report page. Idempotency is enforced via
// the unique index on slack_notifications_log(inspection_id, event_type).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SLACK_GATEWAY = "https://connector-gateway.lovable.dev/slack/api";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
const SLACK_CHANNEL = Deno.env.get("SLACK_NOTIFICATIONS_CHANNEL_ID");
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://app.inspection.homie.mx";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type EventType = "submitted" | "owner_feedback";

interface ReqBody {
  inspection_id?: string;
  event_type?: EventType;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function slackCall(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${SLACK_GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SLACK_API_KEY!,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(`Slack ${method} non-JSON: ${text.slice(0, 200)}`); }
  return data;
}

async function lookupSlackUserId(email: string | null): Promise<string | null> {
  if (!email) return null;
  try {
    const res = await fetch(`${SLACK_GATEWAY}/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SLACK_API_KEY!,
      },
    });
    const data = await res.json();
    if (data?.ok && data?.user?.id) return data.user.id as string;
    return null;
  } catch {
    return null;
  }
}

function mention(uid: string | null, fallbackName: string): string {
  return uid ? `<@${uid}>` : `*${fallbackName}*`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) return json(500, { error: "LOVABLE_API_KEY not configured" });
    if (!SLACK_API_KEY) return json(500, { error: "SLACK_API_KEY not configured" });
    if (!SLACK_CHANNEL) return json(500, { error: "SLACK_NOTIFICATIONS_CHANNEL_ID not configured" });

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const { inspection_id, event_type } = body;

    if (!inspection_id || !event_type || !["submitted", "owner_feedback"].includes(event_type)) {
      return json(400, { error: "inspection_id and valid event_type required" });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Idempotency check — UNIQUE index on (inspection_id, event_type) WHERE status='sent'
    const { data: existing } = await sb
      .from("slack_notifications_log")
      .select("id")
      .eq("inspection_id", inspection_id)
      .eq("event_type", event_type)
      .eq("status", "sent")
      .maybeSingle();
    if (existing) return json(200, { status: "noop", reason: "already_sent" });

    // Load inspection + executive + (for submitted) inspector
    const { data: insp, error: inspErr } = await sb
      .from("inspections")
      .select("id, property_name, address, executive_id, inspector_id")
      .eq("id", inspection_id)
      .single();
    if (inspErr || !insp) return json(404, { error: "inspection_not_found" });

    if (!insp.executive_id) return json(200, { status: "noop", reason: "no_executive_assigned" });

    const { data: execProfile } = await sb
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", insp.executive_id)
      .single();

    const execEmail = execProfile?.email ?? null;
    const execName = execProfile?.full_name ?? execProfile?.email ?? "Ejecutivo";

    const slackUid = await lookupSlackUserId(execEmail);
    const who = mention(slackUid, execName);

    const propertyLine = `${insp.property_name ?? "Propiedad sin nombre"}${insp.address ? ` — ${insp.address}` : ""}`;
    const link = `${APP_BASE_URL}/executive/review/${insp.id}`;

    let text: string;
    const blocks: any[] = [];

    if (event_type === "submitted") {
      let inspectorName = "Inspector";
      if (insp.inspector_id) {
        const { data: insProf } = await sb
          .from("profiles").select("full_name, email").eq("id", insp.inspector_id).single();
        inspectorName = insProf?.full_name ?? insProf?.email ?? inspectorName;
      }
      text = `🔍 Inspección lista para revisar — ${propertyLine}`;
      blocks.push(
        { type: "section", text: { type: "mrkdwn", text: `🔍 *Inspección lista para revisar*\n${who} tienes una nueva inspección pendiente.` } },
        { type: "section", fields: [
          { type: "mrkdwn", text: `*Propiedad:*\n${propertyLine}` },
          { type: "mrkdwn", text: `*Inspector:*\n${inspectorName}` },
        ]},
        { type: "actions", elements: [
          { type: "button", text: { type: "plain_text", text: "Revisar inspección" }, url: link, style: "primary" },
        ]},
      );
    } else {
      // owner_feedback — fetch latest version summary
      const { data: version } = await sb
        .from("inspection_report_versions")
        .select("owner_decision_summary_json")
        .eq("inspection_id", inspection_id)
        .eq("audience", "owner")
        .eq("is_latest", true)
        .maybeSingle();
      const s: any = version?.owner_decision_summary_json ?? {};
      const accepted = s.accepted ?? 0, rejected = s.rejected ?? 0, observed = s.observed ?? 0;

      text = `💬 Feedback del propietario — ${propertyLine}`;
      blocks.push(
        { type: "section", text: { type: "mrkdwn", text: `💬 *Feedback del propietario recibido*\n${who} el propietario respondió a tu reporte.` } },
        { type: "section", fields: [
          { type: "mrkdwn", text: `*Propiedad:*\n${propertyLine}` },
          { type: "mrkdwn", text: `*Decisiones:*\n✅ ${accepted} · ❌ ${rejected} · 👁️ ${observed}` },
        ]},
        { type: "actions", elements: [
          { type: "button", text: { type: "plain_text", text: "Ver feedback" }, url: link, style: "primary" },
        ]},
      );
    }

    const slackRes = await slackCall("chat.postMessage", {
      channel: SLACK_CHANNEL,
      username: "Homie Inspection",
      icon_emoji: ":house:",
      text,
      blocks,
      unfurl_links: false,
      unfurl_media: false,
    });

    if (!slackRes?.ok) {
      await sb.from("slack_notifications_log").insert({
        inspection_id, event_type,
        slack_channel: SLACK_CHANNEL,
        recipient_email: execEmail,
        recipient_slack_user_id: slackUid,
        status: "failed",
        error_message: slackRes?.error ?? "unknown",
      });
      return json(502, { error: "slack_post_failed", detail: slackRes?.error });
    }

    await sb.from("slack_notifications_log").insert({
      inspection_id, event_type,
      slack_channel: SLACK_CHANNEL,
      slack_message_ts: slackRes.ts ?? null,
      recipient_email: execEmail,
      recipient_slack_user_id: slackUid,
      status: "sent",
    });

    return json(200, { status: "sent", ts: slackRes.ts });
  } catch (e: any) {
    console.error("notify-executive-slack error", e);
    return json(500, { error: e?.message ?? "internal_error" });
  }
});
