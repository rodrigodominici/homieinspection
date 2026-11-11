import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'unauthorized' });
  const { data: auth } = await sb.auth.getUser(token);
  if (!auth?.user) return json(401, { error: 'unauthorized' });
  const { data: p } = await sb.from('profiles').select('is_active,approval_status').eq('id', auth.user.id).maybeSingle();
  const { data: isAdmin } = await sb.rpc('has_role', { _user_id: auth.user.id, _role: 'admin' });
  if (!p?.is_active || p.approval_status !== 'approved' || isAdmin !== true) return json(403, { error: 'forbidden' });

  const body = await req.json().catch(() => ({}));
  let ids: string[] = [];
  if (body?.all_test === true) {
    const { data, error } = await sb.from('inspections').select('id').eq('is_test', true);
    if (error) return json(500, { error: error.message });
    ids = (data ?? []).map((r: any) => r.id);
  } else if (typeof body?.inspection_id === 'string' && UUID.test(body.inspection_id)) {
    ids = [body.inspection_id];
  } else return json(400, { error: 'inspection_id or all_test required' });

  if (body?.dry_run === true) return json(200, { count: ids.length });
  if (ids.length === 0) return json(200, { deleted: 0, files_removed: 0 });

  const [{ data: photos }, { data: files }] = await Promise.all([
    sb.from('inspection_photos').select('storage_path').in('inspection_id', ids),
    sb.from('inspection_report_files').select('storage_path').in('inspection_id', ids),
  ]);
  const photoPaths = (photos ?? []).map((r: any) => r.storage_path).filter(Boolean);
  const filePaths = (files ?? []).map((r: any) => r.storage_path).filter(Boolean);

  // Base de datos primero, todo o nada.
  const { data: deleted, error } = await sb.rpc('purge_inspections', { p_ids: ids });
  if (error) return json(500, { error: error.message });

  let removed = 0; const storageErrors: string[] = [];
  for (const [bucket, paths] of [['inspection-photos', photoPaths], ['inspection-reports', filePaths]] as const) {
    for (let i = 0; i < paths.length; i += 100) {
      const { data, error: e } = await sb.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (e) storageErrors.push(`${bucket}: ${e.message}`); else removed += data?.length ?? 0;
    }
  }
  return json(200, { deleted, files_removed: removed, storage_errors: storageErrors });
});
