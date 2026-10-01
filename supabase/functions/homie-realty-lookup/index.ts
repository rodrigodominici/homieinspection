// Lookup de inmuebles en la API de Homie por reference-id (ej. RE0003927).
// Se ejecuta server-side para no exponer el token de la API al navegador.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const DEFAULT_API_BASE = 'https://api.homierent.com/real-estate/realties/reference-id';

function normMarket(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v === 'cl' || v === 'chile') return 'CL';
  if (v === 'mx' || v === 'mexico' || v === 'méxico') return 'MX';
  if (v === 'pe' || v === 'peru' || v === 'perú') return 'PE';
  return v.toUpperCase() || 'CL';
}

async function loadMarketConfig(market: string) {
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await sb.from('market_realty_api_settings')
      .select('base_url, business_unit, is_active').eq('market', market).maybeSingle();
    return data as { base_url: string; business_unit: string | null; is_active: boolean } | null;
  } catch (e) {
    console.error('[homie-realty-lookup] config load failed', e);
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type Attr = { id?: string; value?: string };

function attrMap(attrs: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(attrs)) {
    for (const a of attrs as Attr[]) {
      if (a?.id) out[a.id] = String(a.value ?? '');
    }
  }
  return out;
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const bool = (v: string | undefined): boolean | undefined =>
  v === undefined ? undefined : v.toLowerCase() === 'true';

function mapRealtyType(realtyType: string | undefined, bedrooms: number | undefined): string {
  const t = (realtyType ?? '').toUpperCase();
  if (t === 'HOUSE' || t === 'CASA') return 'casa';
  if (bedrooms === 0) return 'estudio';
  return 'departamento';
}

function buildAddress(r: Record<string, unknown>): string {
  const street = String(r.street ?? '').trim();
  const ext = String(r.extNumber ?? '').trim();
  const int = String(r.intNumber ?? '').trim();
  const base = [street, ext].filter(Boolean).join(' ');
  return int ? `${base} D ${int}` : base;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const token = Deno.env.get('HOMIE_API_TOKEN');
  const businessUnit = Deno.env.get('HOMIE_BUSINESS_UNIT') ?? 'HOMIERENT_CHILE';
  if (!token) return json({ error: 'HOMIE_API_TOKEN is not configured' }, 500);

  let referenceId = '';
  let unit = businessUnit;
  let unitExplicit = false;
  let market = 'CL';
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      referenceId = url.searchParams.get('reference_id') ?? '';
      const u = url.searchParams.get('business_unit');
      if (u) { unit = u; unitExplicit = true; }
      market = normMarket(url.searchParams.get('market') ?? 'CL');
    } else {
      const body = await req.json();
      referenceId = String(body?.reference_id ?? '');
      if (body?.business_unit) { unit = String(body.business_unit); unitExplicit = true; }
      market = normMarket(String(body?.market ?? 'CL'));
    }
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  referenceId = referenceId.trim().toUpperCase();
  if (!/^[A-Z0-9._-]{3,32}$/.test(referenceId)) {
    return json({ error: 'invalid_reference_id' }, 400);
  }

  const cfg = await loadMarketConfig(market);
  if (cfg && !cfg.is_active) return json({ error: 'market_disabled', market }, 400);
  const apiBase = (cfg?.base_url || DEFAULT_API_BASE).replace(/\/+$/, '');
  if (!unitExplicit && cfg?.business_unit) unit = cfg.business_unit;

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBase}/${encodeURIComponent(referenceId)}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'business-unit': unit,
        'content-type': 'application/json',
      },
    });
  } catch (e) {
    console.error('[homie-realty-lookup] network error', e);
    return json({ error: 'upstream_unreachable', details: String(e) }, 502);
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    console.error(`[homie-realty-lookup] upstream ${upstream.status}: ${text}`);
    return json(
      { error: 'upstream_error', status: upstream.status, details: text },
      upstream.status === 404 ? 404 : 502,
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ error: 'invalid_upstream_payload', details: text.slice(0, 500) }, 502);
  }

  const a = attrMap(raw.attributes);
  const bedrooms = num(a.BEDROOMS);
  const bathrooms = num(a.FULL_BATHROOMS);

  const property = {
    property_id: String(raw.homeId ?? referenceId),
    property_name: [String(raw.street ?? '').trim(), String(raw.extNumber ?? '').trim()]
      .filter(Boolean)
      .join(' '),
    address: buildAddress(raw),
    property_type: mapRealtyType(raw.realtyType as string | undefined, bedrooms),
    bedrooms_count: bedrooms ?? null,
    bathrooms_count: bathrooms ?? null,
    unit_number: String(raw.intNumber ?? '') || null,
    comuna: (raw.neighborhood as string | null) ?? null,
    city: typeof raw.city === 'string' ? raw.city.trim() : null,
    state: (raw.state as string | null) ?? null,
    country: (raw.country as string | null) ?? null,
    apartment_floor: raw.apartmentFloor ?? null,
    has_parking: bool(a.HAS_PARKING_SPACE) ?? null,
    parking_number: a.PARKING_NUMBER || null,
    has_storage: bool(a.HAS_WAREHOUSE) ?? null,
    storage_number: a.WAREHOUSE_NUMBER || null,
    total_area: num(a.TOTAL_AREA) ?? null,
    price: raw.price ?? null,
    currency: raw.currencyPrice ?? null,
    status: raw.status ?? null,
  };

  return json({ property, raw });
});
