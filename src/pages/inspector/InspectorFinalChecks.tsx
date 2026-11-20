import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import { VACANCY_TYPES } from '@/components/work-orders/FinalInspectionPanel';
import { finalCheckErrorText, recordFinalCheck } from '@/modules/work-orders/api/final-checks.service';

interface Item { id: string; title: string; vacancy_type: string | null; last: { result: string; comment: string | null } | null }
interface Assignment { work_order_id: string; status: string; inspection_id: string; property_name: string | null; address: string | null; items: Item[] }

/** Receptor mobile screen: final review (cumple / no cumple) of work orders assigned to them. */
export default function InspectorFinalChecks() {
  const [rows, setRows] = useState<Assignment[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_final_check_assignments');
    setRows((data ?? []) as unknown as Assignment[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mark = async (a: Assignment, it: Item, complies: boolean) => {
    setBusy(it.id);
    const { error } = await recordFinalCheck({ inspectionId: a.inspection_id, itemId: it.id, complies, comment: notes[it.id]?.trim() || null, photo: photos[it.id] });
    setBusy(null);
    if (error) { toast.error(finalCheckErrorText(error.message)); return; }
    toast.success(complies ? 'Marcado: cumple' : 'No cumple: la OT volvió al contratista');
    setNotes({ ...notes, [it.id]: '' }); setPhotos({ ...photos, [it.id]: null });
    await load();
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-card px-4 py-3">
        <Link to="/inspector" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="text-base font-semibold">Revisión final de trabajos</h1>
      </header>
      <main className="space-y-4 p-4">
        {rows === null && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
        {rows?.length === 0 && <p className="text-center text-sm text-muted-foreground">No tenés revisiones finales asignadas.</p>}
        {rows?.map((a) => {
          const ready = a.status === 'in_review' || a.status === 'approved';
          return (
            <Card key={a.work_order_id}>
              <CardContent className="space-y-3 p-4">
                <div>
                  <p className="font-medium">{a.property_name ?? a.address}</p>
                  {a.property_name && <p className="text-xs text-muted-foreground">{a.address}</p>}
                </div>
                {!ready && <p className="text-xs text-muted-foreground">Se habilita cuando el contratista envía la orden.</p>}
                {a.items.map((it) => (
                  <div key={it.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{it.title}</p>
                      {it.last && <Badge variant={it.last.result === 'complies' ? 'default' : 'destructive'}>{it.last.result === 'complies' ? 'Cumple' : 'No cumple'}</Badge>}
                    </div>
                    {it.vacancy_type && <p className="text-xs text-muted-foreground">{VACANCY_TYPES[it.vacancy_type]}</p>}
                    {ready && (
                      <div className="flex flex-col gap-2">
                        <Input placeholder="Comentario (obligatorio si no cumple)" value={notes[it.id] ?? ''} onChange={(e) => setNotes({ ...notes, [it.id]: e.target.value })} />
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-primary">
                          <Camera className="h-4 w-4" />{photos[it.id] ? photos[it.id]!.name : 'Agregar foto'}
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhotos({ ...photos, [it.id]: e.target.files?.[0] ?? null })} />
                        </label>
                        <div className="flex gap-2">
                          <Button className="flex-1" disabled={!!busy} onClick={() => mark(a, it, true)}>{busy === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cumple'}</Button>
                          <Button className="flex-1" variant="destructive" disabled={!!busy} onClick={() => mark(a, it, false)}>No cumple</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </main>
      <InspectorBottomNav />
    </div>
  );
}
