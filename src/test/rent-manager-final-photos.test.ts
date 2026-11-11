import { describe, expect, it } from 'vitest';
import { preparePhotoPayload, type PhotoObject } from '../../supabase/functions/_shared/rent-manager-photos';

const photo = (n: number): PhotoObject => ({ bucket: 'inspection-photos', path: `final-${n}.jpg` });
const link = async (p: PhotoObject) => `https://photos.example/${p.path}?signed=example`;
const row = (objects: PhotoObject[]) => ({
  event_type: 'inspection.final_photos_ready', inspection_id: 'test-inspection',
  payload: { source: 'homie_inspection', event_type: 'inspection.final_photos_ready', data: { fotos: [] } },
  photo_objects: objects,
});

describe('Rent Manager complete final-photo gallery', () => {
  it('after uploading three final photos the last notice contains all three ordered links', async () => {
    const current: PhotoObject[] = [];
    let payload;
    for (let n = 1; n <= 3; n++) {
      current.push(photo(n));
      payload = await preparePhotoPayload(row([photo(n)]), async () => [...current], link);
    }
    expect(payload?.data.fotos).toEqual([
      'https://photos.example/final-1.jpg?signed=example',
      'https://photos.example/final-2.jpg?signed=example',
      'https://photos.example/final-3.jpg?signed=example',
    ]);
  });
  it('refreshes an older queued notice from the current gallery instead of its obsolete snapshot', async () => {
    const result = await preparePhotoPayload(row([photo(1)]), async () => [photo(2), photo(3)], link);
    expect(result.data).toEqual({ fotos: [await link(photo(2)), await link(photo(3))] });
  });
  it('sends an empty replacement after all final photos have been removed', async () => {
    expect((await preparePhotoPayload(row([photo(1)]), async () => [], link)).data.fotos).toEqual([]);
  });
  it('keeps commercial-photo snapshots unchanged', async () => {
    const event = { ...row([photo(1)]), event_type: 'inspection.commercial_photos_ready' };
    expect((await preparePhotoPayload(event, async () => [photo(2)], link)).data.fotos).toEqual([await link(photo(1))]);
  });
});