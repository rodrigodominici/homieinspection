import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { buildParkingStorageOverrides } from '@/lib/parking-storage-overrides';

interface Props {
  inspectionId: string;
  snapshot: Record<string, unknown>;
  overrides: Record<string, unknown> | null;
  onSaved: (overrides: Record<string, unknown>) => void;
}

/** Corrección (solo admin) de números de bodega y estacionamiento. El dato original queda intacto en el snapshot. */
export default function ParkingStorageEditor({ inspectionId, snapshot, overrides, onSaved }: Props) {
  const [parking, setParking] = useState(String(snapshot.parking_number ?? ''));
  const [storage, setStorage] = useState(String(snapshot.storage_number ?? ''));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const merged = buildParkingStorageOverrides(overrides, parking, storage);
    const { error } = await supabase.from('inspections').update({ property_overrides_json: merged as never }).eq('id', inspectionId);
    setSaving(false);
    if (error) { toast.error('No se pudo guardar'); return; }
    onSaved(merged);
    toast.success('Bodega y estacionamiento corregidos');
  };

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardContent className="p-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
        <div className="space-y-1">
          <Label>N° estacionamiento(s)</Label>
          <Input value={parking} onChange={(e) => setParking(e.target.value)} placeholder="Ej: 26 (vacío = sin estacionamiento)" />
        </div>
        <div className="space-y-1">
          <Label>N° bodega(s)</Label>
          <Input value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="Vacío = sin bodega" />
        </div>
        <Button onClick={save} disabled={saving}>Guardar corrección</Button>
      </CardContent>
    </Card>
  );
}
