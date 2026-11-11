import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { preparePhotoPayload } from '../../supabase/functions/_shared/rent-manager-photos';

describe.skipIf(!process.env.PGHOST)('Rent Manager final photos transactional regression', () => {
  it('three persisted final photos produce a last notification with three ordered links, without committing or dispatching', async () => {
    const sql = postgres({ max: 1 });
    const rollback = new Error('rollback_test_fixture');
    let links: string[] = [];
    let count = 0;
    try {
      await sql.begin(async tx => {
        const [inspection] = await tx`
          INSERT INTO public.inspections(property_id,market,inspection_type,property_snapshot_json,is_test)
          VALUES('final-photos-regression','CL','captacion','{}',true) RETURNING id`;
        await tx`INSERT INTO public.inspection_external_references(inspection_id,provider,external_object_type,external_object_id,metadata)
          VALUES(${inspection.id},'rent_manager','property','final-photos-regression','{"rm_inspection_id":"final-photos-regression"}')`;
        const [section] = await tx`INSERT INTO public.inspection_sections(inspection_id,section_key,section_title,section_type,sort_order)
          VALUES(${inspection.id},'regression_final','Final photos','photos',1) RETURNING id`;
        for (let n = 1; n <= 3; n++) {
          await tx`INSERT INTO public.inspection_photos(inspection_id,inspection_section_id,photo_stage,storage_path,sort_order)
            VALUES(${inspection.id},${section.id},'after',${`regression/final-${n}.jpg`},${n})`;
        }
        const events = await tx`SELECT * FROM public.rent_manager_outbox WHERE inspection_id=${inspection.id}
          AND event_type='inspection.final_photos_ready' ORDER BY created_at,id`;
        count = events.length;
        const last = events.at(-1);
        if (!last) throw new Error('missing_final_photo_notification');
        const payload = await preparePhotoPayload(last as Parameters<typeof preparePhotoPayload>[0], async id => {
          const photos = await tx`SELECT storage_bucket AS bucket,storage_path AS path FROM public.inspection_photos
            WHERE inspection_id=${id} AND photo_stage='after' ORDER BY sort_order,created_at,id`;
          return photos.map(p => ({ bucket: p.bucket as string, path: p.path as string }));
        }, async photo => `https://photos.example/${photo.path}?signed=example`);
        links = payload.data.fotos;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await sql.end();
    }
    expect(count).toBe(3);
    expect(links).toEqual([1, 2, 3].map(n => `https://photos.example/regression/final-${n}.jpg?signed=example`));
  });
});