import { supabase } from '@/integrations/supabase/client';

export type SimStep = 'assign' | 'keys' | 'visit' | 'availability' | 'submit' | 'publish' | 'final';

/** Genera una imagen JPEG de prueba (sin archivos en el repo). */
async function testImage(label: string): Promise<Blob> {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
  const g = c.getContext('2d')!;
  g.fillStyle = '#525EA2'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#FFFFFF'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center';
  g.fillText('FOTO DE PRUEBA', 600, 420); g.font = '40px sans-serif'; g.fillText(label, 600, 500);
  return new Promise((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('canvas'))), 'image/jpeg', 0.8));
}

export async function uploadTestPhotos(inspectionId: string, sectionKey: string, count: number): Promise<string[]> {
  const paths: string[] = [];
  for (let n = 1; n <= count; n++) {
    const path = `inspections/${inspectionId}/${sectionKey}/${crypto.randomUUID()}.jpg`;
    const blob = await testImage(`${sectionKey} ${n}/${count} · ${new Date().toLocaleString('es-CL')}`);
    const { error } = await supabase.storage.from('inspection-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

export async function simulateStep(inspectionId: string, step: SimStep, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc('rm_simulate_step', { p_id: inspectionId, p_step: step, p_params: params as never });
  if (error) throw error;
  return data as { step: string; events: string[] };
}
