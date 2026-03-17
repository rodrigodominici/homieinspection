import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { Profile } from '@/lib/types';
import { ArrowLeft, Plus, Link2, Unlink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExternalMapping {
  id: string;
  provider: string;
  hubspot_user_id: string | null;
  hubspot_email: string | null;
  profile_id: string | null;
  role_hint: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function AdminMappings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mappings, setMappings] = useState<ExternalMapping[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Create dialog
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newHubspotId, setNewHubspotId] = useState('');
  const [newRoleHint, setNewRoleHint] = useState('inspector');
  const [newProfileId, setNewProfileId] = useState('');
  const [saving, setSaving] = useState(false);

  // Link dialog
  const [linkingMapping, setLinkingMapping] = useState<ExternalMapping | null>(null);
  const [linkProfileId, setLinkProfileId] = useState('');

  const fetchAll = async () => {
    const [mRes, pRes] = await Promise.all([
      supabase.from('external_user_mappings').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
    ]);
    setMappings((mRes.data ?? []) as unknown as ExternalMapping[]);
    setProfiles((pRes.data ?? []) as unknown as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = filterStatus === 'all'
    ? mappings
    : filterStatus === 'unresolved'
      ? mappings.filter((m) => !m.profile_id)
      : mappings.filter((m) => m.role_hint === filterStatus);

  const profileName = (id: string | null) => {
    if (!id) return null;
    return profiles.find((p) => p.id === id)?.full_name ?? id.slice(0, 8);
  };

  const handleCreate = async () => {
    if (!newEmail && !newHubspotId) {
      toast({ title: 'Ingresa al menos un email o ID de HubSpot', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('external_user_mappings').insert({
      hubspot_email: newEmail || null,
      hubspot_user_id: newHubspotId || null,
      role_hint: newRoleHint,
      profile_id: newProfileId || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Mapping creado' });
      setCreating(false);
      setNewEmail(''); setNewHubspotId(''); setNewProfileId('');
      fetchAll();
    }
  };

  const handleLink = async () => {
    if (!linkingMapping || !linkProfileId) return;
    setSaving(true);
    const { error } = await supabase
      .from('external_user_mappings')
      .update({ profile_id: linkProfileId })
      .eq('id', linkingMapping.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setMappings((prev) => prev.map((m) => m.id === linkingMapping.id ? { ...m, profile_id: linkProfileId } : m));
      setLinkingMapping(null);
      toast({ title: 'Vinculado correctamente' });
    }
  };

  const handleUnlink = async (mapping: ExternalMapping) => {
    const { error } = await supabase
      .from('external_user_mappings')
      .update({ profile_id: null })
      .eq('id', mapping.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setMappings((prev) => prev.map((m) => m.id === mapping.id ? { ...m, profile_id: null } : m));
      toast({ title: 'Desvinculado' });
    }
  };

  const profilesByRole = (roleHint: string | null) => {
    if (roleHint === 'inspector') return profiles.filter((p) => p.role === 'inspector');
    if (roleHint === 'executive') return profiles.filter((p) => p.role === 'executive');
    return profiles;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Mappings HubSpot</h1>
            <p className="text-xs text-muted-foreground">Vinculación de identidades externas con usuarios internos</p>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nuevo Mapping
          </Button>
        </div>
      </header>

      <main className="container max-w-4xl py-6 space-y-4">
        <div className="flex items-center gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="unresolved">Sin vincular</SelectItem>
              <SelectItem value="inspector">Inspectores</SelectItem>
              <SelectItem value="executive">Ejecutivos</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} mappings</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Cargando...</div>
        ) : filtered.length === 0 ? (
          <Card className="border-0 ring-1 ring-border/50 shadow-sm">
            <div className="py-12 text-center text-muted-foreground">
              <p>No hay mappings configurados.</p>
              <p className="text-xs mt-1">Se crearán cuando lleguen payloads de HubSpot o los agregues manualmente.</p>
            </div>
          </Card>
        ) : (
          <Card className="border-0 ring-1 ring-border/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email HubSpot</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">ID HubSpot</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rol</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Usuario Vinculado</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Estado</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">{m.hubspot_email ?? '—'}</td>
                      <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{m.hubspot_user_id ?? '—'}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                          {m.role_hint ?? '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {m.profile_id ? (
                          <span className="font-medium">{profileName(m.profile_id)}</span>
                        ) : (
                          <span className="text-status-bad text-xs">Sin vincular</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          m.profile_id ? 'bg-status-good-bg text-status-good' : 'bg-status-bad-bg text-status-bad'
                        )}>
                          {m.profile_id ? 'Vinculado' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {m.profile_id ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleUnlink(m)}>
                            <Unlink className="h-3.5 w-3.5 text-status-bad" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setLinkingMapping(m); setLinkProfileId(''); }}>
                            <Link2 className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>

      {/* Create mapping dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Mapping</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Email HubSpot</Label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="usuario@hubspot.com" />
            </div>
            <div className="space-y-2">
              <Label>ID HubSpot (opcional)</Label>
              <Input value={newHubspotId} onChange={(e) => setNewHubspotId(e.target.value)} placeholder="hs_user_123" />
            </div>
            <div className="space-y-2">
              <Label>Rol sugerido</Label>
              <Select value={newRoleHint} onValueChange={setNewRoleHint}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inspector">Inspector</SelectItem>
                  <SelectItem value="executive">Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vincular a usuario interno (opcional)</Label>
              <Select value={newProfileId} onValueChange={setNewProfileId}>
                <SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setCreating(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleCreate} disabled={saving} className="flex-1">
                {saving ? 'Creando...' : 'Crear'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link dialog */}
      {linkingMapping && (
        <Dialog open={!!linkingMapping} onOpenChange={(o) => !o && setLinkingMapping(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Vincular Mapping</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="text-sm space-y-1 rounded-lg bg-muted/50 p-3">
                <p><span className="text-muted-foreground">Email:</span> {linkingMapping.hubspot_email ?? '—'}</p>
                <p><span className="text-muted-foreground">Rol sugerido:</span> {linkingMapping.role_hint ?? '—'}</p>
              </div>
              <div className="space-y-2">
                <Label>Seleccionar usuario interno</Label>
                <Select value={linkProfileId} onValueChange={setLinkProfileId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {profilesByRole(linkingMapping.role_hint).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setLinkingMapping(null)} className="flex-1">Cancelar</Button>
                <Button onClick={handleLink} disabled={saving || !linkProfileId} className="flex-1">
                  {saving ? 'Vinculando...' : 'Vincular'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
