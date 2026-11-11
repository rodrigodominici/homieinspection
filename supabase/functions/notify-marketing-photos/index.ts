import { isTestInspection } from '../_shared/test-inspection.ts';
import '../_shared/sandbox-guard.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { marketingPhotoMessage, marketingPhotosReady } from '../_shared/marketing-photo-message.ts';
import { createMarketingLinkToken } from '../_shared/marketing-photo-link.ts';

const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json(500, { error: 'server_not_configured' });
  const sb = createClient(url, key, { auth: { persistSession: false } });
  let claimedId: string | null = null;
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'unauthorized' });
    const { data: auth, error: authError } = await sb.auth.getUser(token);
    if (authError || !auth.user) return json(401, { error: 'unauthorized' });
    const { inspection_id, dry_run } = await req.json();
    if (typeof inspection_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(inspection_id)) return json(400, { error: 'invalid_inspection' });
    const { data: profile } = await sb.from('profiles').select('role,is_active,approval_status').eq('id', auth.user.id).single();
    const { data: insp } = await sb.from('inspections').select('id,inspection_type,property_name,address,property_id,market,inspector_id,executive_id').eq('id', inspection_id).single();
    if ((insp as any) && await isTestInspection(sb, inspection_id)) return json(200, { skipped: 'test_inspection' });
    const { data: marketAllowed } = await sb.rpc('user_has_market', { _user_id: auth.user.id, _market: insp?.market ?? '' });
    if (!profile?.is_active || profile.approval_status !== 'approved' || !insp || !marketAllowed || !(profile.role === 'admin' || (profile.role === 'inspector' && insp.inspector_id === auth.user.id) || (profile.role === 'executive' && insp.executive_id === auth.user.id))) return json(403, { error: 'forbidden' });
    const { data: section, error: sectionError } = await sb.from('inspection_sections').select('id,status').eq('inspection_id', inspection_id).eq('section_key', 'marketing_photos').maybeSingle();
    if (sectionError) throw sectionError;
    if (!section) return json(200, { status: 'noop', reason: 'not_ready' });
    const { count, error: countError } = await sb.from('inspection_photos').select('id', { count: 'exact', head: true }).eq('inspection_id', inspection_id).eq('inspection_section_id', section.id).eq('photo_stage', 'marketing');
    if (countError) throw countError;
    if (!marketingPhotosReady(insp.inspection_type, section.status, count ?? 0)) return json(200, { status: 'noop', reason: 'not_ready' });
    const { data: receptor } = await sb.from('profiles').select('full_name').eq('id', insp.inspector_id).maybeSingle();
    const base = Deno.env.get('APP_BASE_URL') ?? 'https://app.inspection.homie.mx';
    const linkSecret = Deno.env.get('MARKETING_PHOTO_LINK_SECRET');
    if (!linkSecret) return json(503, { error: 'link_not_configured' });
    const link = await createMarketingLinkToken(inspection_id, linkSecret);
    const text = marketingPhotoMessage(receptor?.full_name ?? 'Receptor', insp.property_name ?? insp.address ?? insp.property_id, count ?? 0, `${base}/fotos-comercializacion#${link.token}`);
    if (dry_run === true) return json(200, { status: 'preview', text });
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    const slackKey = Deno.env.get('SLACK_API_KEY');
    const channel = Deno.env.get('SLACK_MARKETING_PHOTOS_CHANNEL_ID') ?? Deno.env.get('SLACK_NOTIFICATIONS_CHANNEL_ID');
    if (!apiKey || !slackKey || !channel) return json(503, { error: 'slack_not_configured' });
    const claim = await sb.rpc('claim_marketing_photo_notification', { p_inspection_id: inspection_id });
    if (claim.error) throw claim.error;
    if (!claim.data) return json(200, { status: 'noop', reason: 'already_sent_or_sending' });
    claimedId = inspection_id;
    const response = await fetch('https://connector-gateway.lovable.dev/slack/api/chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'X-Connection-Api-Key': slackKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, text, username: 'Homie Inspection', icon_emoji: ':house:', unfurl_links: false, unfurl_media: false }) });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Slack [${response.status}]: ${raw}`);
    const slack = JSON.parse(raw);
    if (!slack.ok) throw new Error(`Slack [${response.status}]: ${raw}`);
    const saved = await sb.from('marketing_photo_notifications').update({ status: 'sent', sent_at: new Date().toISOString(), message_ts: slack.ts }).eq('inspection_id', inspection_id);
    if (saved.error) { console.error('Notification sent but receipt not persisted', saved.error.message); return json(200, { status: 'sent', receipt_pending: true }); }
    return json(200, { status: 'sent' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (claimedId) await sb.from('marketing_photo_notifications').update({ status: 'failed', error_message: message }).eq('inspection_id', claimedId);
    console.error('Marketing notification failed', message);
    return json(502, { error: 'notification_failed', details: message });
  }
});