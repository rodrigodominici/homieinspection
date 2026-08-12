/**
 * sign-public-photo
 * Public (no JWT). Returns short-lived signed URLs for photos belonging to a
 * published report version, after verifying:
 *   token → published+latest version → owns photo ids → property_id matches.
 *
 * Accepts either a single `photo_id` (legacy) or a `photo_ids` array (batch).
 * The batch path keeps the verification cost at 3 DB queries for the whole
 * report instead of 3 per photo — public reports with 150+ photos were the top
 * source of load on this function.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TTL_SECONDS = 3600;
const MAX_BATCH = 200;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    const property_id = typeof body?.property_id === 'string' ? body.property_id : null;
    const token = typeof body?.token === 'string' ? body.token : null;

    const ids: string[] = Array.isArray(body?.photo_ids)
      ? body.photo_ids.filter((v: unknown) => typeof v === 'string').slice(0, MAX_BATCH)
      : typeof body?.photo_id === 'string'
        ? [body.photo_id]
        : [];

    if (!property_id || !token || ids.length === 0) {
      return json({ error: 'missing_params' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1) Resolve token → inspection_id (must be published + latest)
    const { data: version, error: vErr } = await supabase
      .from('inspection_report_versions')
      .select('inspection_id')
      .eq('public_token', token)
      .eq('status', 'published')
      .eq('is_latest', true)
      .maybeSingle();
    if (vErr || !version) return json({ error: 'not_found' }, 404);

    // 2) Verify property_id matches the inspection
    const { data: insp } = await supabase
      .from('inspections')
      .select('property_id')
      .eq('id', version.inspection_id)
      .maybeSingle();
    if (!insp || insp.property_id !== property_id) return json({ error: 'not_found' }, 404);

    // 3) Verify every photo belongs to this inspection
    const { data: photos } = await supabase
      .from('inspection_photos')
      .select('id, storage_path')
      .eq('inspection_id', version.inspection_id)
      .in('id', ids);
    const rows = (photos ?? []).filter((p) => p.storage_path);
    if (rows.length === 0) return json({ error: 'not_found' }, 404);

    // 4) Sign in one storage call
    const { data: signed, error: sErr } = await supabase
      .storage.from('inspection-photos')
      .createSignedUrls(rows.map((p) => p.storage_path as string), TTL_SECONDS);
    if (sErr || !signed) return json({ error: 'sign_failed' }, 500);

    const byPath = new Map<string, string>();
    for (const s of signed) {
      if (s.path && s.signedUrl) byPath.set(s.path, s.signedUrl);
    }

    const urls: Record<string, string> = {};
    for (const p of rows) {
      const url = byPath.get(p.storage_path as string);
      if (url) urls[p.id as string] = url;
    }

    // Legacy single-photo callers keep receiving `{ url }`.
    const single = ids.length === 1 ? urls[ids[0]] : undefined;
    return json({ urls, ...(single ? { url: single } : {}) }, 200, {
      'Cache-Control': 'private, max-age=3000',
    });
  } catch (e) {
    return json({ error: 'unexpected', detail: String(e) }, 500);
  }
});
