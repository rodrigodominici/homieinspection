/**
 * sign-public-photo
 * Public (no JWT). Returns a short-lived signed URL for a photo belonging
 * to a published report version, after verifying:
 *   token → published+latest version → owns photo_id → property_id matches.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TTL_SECONDS = 3600;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    const property_id = typeof body?.property_id === 'string' ? body.property_id : null;
    const token = typeof body?.token === 'string' ? body.token : null;
    const photo_id = typeof body?.photo_id === 'string' ? body.photo_id : null;

    if (!property_id || !token || !photo_id) {
      return new Response(JSON.stringify({ error: 'missing_params' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
    if (vErr || !version) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Verify property_id matches the inspection
    const { data: insp } = await supabase
      .from('inspections')
      .select('property_id')
      .eq('id', version.inspection_id)
      .maybeSingle();
    if (!insp || insp.property_id !== property_id) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3) Verify photo belongs to this inspection
    const { data: photo } = await supabase
      .from('inspection_photos')
      .select('storage_path')
      .eq('id', photo_id)
      .eq('inspection_id', version.inspection_id)
      .maybeSingle();
    if (!photo?.storage_path) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4) Sign
    const { data: signed, error: sErr } = await supabase
      .storage.from('inspection-photos')
      .createSignedUrl(photo.storage_path, TTL_SECONDS);
    if (sErr || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: 'sign_failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ url: signed.signedUrl }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=3000',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'unexpected', detail: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
