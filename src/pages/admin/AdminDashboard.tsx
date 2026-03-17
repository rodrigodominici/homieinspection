import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/hooks/use-toast';
import type { Inspection, Profile } from '@/lib/types';
import { Plus, LogOut, ClipboardList, FileSearch, Clock, UserCheck, AlertCircle, Settings } from 'lucide-react';

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const { toast } = useToast();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectors, setInspectors] = useState<Profile[]>([]);
  const [executives, setExecutives] = useState<Profile[]>([]);
  // Assignment modal state
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignInspector, setAssignInspector] = useState('');
  const [assignExecutive, setAssignExecutive] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      const [inspRes, profilesRes] = await Promise.all([
        supabase.from('inspections').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      ]);
      setInspections((inspRes.data ?? []) as unknown as Inspection[]);
      const profiles = (profilesRes.data ?? []) as unknown as Profile[];
      setInspectors(profiles.filter((p) => p.role === 'inspector'));
      setExecutives(profiles.filter((p) => p.role === 'executive'));
      setLoading(false);
    };
    fetchAll();
  }, []);

  const stats = {
    total: inspections.length,
    pendingAssignment: inspections.filter((i) => i.status === 'pending_assignment').length,
    pending: inspections.filter((i) => ['pending', 'assigned'].includes(i.status)).length,
    inProgress: inspections.filter((i) => ['in_progress', 'submitted', 'in_review'].includes(i.status)).length,
    completed: inspections.filter((i) => ['approved', 'published', 'sent'].includes(i.status)).length,
  };

  const handleAssign = async (inspectionId: string) => {
    if (!assignInspector || !assignExecutive) {
      toast({ title: 'Selecciona ambos roles', variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('inspections')
      .update({
        inspector_id: assignInspector,
        executive_id: assignExecutive,
        status: 'assigned',
      })
      .eq('id', inspectionId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Inspección asignada' });
      setInspections((prev) =>
        prev.map((i) =>
          i.id === inspectionId
            ? { ...i, inspector_id: assignInspector, executive_id: assignExecutive, status: 'assigned' as const }
            : i
        )
      );
      setAssigningId(null);
    }
  };

  const pendingAssignment = inspections.filter((i) => i.status === 'pending_assignment' || !i.inspector_id || !i.executive_id);
  const assignedInspections = inspections.filter((i) => i.status !== 'pending_assignment' && i.inspector_id && i.executive_id);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">H</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold">Homie Inspection</h1>
              <p className="text-xs text-muted-foreground">Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/admin/config">
              <Button variant="ghost" size="icon"><Settings className="h-4 w-4" /></Button>
            </Link>
            <span className="text-sm text-muted-foreground">{profile?.full_name}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon={ClipboardList} label="Total" value={stats.total} colorClass="bg-primary/10 text-primary" />
          <StatCard icon={AlertCircle} label="Sin Asignar" value={stats.pendingAssignment} colorClass="bg-status-bad-bg text-status-bad" />
          <StatCard icon={Clock} label="Pendientes" value={stats.pending} colorClass="bg-status-regular-bg text-status-regular" />
          <StatCard icon={FileSearch} label="En Curso" value={stats.inProgress} colorClass="bg-status-regular-bg text-status-regular" />
          <StatCard icon={ClipboardList} label="Completadas" value={stats.completed} colorClass="bg-status-good-bg text-status-good" />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Inspecciones</h2>
          <Link to="/admin/create">
            <Button><Plus className="mr-2 h-4 w-4" /> Nueva Inspección</Button>
          </Link>
        </div>

        {/* Pending assignment section */}
        {pendingAssignment.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-status-bad uppercase tracking-wider mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Requieren Asignación ({pendingAssignment.length})
            </h3>
            <div className="space-y-3">
              {pendingAssignment.map((insp) => (
                <Card key={insp.id} className="border-0 ring-1 ring-status-bad/30 shadow-sm">
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{insp.property_name ?? insp.property_id}</p>
                        <p className="text-sm text-muted-foreground">{insp.address}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <InspectionStatusBadge status={insp.status} />
                          <span className="text-xs text-muted-foreground">{insp.inspection_type} · {insp.market}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAssigningId(assigningId === insp.id ? null : insp.id);
                          setAssignInspector(insp.inspector_id ?? '');
                          setAssignExecutive(insp.executive_id ?? '');
                        }}
                      >
                        <UserCheck className="mr-1 h-3.5 w-3.5" /> Asignar
                      </Button>
                    </div>
                    {assigningId === insp.id && (
                      <div className="pt-3 border-t space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Inspector</label>
                            <Select value={assignInspector} onValueChange={setAssignInspector}>
                              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                              <SelectContent>
                                {inspectors.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Ejecutivo</label>
                            <Select value={assignExecutive} onValueChange={setAssignExecutive}>
                              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                              <SelectContent>
                                {executives.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button onClick={() => handleAssign(insp.id)} size="sm">
                          Confirmar Asignación
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Regular list */}
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Cargando...</div>
        ) : assignedInspections.length === 0 && pendingAssignment.length === 0 ? (
          <Card className="border-0 ring-1 ring-border/50">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No hay inspecciones aún</p>
              <Link to="/admin/create">
                <Button className="mt-4"><Plus className="mr-2 h-4 w-4" /> Crear Primera Inspección</Button>
              </Link>
            </CardContent>
          </Card>
        ) : assignedInspections.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Todas las Inspecciones
            </h3>
            <div className="space-y-3">
              {assignedInspections.map((insp) => (
                <Card key={insp.id} className="border-0 ring-1 ring-border/50 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{insp.property_name ?? insp.property_id}</p>
                        <p className="text-sm text-muted-foreground">{insp.address}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <InspectionStatusBadge status={insp.status} />
                          <span className="text-xs text-muted-foreground">{insp.inspection_type} · {insp.market}</span>
                        </div>
                      </div>
                      <Link to={`/admin/inspection/${insp.id}`}>
                        <Button variant="outline" size="sm">Ver</Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, colorClass }: {
  icon: React.ElementType; label: string; value: number; colorClass: string;
}) {
  return (
    <Card className="border-0 ring-1 ring-border/50 shadow-sm">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${colorClass}`}><Icon className="h-5 w-5" /></div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
