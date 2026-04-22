import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import AdminLayout from '@/components/AdminLayout';
import type { Profile, UserRole } from '@/lib/types';
import { Pencil, UserCheck, UserX, Plus, Link2, Unlink, ShieldCheck, ShieldX, ShieldAlert } from 'lucide-react';
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

const BUSINESS_ROLES: { value: string; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'executive', label: 'Executive' },
];

export default function AdminUsers() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [mappings, setMappings] = useState<ExternalMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('users');

  // Edit dialog
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('inspector');
  const [editName, setEditName] = useState('');
  const [editMarket, setEditMarket] = useState('');
  const [saving, setSaving] = useState(false);

  // Mapping dialogs
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newHubspotId, setNewHubspotId] = useState('');
  const [newRoleHint, setNewRoleHint] = useState('inspector');
  const [newProfileId, setNewProfileId] = useState('');
  const [linkingMapping, setLinkingMapping] = useState<ExternalMapping | null>(null);
  const [linkProfileId, setLinkProfileId] = useState('');
  const [editingMapping, setEditingMapping] = useState<ExternalMapping | null>(null);
  const [editMapEmail, setEditMapEmail] = useState('');
  const [editMapRoleHint, setEditMapRoleHint] = useState<'inspector' | 'executive'>('inspector');
  const [editMapIsActive, setEditMapIsActive] = useState(true);
  const [editMapProfileId, setEditMapProfileId] = useState('');

  const fetchAll = async () => {
    const [pRes, mRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('external_user_mappings').select('*').order('created_at', { ascending: false }),
    ]);
    setProfiles((pRes.data ?? []) as unknown as Profile[]);
    setMappings((mRes.data ?? []) as unknown as ExternalMapping[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const pendingProfiles = profiles.filter(p => (p.approval_status ?? 'pending') === 'pending');
  const filtered = filterRole === 'all'
    ? profiles.filter(p => p.role !== 'pending')
    : profiles.filter((p) => p.role === filterRole);
  const linkedMappings = mappings.filter((m) => m.profile_id);
  const unresolvedMappings = mappings.filter((m) => !m.profile_id);

  /* ─── User actions ─── */
  const handleApprove = async (p: Profile, role: UserRole) => {
    if (role === 'pending') {
      toast({ title: 'Asigna un rol antes de aprobar', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      role, is_active: true, approval_status: 'approved',
    }).eq('id', p.id);
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, role, is_active: true, approval_status: 'approved' } : x));
    toast({ title: `${p.full_name} aprobado como ${role}` });
  };

  const handleReject = async (p: Profile) => {
    const { error } = await supabase.from('profiles').update({
      approval_status: 'rejected', is_active: false,
    }).eq('id', p.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, approval_status: 'rejected', is_active: false } : x));
    toast({ title: `${p.full_name} rechazado` });
  };

  const handleDeactivate = async (p: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', p.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, is_active: false } : x));
    toast({ title: 'Usuario desactivado' });
  };

  const handleActivate = async (p: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_active: true }).eq('id', p.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, is_active: true } : x));
    toast({ title: 'Usuario activado' });
  };

  const handleEditOpen = (p: Profile) => {
    setEditingProfile(p);
    setEditRole(p.role === 'pending' ? 'inspector' : p.role);
    setEditName(p.full_name);
    setEditMarket(p.market ?? '');
  };

  const handleEditSave = async () => {
    if (!editingProfile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ role: editRole, full_name: editName, market: editMarket || null })
      .eq('id', editingProfile.id);
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setProfiles(prev =>
      prev.map(x => x.id === editingProfile.id ? { ...x, role: editRole, full_name: editName, market: editMarket || null } : x)
    );
    setEditingProfile(null);
    toast({ title: 'Usuario actualizado' });
  };

  /* ─── Mapping handlers ─── */
  const handleCreateMapping = async () => {
    if (!newEmail && !newHubspotId) { toast({ title: 'Ingresa email o ID', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('external_user_mappings').insert({
      hubspot_email: newEmail || null,
      hubspot_user_id: newHubspotId || null,
      role_hint: newRoleHint,
      profile_id: newProfileId || null,
    });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Mapping creado' });
    setCreating(false);
    setNewEmail(''); setNewHubspotId(''); setNewProfileId('');
    fetchAll();
  };

  const handleLink = async () => {
    if (!linkingMapping || !linkProfileId) return;
    setSaving(true);
    const { error } = await supabase.from('external_user_mappings').update({ profile_id: linkProfileId }).eq('id', linkingMapping.id);
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setMappings(prev => prev.map(m => m.id === linkingMapping.id ? { ...m, profile_id: linkProfileId } : m));
    setLinkingMapping(null);
    toast({ title: 'Vinculado' });
  };

  const handleEditMappingOpen = (m: ExternalMapping) => {
    setEditingMapping(m);
    setEditMapEmail(m.hubspot_email ?? '');
    setEditMapRoleHint((m.role_hint === 'executive' ? 'executive' : 'inspector'));
    setEditMapIsActive(m.is_active);
    setEditMapProfileId(m.profile_id ?? '');
  };

  const handleEditMappingSave = async () => {
    if (!editingMapping) return;
    setSaving(true);
    const updates = {
      hubspot_email: editMapEmail.trim() || null,
      role_hint: editMapRoleHint,
      is_active: editMapIsActive,
      profile_id: editMapProfileId || null,
    };
    const { error } = await supabase
      .from('external_user_mappings')
      .update(updates)
      .eq('id', editingMapping.id);
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setMappings(prev => prev.map(m => m.id === editingMapping.id ? { ...m, ...updates } : m));
    setEditingMapping(null);
    toast({ title: 'Mapping actualizado' });
  };

  const handleUnlink = async (mapping: ExternalMapping) => {
    const { error } = await supabase.from('external_user_mappings').update({ profile_id: null }).eq('id', mapping.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setMappings(prev => prev.map(m => m.id === mapping.id ? { ...m, profile_id: null } : m));
    toast({ title: 'Desvinculado' });
  };

  const profileName = (id: string | null) => {
    if (!id) return null;
    return profiles.find(p => p.id === id)?.full_name ?? id.slice(0, 8);
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-primary/10 text-primary',
      inspector: 'bg-status-regular-bg text-status-regular',
      executive: 'bg-status-good-bg text-status-good',
      pending: 'bg-muted text-muted-foreground',
    };
    return (
      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-tiny font-medium', colors[role] ?? 'bg-muted text-muted-foreground')}>
        {role === 'pending' ? 'Sin rol' : role}
      </span>
    );
  };

  const approvalBadge = (status: string | undefined) => {
    if (!status || status === 'approved') return null;
    const colors: Record<string, string> = {
      pending: 'bg-status-regular-bg text-status-regular',
      rejected: 'bg-status-bad-bg text-status-bad',
    };
    return (
      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-tiny font-medium', colors[status] ?? 'bg-muted text-muted-foreground')}>
        {status === 'pending' ? 'Pendiente' : 'Rechazado'}
      </span>
    );
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl space-y-6">
        <h1 className="text-h2">Usuarios</h1>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pending" className="gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />
              Pendientes ({pendingProfiles.length})
            </TabsTrigger>
            <TabsTrigger value="users">Usuarios Internos ({profiles.filter(p => p.role !== 'pending').length})</TabsTrigger>
            <TabsTrigger value="hubspot">HubSpot Links ({linkedMappings.length})</TabsTrigger>
            <TabsTrigger value="unresolved">Sin Vincular ({unresolvedMappings.length})</TabsTrigger>
          </TabsList>

          {/* ─── Pending Approval Tab ─── */}
          <TabsContent value="pending" className="space-y-4 mt-4">
            {pendingProfiles.length === 0 ? (
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <div className="py-12 text-center text-muted-foreground">No hay usuarios pendientes de aprobación.</div>
              </Card>
            ) : (
              <Card className="border-0 ring-1 ring-border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nombre</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Fecha</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingProfiles.map(p => (
                        <PendingUserRow key={p.id} profile={p} onApprove={handleApprove} onReject={handleReject} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ─── Internal Users Tab ─── */}
          <TabsContent value="users" className="space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar por rol" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los roles</SelectItem>
                  {BUSINESS_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-caption text-muted-foreground">{filtered.length} usuarios</span>
            </div>

            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : (
              <Card className="border-0 ring-1 ring-border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nombre</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rol</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Mercado</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Estado</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4 font-medium">{p.full_name}</td>
                          <td className="py-3 px-4 text-muted-foreground">{p.email}</td>
                          <td className="py-3 px-4">{roleBadge(p.role)}</td>
                          <td className="py-3 px-4 text-muted-foreground">{p.market ?? '—'}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-tiny font-medium',
                                p.is_active ? 'bg-status-good-bg text-status-good' : 'bg-muted text-muted-foreground')}>
                                {p.is_active ? 'Activo' : 'Inactivo'}
                              </span>
                              {approvalBadge(p.approval_status)}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditOpen(p)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {p.is_active ? (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeactivate(p)}>
                                  <UserX className="h-3.5 w-3.5 text-status-bad" />
                                </Button>
                              ) : (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleActivate(p)}>
                                  <UserCheck className="h-3.5 w-3.5 text-status-good" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ─── HubSpot Links Tab ─── */}
          <TabsContent value="hubspot" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Nuevo Mapping
              </Button>
            </div>
            {linkedMappings.length === 0 ? (
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <div className="py-12 text-center text-muted-foreground">No hay mappings vinculados.</div>
              </Card>
            ) : (
              <Card className="border-0 ring-1 ring-border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email HubSpot</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rol</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Usuario Vinculado</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedMappings.map((m) => (
                        <tr key={m.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-3 px-4">{m.hubspot_email ?? '—'}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-tiny font-medium bg-muted text-muted-foreground">
                              {m.role_hint ?? '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium">{profileName(m.profile_id)}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditMappingOpen(m)} title="Editar">
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleUnlink(m)} title="Desvincular">
                                <Unlink className="h-3.5 w-3.5 text-status-bad" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ─── Unresolved Tab ─── */}
          <TabsContent value="unresolved" className="space-y-4 mt-4">
            {unresolvedMappings.length === 0 ? (
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <div className="py-12 text-center text-muted-foreground">Todas las identidades están vinculadas.</div>
              </Card>
            ) : (
              <Card className="border-0 ring-1 ring-border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email HubSpot</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rol</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Estado</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unresolvedMappings.map((m) => (
                        <tr key={m.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-3 px-4">{m.hubspot_email ?? '—'}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-tiny font-medium bg-muted text-muted-foreground">
                              {m.role_hint ?? '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-tiny font-medium bg-status-bad-bg text-status-bad">
                              Pendiente
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setLinkingMapping(m); setLinkProfileId(''); }}>
                              <Link2 className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit user dialog */}
      {editingProfile && (
        <Dialog open={!!editingProfile} onOpenChange={(o) => !o && setEditingProfile(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar Usuario</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nombre Completo</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mercado</Label>
                <Input value={editMarket} onChange={(e) => setEditMarket(e.target.value)} placeholder="CL, MX, etc." />
              </div>
              <div className="text-tiny text-muted-foreground">Email: {editingProfile.email}</div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setEditingProfile(null)} className="flex-1">Cancelar</Button>
                <Button onClick={handleEditSave} disabled={saving} className="flex-1">
                  {saving ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create mapping dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Mapping HubSpot</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Email HubSpot</Label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="usuario@hubspot.com" />
            </div>
            <div className="space-y-2">
              <Label>ID HubSpot (opcional)</Label>
              <Input value={newHubspotId} onChange={(e) => setNewHubspotId(e.target.value)} />
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
              <Label>Vincular a usuario (opcional)</Label>
              <Select value={newProfileId} onValueChange={setNewProfileId}>
                <SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.role})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setCreating(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleCreateMapping} disabled={saving} className="flex-1">
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
              <div className="text-sm space-y-1 rounded-xl bg-muted/50 p-3">
                <p><span className="text-muted-foreground">Email:</span> {linkingMapping.hubspot_email ?? '—'}</p>
                <p><span className="text-muted-foreground">Rol:</span> {linkingMapping.role_hint ?? '—'}</p>
              </div>
              <div className="space-y-2">
                <Label>Seleccionar usuario interno</Label>
                <Select value={linkProfileId} onValueChange={setLinkProfileId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {profiles
                      .filter((p) => !linkingMapping.role_hint || p.role === linkingMapping.role_hint)
                      .map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.email})</SelectItem>)}
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

      {/* Edit mapping dialog */}
      {editingMapping && (
        <Dialog open={!!editingMapping} onOpenChange={(o) => !o && setEditingMapping(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar Mapping HubSpot</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Email HubSpot</Label>
                <Input value={editMapEmail} onChange={(e) => setEditMapEmail(e.target.value)} placeholder="usuario@hubspot.com" />
              </div>
              <div className="space-y-2">
                <Label>Rol sugerido</Label>
                <Select value={editMapRoleHint} onValueChange={(v) => setEditMapRoleHint(v as 'inspector' | 'executive')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inspector">Inspector</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label>Mapping activo</Label>
                  <p className="text-tiny text-muted-foreground">Si está inactivo, no se usará en la resolución del intake.</p>
                </div>
                <Switch checked={editMapIsActive} onCheckedChange={setEditMapIsActive} />
              </div>
              <div className="space-y-2">
                <Label>Vincular a usuario</Label>
                <Select
                  value={editMapProfileId === '' ? '__none__' : editMapProfileId}
                  onValueChange={(v) => setEditMapProfileId(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin vincular</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setEditingMapping(null)} className="flex-1">Cancelar</Button>
                <Button onClick={handleEditMappingSave} disabled={saving} className="flex-1">
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  );
}

/* ─── Pending user row with inline role selector ─── */
function PendingUserRow({ profile, onApprove, onReject }: {
  profile: Profile;
  onApprove: (p: Profile, role: UserRole) => void;
  onReject: (p: Profile) => void;
}) {
  const [role, setRole] = useState<UserRole>('inspector');

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="py-3 px-4 font-medium">{profile.full_name}</td>
      <td className="py-3 px-4 text-muted-foreground">{profile.email}</td>
      <td className="py-3 px-4 text-muted-foreground text-caption">
        {new Date(profile.created_at).toLocaleDateString('es-MX')}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center justify-end gap-2">
          <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
            <SelectTrigger className="w-[130px] h-8 text-caption">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="inspector">Inspector</SelectItem>
              <SelectItem value="executive">Executive</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="default" className="gap-1 h-8" onClick={() => onApprove(profile, role)}>
            <ShieldCheck className="h-3.5 w-3.5" /> Aprobar
          </Button>
          <Button size="sm" variant="ghost" className="gap-1 h-8 text-status-bad" onClick={() => onReject(profile)}>
            <ShieldX className="h-3.5 w-3.5" /> Rechazar
          </Button>
        </div>
      </td>
    </tr>
  );
}
