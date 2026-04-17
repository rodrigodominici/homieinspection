/**
 * QA Storage Wipe — manual operator script.
 *
 * Deletes every object under `inspections/` in the `inspection-photos` bucket.
 * Intended for QA reset only. NOT part of any SQL migration.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/qa-storage-wipe.ts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = 'inspection-photos';
const ROOT = 'inspections';

async function listAll(prefix: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [prefix];
  while (stack.length) {
    const dir = stack.pop()!;
    const { data, error } = await supabase.storage.from(BUCKET).list(dir, { limit: 1000 });
    if (error) throw error;
    for (const entry of data ?? []) {
      const path = `${dir}/${entry.name}`;
      // Folders have null id in supabase-js list response
      if (entry.id === null) stack.push(path);
      else out.push(path);
    }
  }
  return out;
}

async function main() {
  console.log(`Listing objects under ${BUCKET}/${ROOT}/ ...`);
  const paths = await listAll(ROOT);
  console.log(`Found ${paths.length} objects.`);
  if (!paths.length) return;

  let deleted = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      console.error(`Batch ${i / 100} failed:`, error.message);
      continue;
    }
    deleted += batch.length;
    console.log(`Deleted ${deleted}/${paths.length}`);
  }
  console.log(`Done. Total deleted: ${deleted}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
