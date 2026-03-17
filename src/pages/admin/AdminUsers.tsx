import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { Profile, UserRole } from '@/lib/types';
import { ArrowLeft, Plus, UserCheck, UserX, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminUsers() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('inspector');
  const [editName, setEditName] = useState('');
  const [editMarket, setEditMarket] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setProfiles((data ?? []) as unknown as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchProfiles(); }, []);

  const filtered = filterRole === 'all' ? profiles : profiles.filter((p) => p.role === filterRole);

  const handleToggleActive = async (p: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setProfiles((prev) => prev.map((x) => x.id === p.id ? { ...x, is_active: !x.is_active } : x));
      toast({ title: p.is_active ? 'Usuario desactivado' : 'Usuario activado' });
    }
  };

  const handleEditOpen = (p: Profile) => {
    setEditingProfile(p);
    setEditRole(p.role);
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
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setProfiles((prev) =>
        prev.map((x) => x.id === editingProfile.id ? { ...x, role: editRole, full_name: editName, market: editMarket || null } : x)
      );
      setEditingProfile(null);
      toast({ title: 'Usuario actualizado' });
    }
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-primary/10 text-primary',
      inspector: 'bg-status-regular-bg text-status-regular',
      executive: 'bg-status-good-bg text-status-good',
    };
    return (
      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', colors[role] ?? 'bg-muted text-muted-foreground')}>
        {role}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Usuarios</h1>
            <p className="text-xs text-muted-foreground">Gestión de usuarios internos de Homie Inspection</p>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl py-6 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="inspector">Inspector</SelectItem>
              <SelectItem value="executive">Executive</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} usuarios</span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Cargando...</div>
        ) : (
          <Card className="border-0 ring-1 ring-border/50 shadow-sm overflow-hidden">
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
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          p.is_active ? 'bg-status-good-bg text-status-good' : 'bg-muted text-muted-foreground'
                        )}>
                          {p.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditOpen(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleToggleActive(p)}
                          >
                            {p.is_active ? <UserX className="h-3.5 w-3.5 text-status-bad" /> : <UserCheck className="h-3.5 w-3.5 text-status-good" />}
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
      </main>

      {/* Edit dialog */}
      {editingProfile && (
        <Dialog open={!!editingProfile} onOpenChange={(o) => !o && setEditingProfile(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Usuario</DialogTitle>
            </DialogHeader>
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
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="inspector">Inspector</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mercado</Label>
                <Input value={editMarket} onChange={(e) => setEditMarket(e.target.value)} placeholder="CL, MX, etc." />
              </div>
              <div className="text-xs text-muted-foreground">Email: {editingProfile.email}</div>
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
    </div>
  );
}
