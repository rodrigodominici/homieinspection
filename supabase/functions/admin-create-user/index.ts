// Admin-only edge function to create internal users (auth + profile in one call).
// Caller must be an authenticated admin (validated against the `profiles` table).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CreateUserBody {
  email: string;
  password: string;
  full_name: string;
  role: 'admin' | 'inspector' | 'executive';
  market: 'CL' | 'MX';
  country_code: string;
  phone: string;
  is_active: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function validate(body: Partial<CreateUserBody>): { ok: true; data: CreateUserBody } | { ok: false; error: string } {
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const full_name = (body.full_name ?? '').trim();
  const role = body.role;
  const market = body.market;
  const country_code = (body.country_code ?? '').trim();
  const phone = (body.phone ?? '').trim();
  const is_active = typeof body.is_active === 'boolean' ? body.is_active : true;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'invalid_email' };
  if (password.length < 8) return { ok: false, error: 'weak_password' };
  if (!full_name || full_name.length > 120) return { ok: false, error: 'invalid_full_name' };
  if (!['admin', 'inspector', 'executive'].includes(role ?? '')) return { ok: false, error: 'invalid_role' };
  if (!['CL', 'MX'].includes(market ?? '')) return { ok: false, error: 'invalid_market' };
  if (!/^\+\d{1,4}$/.test(country_code)) return { ok: false, error: 'invalid_country_code' };
  if (!/^\d{6,15}$/.test(phone)) return { ok: false, error: 'invalid_phone' };

  return {
    ok: true,
    data: { email, password, full_name, role: role!, market: market!, country_code, phone, is_active },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  try {

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // ── Auth: validate caller JWT and admin role ───────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: callerProfile, error: callerErr } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', callerId)
    .single();
  if (callerErr || !callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  // ── Body validation ────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }
  const v = validate((raw ?? {}) as Partial<CreateUserBody>);
  if (!v.ok) return jsonResponse({ error: 'validation', detail: v.error }, 400);
  const body = v.data;

  // ── Create auth user ───────────────────────────────────────────────────
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.full_name, role: body.role },
  });
  if (createErr || !created?.user) {
    const msg = (createErr?.message ?? '').toLowerCase();
    if (msg.includes('already')) return jsonResponse({ error: 'email_exists' }, 409);
    return jsonResponse({ error: 'create_failed', detail: createErr?.message }, 400);
  }

  const newUserId = created.user.id;

  // ── Update profile (the handle_new_user trigger seeds a stub row) ──────
  const { error: profileErr } = await admin
    .from('profiles')
    .update({
      full_name: body.full_name,
      email: body.email,
      role: body.role,
      market: body.market,
      country_code: body.country_code,
      phone: body.phone,
      is_active: body.is_active,
      approval_status: 'approved',
    })
    .eq('id', newUserId);

  if (profileErr) {
    // Best-effort cleanup so we don't leave an orphan auth user.
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    return jsonResponse({ error: 'profile_update_failed', detail: profileErr.message }, 500);
  }

  return jsonResponse({ id: newUserId }, 200);
  } catch (err) {
    console.error('admin-create-user unexpected error:', err);
    return jsonResponse({ error: 'internal_error', detail: (err as Error)?.message ?? String(err) }, 500);
  }
});
