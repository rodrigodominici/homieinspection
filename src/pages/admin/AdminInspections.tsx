import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { createInspectionFromPayload } from '@/lib/inspection-service';
import { EXAMPLE_PAYLOADS } from '@/lib/inspection-generator';
import AdminLayout from '@/components/AdminLayout';
import type { Inspection, Profile } from '@/lib/types';
import { UserCheck, AlertCircle, Zap } from 'lucide-react';

const payloadOptions = [
  { key: 'studio', label: 'Estudio — 0D 1B, terraza + logia' },
  { key: 'twoBedTwoBath', label: '2D 2B — con bodega y estacionamiento' },
  { key: 'houseWithYard', label: 'Casa 3D 2B — con antejardín' },
  { key: 'fullFeatures', label: '4D 4B — todas las características' },
];

export default function AdminInspections() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'all';

  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [inspectors, setInspectors] = useState<Profile[]>([]);
  const [executives, setExecutives] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Assignment state
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignInspector, setAssignInspector] = useState('');
  const [assignExecutive, setAssignExecutive] = useState('');

  // Creation state
  const [selectedExample, setSelectedExample] = useState('studio');
  const [payloadText, setPayloadText] = useState(JSON.stringify(EXAMPLE_PAYLOADS.studio, null, 2));
  const [selectedInspectorId, setSelectedInspectorId] = useState('');
  const [selectedExecutiveId, setSelectedExecutiveId] = useState('');
  const [generating, setGenerating] = useState(false);

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

  const handleAssign = async (inspectionId: string) => {
    if (!assignInspector || !assignExecutive) {
      toast({ title: 'Selecciona ambos roles', variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('inspections')
      .update({ inspector_id: assignInspector, executive_id: assignExecutive, status: 'assigned' })
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

  const handleExampleChange = (key: string) => {
    setSelectedExample(key);
    setPayloadText(JSON.stringify(EXAMPLE_PAYLOADS[key as keyof typeof EXAMPLE_PAYLOADS], null, 2));
  };

  const handleGenerate = async () => {
    if (!profile) return;
    if (!selectedInspectorId || !selectedExecutiveId) {
      toast({ title: 'Asignación requerida', description: 'Selecciona inspector y ejecutivo.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const payload = JSON.parse(payloadText);
      payload.inspector = { ...(payload.inspector ?? {}), id: selectedInspectorId };
      payload.executive = { ...(payload.executive ?? {}), id: selectedExecutiveId };
      const inspection = await createInspectionFromPayload(payload, profile.id);
      toast({ title: 'Inspección creada', description: `ID: ${inspection.property_id}` });
      setInspections((prev) => [inspection as unknown as Inspection, ...prev]);
      setSearchParams({ tab: 'all' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const pendingAssignment = inspections.filter((i) => i.status === 'pending_assignment' || !i.inspector_id || !i.executive_id);
  const filteredInspections = statusFilter === 'all'
    ? inspections
    : inspections.filter((i) => i.status === statusFilter);

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl space-y-6">
        <h1 className="text-h2">Inspecciones</h1>

        <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })}>
          <TabsList>
            <TabsTrigger value="all">Todas ({inspections.length})</TabsTrigger>
            <TabsTrigger value="pending">Pendientes ({pendingAssignment.length})</TabsTrigger>
            <TabsTrigger value="create">Crear Nueva</TabsTrigger>
          </TabsList>

          {/* All Inspections */}
          <TabsContent value="all" className="space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrar por estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="pending_assignment">Sin Asignar</SelectItem>
                  <SelectItem value="assigned">Asignada</SelectItem>
                  <SelectItem value="in_progress">En Progreso</SelectItem>
                  <SelectItem value="submitted">Enviada</SelectItem>
                  <SelectItem value="in_review">En Revisión</SelectItem>
                  <SelectItem value="approved">Aprobada</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-caption text-muted-foreground">{filteredInspections.length} inspecciones</span>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : filteredInspections.length === 0 ? (
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No hay inspecciones con este filtro
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredInspections.map((insp) => (
                  <Card key={insp.id} className="border-0 ring-1 ring-border shadow-sm">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="font-medium">{insp.property_name ?? insp.property_id}</p>
                          <p className="text-caption text-muted-foreground">{insp.address}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <InspectionStatusBadge status={insp.status} />
                            <span className="text-tiny text-muted-foreground">{insp.inspection_type} · {insp.market}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Pending Assignment */}
          <TabsContent value="pending" className="space-y-4 mt-4">
            {pendingAssignment.length === 0 ? (
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  Todas las inspecciones están asignadas
                </CardContent>
              </Card>
            ) : (
              pendingAssignment.map((insp) => (
                <Card key={insp.id} className="border-0 ring-1 ring-status-bad/30 shadow-sm">
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{insp.property_name ?? insp.property_id}</p>
                        <p className="text-caption text-muted-foreground">{insp.address}</p>
                        <InspectionStatusBadge status={insp.status} />
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
                            <label className="text-caption font-medium text-muted-foreground">Inspector</label>
                            <Select value={assignInspector} onValueChange={setAssignInspector}>
                              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                              <SelectContent>
                                {inspectors.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-caption font-medium text-muted-foreground">Ejecutivo</label>
                            <Select value={assignExecutive} onValueChange={setAssignExecutive}>
                              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                              <SelectContent>
                                {executives.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button onClick={() => handleAssign(insp.id)} size="sm">Confirmar Asignación</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Manual Creation */}
          <TabsContent value="create" className="space-y-6 mt-4">
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-body-lg">Paso 1 — Payload de Propiedad</CardTitle>
                <CardDescription>Selecciona un ejemplo o pega un JSON personalizado</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedExample} onValueChange={handleExampleChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {payloadOptions.map((opt) => <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  className="font-mono text-xs min-h-[300px]"
                />
              </CardContent>
            </Card>

            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  <CardTitle className="text-body-lg">Paso 2 — Asignación</CardTitle>
                </div>
                <CardDescription>Selecciona inspector y ejecutivo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Inspector</Label>
                  {inspectors.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-status-regular">
                      <AlertCircle className="h-4 w-4" /> No hay inspectores registrados
                    </div>
                  ) : (
                    <Select value={selectedInspectorId} onValueChange={setSelectedInspectorId}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar inspector..." /></SelectTrigger>
                      <SelectContent>
                        {inspectors.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.email})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Ejecutivo</Label>
                  {executives.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-status-regular">
                      <AlertCircle className="h-4 w-4" /> No hay ejecutivos registrados
                    </div>
                  ) : (
                    <Select value={selectedExecutiveId} onValueChange={setSelectedExecutiveId}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar ejecutivo..." /></SelectTrigger>
                      <SelectContent>
                        {executives.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.email})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleGenerate}
              disabled={generating || !selectedInspectorId || !selectedExecutiveId}
              className="w-full h-12 text-body-lg"
              size="lg"
            >
              <Zap className="mr-2 h-5 w-5" />
              {generating ? 'Generando...' : 'Generar Inspección'}
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
