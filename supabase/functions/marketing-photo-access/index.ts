import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createMarketingLinkToken, verifyMarketingLinkToken } from '../_shared/marketing-photo-link.ts';
import { marketingPhotosReady } from '../_shared/marketing-photo-message.ts';

const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const secret = Deno.env.get('MARKETING_PHOTO_LINK_SECRET');
    if (!url || !key || !secret) return json(503, { error: 'server_not_configured' });
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const body = await req.json();
    let id: string;
    let expires = 0;
    if (body.action === 'open') {
      if (typeof body.token !== 'string' || body.token.length > 200) return json(400, { error: 'invalid_link' });
      const verified = await verifyMarketingLinkToken(body.token, secret);
      if (!verified) return json(410, { error: 'expired_or_invalid_link' });
      id = verified.id; expires = verified.expires;
    } else if (body.action === 'create') {
      if (typeof body.inspection_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.inspection_id)) return json(400, { error: 'invalid_inspection' });
      id = body.inspection_id;
      const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) return json(401, { error: 'unauthorized' });
      const { data: auth, error } = await sb.auth.getUser(token);
      if (error || !auth.user) return json(401, { error: 'unauthorized' });
      const { data: profile } = await sb.from('profiles').select('role,is_active,approval_status').eq('id', auth.user.id).single();
      const { data: insp } = await sb.from('inspections').select('market,inspector_id,executive_id').eq('id', id).single();
      const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', auth.user.id).eq('role', 'hunter');
      const hunter = !!roles?.length;
      const { data: marketAllowed } = await sb.rpc('user_has_market', { _user_id: auth.user.id, _market: insp?.market ?? '' });
      if (!profile?.is_active || profile.approval_status !== 'approved' || !insp || !(hunter || (marketAllowed && (profile.role === 'admin' || (profile.role === 'executive' && insp.executive_id === auth.user.id) || (profile.role === 'inspector' && insp.inspector_id === auth.user.id))))) return json(403, { error: 'forbidden' });
    } else return json(400, { error: 'invalid_action' });
    const { data: insp, error: inspError } = await sb.from('inspections').select('id,inspection_type,market,address,property_name').eq('id', id).single();
    if (inspError || !insp || insp.inspection_type !== 'captacion' || !['CL', 'MX'].includes(insp.market)) return json(404, { error: 'gallery_not_available' });
    const { data: section, error: sectionError } = await sb.from('inspection_sections').select('id,status').eq('inspection_id', id).eq('section_key', 'marketing_photos').maybeSingle();
    if (sectionError) throw sectionError;
    if (!section) return json(404, { error: 'gallery_not_available' });
    const { data: photos, error: photoError } = await sb.from('inspection_photos').select('id,inspection_id,storage_bucket,storage_path,caption,created_at').eq('inspection_id', id).eq('inspection_section_id', section.id).eq('photo_stage', 'marketing').order('sort_order').order('created_at');
    if (photoError) throw photoError;
    if (!marketingPhotosReady(insp.inspection_type, section.status, photos?.length ?? 0)) return json(409, { error: 'gallery_not_ready' });
    if (body.action === 'create') {
      const link = await createMarketingLinkToken(id, secret);
      const base = Deno.env.get('APP_BASE_URL') ?? 'https://app.inspection.homie.mx';
      return json(200, { link: `${base}/fotos-comercializacion#${link.token}`, expires_at: new Date(link.expires * 1000).toISOString() });
    }
    const ttl = Math.min(300, expires - Math.floor(Date.now() / 1000));
    if (ttl <= 0) return json(410, { error: 'expired_or_invalid_link' });
    const signed = await Promise.all((photos ?? []).map(async photo => {
      const { data, error } = await sb.storage.from(photo.storage_bucket).createSignedUrl(photo.storage_path, ttl);
      if (error || !data?.signedUrl) throw new Error('photo_unavailable');
      return { ...photo, captacion_date: photo.created_at, signed_url: data.signedUrl };
    }));
    return json(200, { property: insp.address ?? insp.property_name, expires_at: new Date(expires * 1000).toISOString(), photos: signed });
  } catch {
    return json(500, { error: 'gallery_unavailable' });
  }
});