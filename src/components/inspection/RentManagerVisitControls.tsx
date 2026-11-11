import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CalendarClock, AlertTriangle } from 'lucide-react';
import { chileVisitDate } from '@/lib/rent-manager-visit';
import type { Tables } from '@/integrations/supabase/types';

export function RentManagerVisitControls({ inspectionId, mode, readOnly = false }: { inspectionId: string; mode: 'inspector' | 'executive'; readOnly?: boolean }) {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [date, setDate] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState<string | null>(null);
  const [history, setHistory] = useState<Tables<'rent_manager_availability_history'>[]>([]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const { data } = await supabase.from('inspections').select('market,inspection_type,rm_available_from,rm_rescheduled_to,rm_reschedule_reason').eq('id', inspectionId).maybeSingle();
    if (!data || data.market !== 'CL' || data.inspection_type !== 'captacion') return;
    const { data: available } = await supabase.rpc('rm_visit_enabled', { p_id: inspectionId });
    setEnabled(available === true); setCurrent(data.rm_available_from); setReplacement(data.rm_rescheduled_to); setCloseReason(data.rm_reschedule_reason);
    const { data: changes } = await supabase.from('rent_manager_availability_history').select('*').eq('inspection_id', inspectionId).order('created_at', { ascending: false });
    setHistory(changes ?? []);
  }
  useEffect(() => { void load(); }, [inspectionId]);
  async function save() {
    if (!date || (mode === 'inspector' && !reason.trim())) { setError('Completa la fecha y el motivo.'); return; }
    setBusy(true); setError('');
    const result = mode === 'inspector'
      ? await supabase.rpc('rm_reschedule_inspection', { p_id: inspectionId, p_date: date, p_reason: reason.trim() })
      : await supabase.rpc('rm_move_availability', { p_id: inspectionId, p_date: date, p_reason: reason.trim() || undefined });
    setBusy(false);
    if (result.error) { setError('No se pudo guardar. Revisa la fecha, tus permisos y la conexión.'); return; }
    setOpen(false); await load();
    if (mode === 'inspector' && typeof result.data === 'string') navigate(`/inspector/inspection/${result.data}`);
  }
  if (!enabled) return null;
  return <section className="border-y border-border py-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold">Disponibilidad del inmueble</p><p className="text-sm text-muted-foreground">{current ?? 'Sin definir'}</p></div>
      {!readOnly && !replacement && <Button variant={mode === 'inspector' ? 'destructive' : 'outline'} onClick={() => { setDate(current ?? ''); setReason(''); setError(''); setOpen(true); }}>
        {mode === 'inspector' ? <AlertTriangle className="mr-2 h-4 w-4" /> : <CalendarClock className="mr-2 h-4 w-4" />}
        {mode === 'inspector' ? 'Inmueble no en condiciones' : 'Mover fecha de disponibilidad'}
      </Button>}
    </div>
    {replacement && <div className="text-sm space-y-2"><p>{closeReason}</p><Button variant="link" onClick={() => navigate(mode === 'inspector' ? `/inspector/inspection/${replacement}` : `/executive/inspection/${replacement}`)}>Ver nueva inspección</Button></div>}
    {history.length > 0 && <ol className="space-y-2 text-sm">{history.map(row => <li key={row.id} className="border-l-2 border-border pl-3"><span className="font-medium">{row.available_from}</span><span className="text-muted-foreground"> · {new Date(row.created_at).toLocaleString('es-CL')}</span>{row.reason && <p>{row.reason}</p>}</li>)}</ol>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{mode === 'inspector' ? 'Inmueble no en condiciones' : 'Mover fecha de disponibilidad'}</DialogTitle></DialogHeader>
      <div className="space-y-2"><Label htmlFor={`rm-date-${inspectionId}`}>{mode === 'inspector' ? 'Nueva fecha de visita' : 'Disponible desde'}</Label><Input id={`rm-date-${inspectionId}`} type="date" min={chileVisitDate()} value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor={`rm-reason-${inspectionId}`}>Motivo{mode === 'executive' ? ' (opcional)' : ''}</Label><Textarea id={`rm-reason-${inspectionId}`} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={busy || !date || (mode === 'inspector' && !reason.trim())} onClick={() => void save()}>{busy ? 'Guardando…' : mode === 'inspector' ? 'Cerrar y crear nueva visita' : 'Guardar fecha'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}