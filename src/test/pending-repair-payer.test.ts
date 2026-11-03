import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert }) },
}));
import { addPendingRepair } from '@/modules/review/api/repairs.service';

describe('pending repair payer selection', () => {
  beforeEach(() => { insert.mockReset(); insert.mockResolvedValue({ error: null }); });

  it('saves a pending item charged to the tenant', async () => {
    await addPendingRepair('inspection', 'section', 'Horno', 1, 'tenant', 'author');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ payer_role: 'tenant', is_pending_quote: true, unit_price: 0 }));
  });

  it('saves a pending item charged to the owner', async () => {
    await addPendingRepair('inspection', 'section', 'Horno', 1, 'owner', 'author');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ payer_role: 'owner', is_pending_quote: true, unit_price: 0 }));
  });

  it('requires an explicit payer instead of defaulting to the owner', async () => {
    await expect(addPendingRepair('inspection', 'section', 'Horno', 1, '' as 'owner')).rejects.toThrow('Selecciona quién paga');
    expect(insert).not.toHaveBeenCalled();
  });
});