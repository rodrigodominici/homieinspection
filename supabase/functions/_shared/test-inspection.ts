// Inspecciones de prueba (is_test): se omiten Slack, correo y HubSpot.
export async function isTestInspection(sb: any, inspectionId: string): Promise<boolean> {
  const { data } = await sb.from('inspections').select('is_test').eq('id', inspectionId).maybeSingle();
  return data?.is_test === true;
}
/** es_prueba es opcional y solo se respeta para source rent_manager. */
export function readTestFlag(source: string, body: any): boolean {
  if (source !== 'rent_manager') return false;
  return body?.es_prueba === true || body?.data?.es_prueba === true;
}
