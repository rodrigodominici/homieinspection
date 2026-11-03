// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ download }) } } }));
import { buildMarketingZip, photoFilename, type MarketingPhoto } from '@/lib/marketing-photo-download';
import JSZip from 'jszip';
const photo = (id: string): MarketingPhoto => ({ id, inspection_id: 'captacion', storage_bucket: 'inspection-photos', storage_path: 'same-name.jpg', caption: null, created_at: '', captacion_date: '' });
describe('marketing photo exports', () => {
  it('keeps every original even when their source filenames match', async () => {
    download.mockResolvedValue({ data: new Blob(['original bytes'], { type: 'image/jpeg' }), error: null });
    const blob = await buildMarketingZip([photo('one'), photo('two')]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(['001-one.jpg', '002-two.jpg']);
    expect(await zip.file('001-one.jpg')?.async('string')).toBe('original bytes');
  });
  it('does not silently export a partial archive after a download failure', async () => {
    download.mockResolvedValue({ data: null, error: { message: 'denied' } });
    await expect(buildMarketingZip([photo('one')])).rejects.toThrow('No se pudo descargar');
  });
  it('preserves the original image format', () => {
    expect(photoFilename({ ...photo('one'), storage_path: 'original.webp' }, 0)).toBe('001-one.webp');
  });
});