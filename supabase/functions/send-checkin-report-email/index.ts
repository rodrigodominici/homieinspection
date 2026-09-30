// Envía al inquilino (solo Chile) el informe de entrega del check-in.
// El destinatario se toma de la propia inspección (nunca del navegador).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const LINK_DAYS = 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f-]{36}$/i

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const clean = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length ? s : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return json({ ok: false, error: 'unauthorized' }, 401)
  const userId = userData.user.id

  let body: any
  try { body = await req.json() } catch { return json({ ok: false, error: 'invalid_json' }, 400) }
  const inspectionId = body?.inspection_id
  const resend = body?.resend === true
  if (typeof inspectionId !== 'string' || !UUID_RE.test(inspectionId)) {
    return json({ ok: false, error: 'invalid_inspection_id' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  const [{ data: profile }, { data: insp, error: inspErr }] = await Promise.all([
    admin.from('profiles').select('id, role, is_active').eq('id', userId).maybeSingle(),
    admin.from('inspections')
      .select('id, status, market, inspection_type, inspector_id, property_name, address, completed_at, scheduled_at, property_snapshot_json, property_overrides_json')
      .eq('id', inspectionId).maybeSingle(),
  ])
  if (inspErr || !insp) return json({ ok: false, error: 'not_found' }, 404)
  const allowed = profile?.is_active && (
    profile.role === 'admin' || profile.role === 'executive' || insp.inspector_id === userId
  )
  if (!allowed) return json({ ok: false, error: 'forbidden' }, 403)

  if (insp.inspection_type !== 'check_in') return json({ ok: true, skipped: true, reason: 'not_checkin' })
  if (String(insp.market ?? '').toUpperCase() !== 'CL') return json({ ok: true, skipped: true, reason: 'not_chile' })
  if (insp.status !== 'sent') return json({ ok: true, skipped: true, reason: 'not_finalized' })

  // Destinatario: email capturado en la inspección ("Email de Quien Recibe"), luego snapshot.
  const { data: fv } = await admin.from('inspection_field_values')
    .select('field_key, value_text')
    .eq('inspection_id', inspectionId)
    .in('field_key', ['handover_email', 'ctx_recipient_email'])
  const snap = { ...(insp.property_snapshot_json ?? {}), ...(insp.property_overrides_json ?? {}) } as Record<string, any>
  const candidates = [
    fv?.find((f) => f.field_key === 'handover_email')?.value_text,
    fv?.find((f) => f.field_key === 'ctx_recipient_email')?.value_text,
    snap.tenant_email, snap.recipient_email,
  ].map(clean).filter((e): e is string => !!e && EMAIL_RE.test(e))
  const recipient = candidates[0]?.toLowerCase()

  const logAudit = (action: string, note: string) =>
    admin.from('inspection_audit_log').insert({
      inspection_id: inspectionId, action, note, performed_by: userId,
      previous_status: insp.status, new_status: insp.status,
    })

  if (!recipient) {
    await logAudit('checkin_report_email_no_recipient', 'Sin email del inquilino en la inspección')
    return json({ ok: false, reason: 'no_recipient' })
  }

  const { data: file } = await admin.from('inspection_report_files')
    .select('id, storage_path').eq('inspection_id', inspectionId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!file) return json({ ok: false, reason: 'no_pdf' })

  const { data: signed, error: signErr } = await admin.storage.from('inspection-reports')
    .createSignedUrl(file.storage_path, LINK_DAYS * 86400, { download: 'informe-de-entrega.pdf' })
  if (signErr || !signed?.signedUrl) return json({ ok: false, error: 'sign_failed' }, 500)

  const dateIso = insp.completed_at ?? insp.scheduled_at
  const handoverDate = dateIso
    ? new Date(dateIso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' })
    : undefined

  try {
    const result = await sendTemplateEmail('checkin-report-ready', recipient, {
      templateData: {
        tenantName: clean(snap.tenant_name) ?? undefined,
        propertyLabel: clean(insp.property_name) ?? clean(insp.address) ?? undefined,
        handoverDate,
        reportUrl: signed.signedUrl,
        linkDays: LINK_DAYS,
      },
      idempotencyKey: resend
        ? `checkin-report-${inspectionId}-${file.id}-resend-${Date.now()}`
        : `checkin-report-${inspectionId}-${file.id}`,
    })
    if (!result.sent) {
      await logAudit('checkin_report_email_suppressed', `Destinatario bloqueado: ${recipient}`)
      return json({ ok: false, reason: 'recipient_suppressed', recipient })
    }
    await logAudit(resend ? 'checkin_report_email_resent' : 'checkin_report_email_sent', `Enviado a ${recipient}`)
    return json({ ok: true, sent: true, recipient })
  } catch (e: any) {
    console.error('send-checkin-report-email failed', e?.code, e?.message)
    await logAudit('checkin_report_email_failed', `Falló envío a ${recipient}: ${e?.code ?? e?.message ?? 'error'}`)
    return json({ ok: false, error: 'send_failed', code: e?.code ?? null }, 502)
  }
})
