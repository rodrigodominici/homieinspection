import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { simulateStep, uploadTestPhotos, type SimStep } from '@/lib/rm-simulator';

type P = { id: string; full_name: string; role: string };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export function RentManagerSimulatorPanel({ inspectionId, onDone }: { inspectionId: string; onDone?: () => void }) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [people, setPeople] = useState<P[]>([]);
  const [inspector, setInspector] = useState('');
  const [executive, setExecutive] = useState('');
  const [availability, setAvailability] = useState('inmediata');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [publicable, setPublicable] = useState('true');
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    (async () => {
      const [{ data: i }, { data: r }, { data: ps }] = await Promise.all([
        supabase.from('inspections').select('is_test').eq('id', inspectionId).maybeSingle(),
        supabase.from('inspection_external_references').select('id').eq('inspection_id', inspectionId).eq('provider', 'rent_manager').eq('is_active', true).limit(1),
        supabase.from('profiles').select('id, full_name, role').eq('is_active', true).order('full_name'),
      ]);
      setEnabled(Boolean(i?.is_test && r?.length));
      setPeople((ps ?? []) as P[]);
    })();
  }, [inspectionId, profile?.role]);

  useEffect(() => { if (profile?.id) { setInspector(profile.id); setExecutive(profile.id); } }, [profile?.id]);

  if (!enabled || profile?.role !== 'admin') return null;

  const params = async (step: SimStep): Promise<Record<string, unknown>> => {
    if (step === 'assign') return { inspector_id: inspector, executive_id: executive };
    // El aviso de fotos comerciales exige 10 fotos (misma regla que una inspección real).
    if (step === 'visit') return { availability, paths: await uploadTestPhotos(inspectionId, 'marketing_photos', 10) };
    if (step === 'final') return { paths: await uploadTestPhotos(inspectionId, 'fotos_finales', 3) };
    if (step === 'availability') return { date };
    if (step === 'publish') return { publicable: publicable === 'true' };
    return {};
  };

  const run = async (step: SimStep, label: string) => {
    const result = await simulateStep(inspectionId, step, await params(step));
    const line = `${label}: ${result.events.length ? result.events.join(', ') : 'sin evento nuevo'}`;
    setLog(l => [line, ...l]);
    return line;
  };

  const click = async (step: SimStep, label: string) => {
    setBusy(step);
    try { toast({ title: 'Paso simulado', description: await run(step, label) }); onDone?.(); }
    catch (e) { toast({ title: 'No se pudo simular', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const chain = async () => {
    setBusy('chain');
    try {
      const steps: [SimStep, string][] = [['assign', 'Asignar'], ['keys', 'Programar llaves'], ['visit', 'Visita con fotos']];
      for (let n = 0; n < steps.length; n++) {
        if (n) { setLog(l => ['Esperando 20 segundos…', ...l]); await wait(20000); }
        await run(...steps[n]);
      }
      onDone?.();
    } catch (e) { toast({ title: 'Se detuvo la secuencia', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const B = ({ step, label }: { step: SimStep; label: string }) => (
    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => click(step, label)}>{busy === step ? 'Simulando…' : label}</Button>
  );
  const sel = (v: string, set: (s: string) => void) => (
    <Select value={v} onValueChange={set}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
      <SelectContent>{people.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name} · {p.role}</SelectItem>)}</SelectContent></Select>
  );

  return (
    <Card className="border-dashed border-warning">
      <CardHeader className="pb-2"><CardTitle className="text-base">Simular avance (solo pruebas)</CardTitle>
        <p className="text-xs text-muted-foreground">Los avisos salen por la misma cola y el mismo envío que una inspección real.</p></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] items-end">
          <div><Label className="text-xs">Inspector</Label>{sel(inspector, setInspector)}</div>
          <div><Label className="text-xs">Ejecutivo</Label>{sel(executive, setExecutive)}</div>
          <B step="assign" label="1. Asignar" />
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <B step="keys" label="2. Programar llaves" />
          <div className="w-40"><Label className="text-xs">Disponibilidad</Label>
            <Select value={availability} onValueChange={setAvailability}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="inmediata">Inmediata</SelectItem><SelectItem value="en_5_dias">En 5 días</SelectItem></SelectContent></Select></div>
          <B step="visit" label="3. Visita con fotos" />
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div><Label className="text-xs">Disponible desde</Label><Input type="date" className="h-8" value={date} onChange={e => setDate(e.target.value)} /></div>
          <B step="availability" label="4. Cambiar disponibilidad" />
          <B step="submit" label="5. Enviar inspección" />
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="w-32"><Label className="text-xs">Publicable</Label>
            <Select value={publicable} onValueChange={setPublicable}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="true">Sí</SelectItem><SelectItem value="false">No</SelectItem></SelectContent></Select></div>
          <B step="publish" label="6. Publicar reporte" />
          <B step="final" label="7. Fotos finales" />
          <Button size="sm" disabled={!!busy} onClick={chain}>{busy === 'chain' ? 'Corriendo…' : 'Correr pasos 1 a 3 seguidos'}</Button>
        </div>
        {log.length > 0 && <ul className="text-xs text-muted-foreground space-y-0.5">{log.map((l, n) => <li key={n}>{l}</li>)}</ul>}
      </CardContent>
    </Card>
  );
}
