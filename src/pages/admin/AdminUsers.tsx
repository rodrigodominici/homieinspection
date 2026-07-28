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
import { Pencil, UserCheck, UserX, Plus, ShieldCheck, ShieldX, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MARKET_OPTIONS,
  COUNTRY_CODE_OPTIONS,
  defaultCountryCodeForMarket,
  marketLabel,
  normalizePhone,
  formatPhoneDisplay,
} from '@/lib/markets';


const BUSINESS_ROLES: { value: string; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'executive', label: 'Executive' },
  { value: 'comercial', label: 'Comercial' },
];

export default function AdminUsers() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('users');

  // Edit dialog
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('inspector');
  const [editName, setEditName] = useState('');
  const [editMarket, setEditMarket] = useState<string>('CL');
  const [editCountryCode, setEditCountryCode] = useState<string>('+56');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  // Create user dialog
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [cuName, setCuName] = useState('');
  const [cuEmail, setCuEmail] = useState('');
  const [cuPassword, setCuPassword] = useState('');
  const [cuShowPassword, setCuShowPassword] = useState(false);
  const [cuRole, setCuRole] = useState<'admin' | 'inspector' | 'executive' | 'comercial'>('inspector');
  const [cuMarket, setCuMarket] = useState<'CL' | 'MX'>('CL');
  const [cuCountryCode, setCuCountryCode] = useState<string>('+56');
  const [cuPhone, setCuPhone] = useState<string>('');
  const [cuIsActive, setCuIsActive] = useState<boolean>(true);
  const [cuSubmitting, setCuSubmitting] = useState(false);

  const fetchAll = async () => {
    const pRes = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setProfiles((pRes.data ?? []) as unknown as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const pendingProfiles = profiles.filter(p => (p.approval_status ?? 'pending') === 'pending');
  const filtered = filterRole === 'all'
    ? profiles.filter(p => p.role !== 'pending')
    : profiles.filter((p) => p.role === filterRole);


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
    setEditMarket((p.market === 'CL' || p.market === 'MX') ? p.market : 'CL');
    setEditCountryCode(p.country_code ?? defaultCountryCodeForMarket(p.market));
    setEditPhone(p.phone ?? '');
    setEditIsActive(p.is_active);
  };

  const handleEditSave = async () => {
    if (!editingProfile) return;
    const cleanPhone = normalizePhone(editPhone);
    setSaving(true);
    const updates = {
      role: editRole,
      full_name: editName,
      market: editMarket || null,
      country_code: editCountryCode || null,
      phone: cleanPhone || null,
      is_active: editIsActive,
    };
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', editingProfile.id);
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setProfiles(prev =>
      prev.map(x => x.id === editingProfile.id ? { ...x, ...updates } : x)
    );
    setEditingProfile(null);
    toast({ title: 'Usuario actualizado' });
  };

  /* ─── Create user (admin-driven) ─── */
  const openCreateUser = () => {
    setCuName('');
    setCuEmail('');
    setCuPassword('');
    setCuShowPassword(false);
    setCuRole('inspector');
    setCuMarket('CL');
    setCuCountryCode('+56');
    setCuPhone('');
    setCuIsActive(true);
    setCreateUserOpen(true);
  };

  const handleCreateUser = async () => {
    const name = cuName.trim();
    const email = cuEmail.trim().toLowerCase();
    const phone = normalizePhone(cuPhone);
    if (!name) { toast({ title: 'Nombre requerido', variant: 'destructive' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: 'Email inválido', variant: 'destructive' }); return;
    }
    if (cuPassword.length < 8) {
      toast({ title: 'Contraseña muy corta', description: 'Mínimo 8 caracteres.', variant: 'destructive' }); return;
    }
    if (!/^\d{6,15}$/.test(phone)) {
      toast({ title: 'Teléfono inválido', description: 'Solo dígitos, 6–15 caracteres.', variant: 'destructive' }); return;
    }
    setCuSubmitting(true);
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        full_name: name,
        email,
        password: cuPassword,
        role: cuRole,
        market: cuMarket,
        country_code: cuCountryCode,
        phone,
        is_active: cuIsActive,
      },
    });
    setCuSubmitting(false);
    if (error) {
      const ctx = (error as { context?: { error?: string; detail?: string } }).context;
      const code = ctx?.error;
      const msg =
        code === 'email_exists' ? 'Ya existe un usuario con ese email.' :
        code === 'weak_password' ? 'Contraseña muy débil (mín. 8 caracteres).' :
        code === 'forbidden' ? 'No tienes permisos para crear usuarios.' :
        code === 'validation' ? `Datos inválidos (${ctx?.detail ?? 'campo'}).` :
        error.message;
      toast({ title: 'No se pudo crear el usuario', description: msg, variant: 'destructive' });
      return;
    }
    toast({ title: 'Usuario creado', description: `${name} ya puede iniciar sesión.` });
    setCreateUserOpen(false);
    fetchAll();
    void data;
  };

  const roleBadge = (role: string) => {

    const colors: Record<string, string> = {
      admin: 'bg-primary/10 text-primary',
      inspector: 'bg-status-regular-bg text-status-regular',
      executive: 'bg-status-good-bg text-status-good',
      comercial: 'bg-accent/40 text-accent-foreground',
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
            <div className="flex items-center justify-between gap-3">
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
              <Button size="sm" onClick={openCreateUser}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Crear Usuario
              </Button>
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
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Teléfono</th>
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
                          <td className="py-3 px-4 text-muted-foreground">{marketLabel(p.market)}</td>
                          <td className="py-3 px-4 text-muted-foreground">{formatPhoneDisplay(p.country_code, p.phone)}</td>
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
        </Tabs>

      </div>

      {/* Edit user dialog */}
      {editingProfile && (
        <Dialog open={!!editingProfile} onOpenChange={(o) => !o && setEditingProfile(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Editar Usuario</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nombre Completo</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={editingProfile.email} disabled />
                <p className="text-tiny text-muted-foreground">
                  Cambiar el email requiere actualización de auth y no está soportado en esta iteración.
                </p>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Mercado</Label>
                  <Select value={editMarket} onValueChange={(v) => {
                    setEditMarket(v);
                    if (!editPhone) setEditCountryCode(defaultCountryCodeForMarket(v));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MARKET_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Código país</Label>
                  <Select value={editCountryCode} onValueChange={setEditCountryCode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODE_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(normalizePhone(e.target.value))}
                  placeholder="912345678"
                  inputMode="numeric"
                />
                <p className="text-tiny text-muted-foreground">Solo dígitos, sin espacios ni guiones.</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label>Activo</Label>
                  <p className="text-tiny text-muted-foreground">Si está inactivo, el usuario no podrá usar la app.</p>
                </div>
                <Switch checked={editIsActive} onCheckedChange={setEditIsActive} />
              </div>
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

      {/* Create user dialog */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Crear Usuario</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nombre Completo</Label>
              <Input value={cuName} onChange={(e) => setCuName(e.target.value)} placeholder="Ana Pérez" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={cuEmail}
                onChange={(e) => setCuEmail(e.target.value)}
                placeholder="usuario@homie.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña inicial</Label>
              <div className="relative">
                <Input
                  type={cuShowPassword ? 'text' : 'password'}
                  value={cuPassword}
                  onChange={(e) => setCuPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setCuShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label={cuShowPassword ? 'Ocultar' : 'Mostrar'}
                >
                  {cuShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-tiny text-muted-foreground">Comparte estas credenciales con el empleado.</p>
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={cuRole} onValueChange={(v) => setCuRole(v as 'admin' | 'inspector' | 'executive')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUSINESS_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Mercado</Label>
                <Select
                  value={cuMarket}
                  onValueChange={(v) => {
                    const next = v as 'CL' | 'MX';
                    setCuMarket(next);
                    setCuCountryCode(defaultCountryCodeForMarket(next));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MARKET_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Código país</Label>
                <Select value={cuCountryCode} onValueChange={setCuCountryCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODE_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input
                value={cuPhone}
                onChange={(e) => setCuPhone(normalizePhone(e.target.value))}
                placeholder="912345678"
                inputMode="numeric"
              />
              <p className="text-tiny text-muted-foreground">Solo dígitos, sin espacios ni guiones.</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label>Activo</Label>
                <p className="text-tiny text-muted-foreground">Determina si el usuario puede iniciar sesión.</p>
              </div>
              <Switch checked={cuIsActive} onCheckedChange={setCuIsActive} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setCreateUserOpen(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleCreateUser} disabled={cuSubmitting} className="flex-1">
                {cuSubmitting ? 'Creando...' : 'Crear Usuario'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
