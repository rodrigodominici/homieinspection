import { supabase } from '@/integrations/supabase/client';

type PurgeBody = { inspection_id?: string; all_test?: boolean; dry_run?: boolean };
export type PurgeResult = { count?: number; deleted?: number; files_removed?: number; storage_errors?: string[] };

/** Borrado completo del lado del servidor; solo admins. */
export async function purgeInspections(body: PurgeBody): Promise<PurgeResult> {
  const { data, error } = await supabase.functions.invoke('admin-purge-inspections', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as PurgeResult;
}
