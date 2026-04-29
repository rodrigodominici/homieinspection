// Communications dispatcher edge function.
// Takes a system event, evaluates active rules, resolves recipient, renders
// template variables, calls the provider adapter, and writes a row to
// `communication_deliveries` for full traceability.
//
// Public (verify_jwt = false) — invoked fire-and-forget from the client.
// All persistence uses the service role.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';
import { getProvider } from '../_shared/communication-providers/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RequestBody {
  event_name: string;
  inspection_id: string;
  payload?: Record<string, unknown>;
}

function renderTemplate(value: string, vars: Record<string, string>): string {
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

function getString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { event_name, inspection_id, payload = {} } = body ?? {};
  if (!event_name || !inspection_id) {
    return new Response(JSON.stringify({ error: 'missing_fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Load inspection + snapshot
  const { data: inspection, error: inspErr } = await supabase
    .from('inspections')
    .select('id, market, property_name, address, scheduled_at, inspector_id, property_snapshot_json, property_overrides_json')
    .eq('id', inspection_id)
    .maybeSingle();

  if (inspErr || !inspection) {
    return new Response(JSON.stringify({ error: 'inspection_not_found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Load active rules for this event (filtered by market when set)
  const { data: rules } = await supabase
    .from('communication_rules')
    .select('*')
    .eq('event_name', event_name)
    .eq('is_active', true);

  const matchingRules = (rules ?? []).filter(
    (r) => r.market === null || r.market === inspection.market,
  );

  if (matchingRules.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const snapshot = {
    ...(inspection.property_snapshot_json ?? {}),
    ...(inspection.property_overrides_json ?? {}),
  } as Record<string, unknown>;

  // Optional inspector profile
  let inspectorProfile: { full_name: string | null; email: string | null; phone: string | null; country_code: string | null } | null = null;
  if (inspection.inspector_id) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name, email, phone, country_code')
      .eq('id', inspection.inspector_id)
      .maybeSingle();
    inspectorProfile = prof ?? null;
  }

  const baseVars: Record<string, string> = {
    property_name: (inspection.property_name as string) ?? '',
    address: (inspection.address as string) ?? '',
    scheduled_at: (inspection.scheduled_at as string) ?? '',
    inspector_name: inspectorProfile?.full_name ?? '',
    owner_name: getString(snapshot, 'owner_name') ?? getString(snapshot, 'recipient_email') ?? '',
    tenant_name: getString(snapshot, 'tenant_name') ?? '',
    public_url: getString(payload, 'public_url') ?? '',
  };

  const results: unknown[] = [];

  for (const rule of matchingRules) {
    // Resolve recipient
    let recipient: string | null = null;
    if (rule.recipient_type === 'inspector') {
      recipient = rule.channel === 'email'
        ? inspectorProfile?.email ?? null
        : ((inspectorProfile?.country_code ?? '') + (inspectorProfile?.phone ?? '')) || null;
    } else if (rule.recipient_type === 'owner') {
      recipient = rule.channel === 'email'
        ? getString(snapshot, 'recipient_email')
        : getString(snapshot, 'owner_whatsapp');
    } else if (rule.recipient_type === 'tenant') {
      recipient = rule.channel === 'email'
        ? getString(snapshot, 'tenant_email')
        : getString(snapshot, 'tenant_whatsapp');
    }

    // Load template
    const { data: template } = await supabase
      .from('communication_templates')
      .select('*')
      .eq('template_key', rule.template_key)
      .eq('is_active', true)
      .maybeSingle();

    const baseRow = {
      event_name,
      inspection_id,
      rule_id: rule.id,
      channel: rule.channel,
      provider_key: rule.provider_key,
      recipient_type: rule.recipient_type,
      recipient_value: recipient,
      template_key: rule.template_key,
      request_payload_json: { variables: baseVars, payload },
    };

    if (!recipient) {
      await supabase.from('communication_deliveries').insert({
        ...baseRow,
        status: 'skipped',
        error_message: 'recipient_not_resolved',
      });
      results.push({ rule_id: rule.id, status: 'skipped', reason: 'recipient_not_resolved' });
      continue;
    }

    if (!template) {
      await supabase.from('communication_deliveries').insert({
        ...baseRow,
        status: 'skipped',
        error_message: `template_not_found:${rule.template_key}`,
      });
      results.push({ rule_id: rule.id, status: 'skipped', reason: 'template_not_found' });
      continue;
    }

    const provider = getProvider(rule.provider_key);
    const previewRendered = template.preview_text ? renderTemplate(template.preview_text, baseVars) : null;

    let result;
    try {
      result = await provider.send({
        channel: rule.channel,
        recipient,
        templateKey: template.template_key,
        externalTemplateName: template.external_template_name,
        language: template.language,
        variables: baseVars,
        previewText: previewRendered,
      });
    } catch (err) {
      result = { status: 'error' as const, errorMessage: String(err) };
    }

    await supabase.from('communication_deliveries').insert({
      ...baseRow,
      status: result.status,
      error_message: result.errorMessage ?? null,
      provider_message_id: result.providerMessageId ?? null,
      response_payload_json: (result.raw as Record<string, unknown> | undefined) ?? null,
      sent_at: result.status === 'sent' ? new Date().toISOString() : null,
    });

    results.push({ rule_id: rule.id, status: result.status });
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
