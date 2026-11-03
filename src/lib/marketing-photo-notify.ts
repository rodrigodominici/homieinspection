import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';

export async function notifyMarketingPhotos(inspectionId: string) {
  const { error } = await supabase.functions.invoke('notify-marketing-photos', { body: { inspection_id: inspectionId } });
  if (error) console.warn('No se pudo enviar el aviso de fotos', error instanceof FunctionsHttpError ? await error.context.text() : error.message);
}

export async function notifyMarketingSection(sectionId: string) {
  const { data } = await supabase.from('inspection_sections').select('inspection_id,section_key').eq('id', sectionId).maybeSingle();
  if (data?.section_key === 'marketing_photos') await notifyMarketingPhotos(data.inspection_id);
}