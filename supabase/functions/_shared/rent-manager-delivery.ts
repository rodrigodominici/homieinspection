export const RETRY_SECONDS = [60, 300, 900, 3600, 21600];
export function deliveryResult(status: number | null, attempts: number, now = Date.now()) {
  if (status === 200) return { status: 'sent', next_attempt_at: null };
  const retry = status === null || status >= 500 || status === 429;
  return { status: 'error', next_attempt_at: retry ? new Date(now + RETRY_SECONDS[Math.min(Math.max(attempts - 1, 0), 4)] * 1000).toISOString() : null };
}
export function configured(url: string | undefined, secret: string | undefined) {
  return Boolean(url?.trim() && secret?.trim());
}
export function simulatedReceiver(payload: Record<string, unknown>, seen: Set<string>, responseStatus = 200) {
  if (responseStatus !== 200) return { status: responseStatus, body: { ok: false, error: 'Respuesta de prueba' } };
  if (payload.source !== 'homie_inspection' || typeof payload.event_id !== 'string' || !payload.inspection_id || !payload.external_object_id) {
    return { status: 400, body: { ok: false, error: 'Evento inválido' } };
  }
  const duplicate = seen.has(payload.event_id);
  seen.add(payload.event_id);
  return { status: 200, body: { ok: true, result: duplicate ? 'duplicado' : 'aplicado', simulated: true } };
}
export function isHead(row: { id: string; inspection_id: string; created_at: string }, rows: { id: string; inspection_id: string; created_at: string; status: string }[]) {
  return !rows.some(r => r.inspection_id === row.inspection_id && ['pending', 'sending', 'error'].includes(r.status) && (r.created_at < row.created_at || (r.created_at === row.created_at && r.id < row.id)));
}