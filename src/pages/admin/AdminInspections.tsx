import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { createInspectionFromPayload } from '@/lib/inspection-service';
import { EXAMPLE_PAYLOADS } from '@/lib/inspection-generator';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import AdminLayout from '@/components/AdminLayout';
import type { Inspection, Profile } from '@/lib/types';
import { UserCheck, AlertCircle, Zap, Search, ExternalLink, MapPin, User, Calendar as CalendarIcon, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const payloadOptions = [
  { key: 'studio', label: 'Estudio — 0D 1B, terraza + logia' },
  { key: 'twoBedTwoBath', label: '2D 2B — con bodega y estacionamiento' },
  { key: 'houseWithYard', label: 'Casa 3D 2B — con antejardín' },
  { key: 'fullFeatures', label: '4D 4B — todas las características' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'pending_assignment', label: 'Sin Asignar' },
  { value: 'assigned', label: 'Asignada' },
  { value: 'in_progress', label: 'En Progreso' },
  { value: 'submitted', label: 'Enviada' },
  { value: 'in_review', label: 'En Revisión' },
  { value: 'needs_changes', label: 'Necesita Cambios' },
  { value: 'approved', label: 'Aprobada' },
  { value: 'published', label: 'Publicada' },
  { value: 'sent', label: 'Enviada al cliente' },
];

const SORT_OPTIONS = [
  { value: 'latest', label: 'Última actividad' },
  { value: 'contract_asc', label: 'Término contrato ↑' },
  { value: 'contract_desc', label: 'Término contrato ↓' },
  { value: 'schedule_asc', label: 'Recolección llaves ↑' },
  { value: 'schedule_desc', label: 'Recolección llaves ↓' },
];

function nullSafeSort(a: Date | null, b: Date | null, asc: boolean): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return asc ? a.getTime() - b.getTime() : b.getTime() - a.getTime();
}

function parseDateField(val: unknown): Date | null {
  if (!val || typeof val !== 'string') return null;
  const dt = new Date(`${val}T00:00:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

function parseDateTimeField(fecha: unknown, hora: unknown): Date | null {
  if (!fecha || typeof fecha !== 'string') return null;
  const dt = new Date(`${fecha}T${(hora && typeof hora === 'string') ? hora : '00:00'}`);
  return isNaN(dt.getTime()) ? null : dt;
}

interface EnrichedInspection extends Inspection {
  scheduleDatetime: Date | null;
  contractEndDate: Date | null;
  inspectorName: string | null;
}

export default function AdminInspections() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'all';

  const [inspections, setInspections] = useState<EnrichedInspection[]>([]);
  const [inspectors, setInspectors] = useState<Profile[]>([]);
  const [executives, setExecutives] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [inspectorFilter, setInspectorFilter] = useState<string>('all');
  const [executiveFilter, setExecutiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('latest');

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
        supabase
          .from('inspections')
          .select('*, inspector:profiles!inspections_inspector_id_fkey(full_name)')
          .order('updated_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      ]);

      const profiles = (profilesRes.data ?? []) as unknown as Profile[];
      setInspectors(profiles.filter((p) => p.role === 'inspector'));
      setExecutives(profiles.filter((p) => p.role === 'executive'));

      const rawItems = (inspRes.data ?? []) as unknown as (Inspection & { inspector: { full_name: string } | null })[];
      const enriched: EnrichedInspection[] = rawItems.map((insp) => {
        const snapshot = getEffectiveSnapshot(insp);
        const scheduleDatetime = parseDateTimeField(
          snapshot?.fecha_recoleccion_llaves,
          snapshot?.hora_recoleccion_llaves
        );
        const contractEndDate = parseDateField(snapshot?.fecha_de_termino_real_de_contrato);
        return {
          ...insp,
          scheduleDatetime,
          contractEndDate,
          inspectorName: insp.inspector?.full_name ?? null,
        };
      });

      setInspections(enriched);
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
      setInspections((prev) => [{
        ...(inspection as unknown as Inspection),
        scheduleDatetime: null,
        contractEndDate: null,
        inspectorName: null,
      }, ...prev]);
      setSearchParams({ tab: 'all' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const pendingAssignment = inspections.filter((i) => i.status === 'pending_assignment' || !i.inspector_id || !i.executive_id);

  // Apply all filters + sorting
  const filteredInspections = useMemo(() => {
    let result = inspections.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (inspectorFilter !== 'all' && i.inspector_id !== inspectorFilter) return false;
      if (executiveFilter !== 'all' && i.executive_id !== executiveFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchAddr = (i.address ?? '').toLowerCase().includes(q);
        const matchPropId = i.property_id.toLowerCase().includes(q);
        const matchName = (i.property_name ?? '').toLowerCase().includes(q);
        if (!matchAddr && !matchPropId && !matchName) return false;
      }
      return true;
    });

    // Sort
    const sorted = [...result];
    switch (sortBy) {
      case 'contract_asc':
        sorted.sort((a, b) => nullSafeSort(a.contractEndDate, b.contractEndDate, true));
        break;
      case 'contract_desc':
        sorted.sort((a, b) => nullSafeSort(a.contractEndDate, b.contractEndDate, false));
        break;
      case 'schedule_asc':
        sorted.sort((a, b) => nullSafeSort(a.scheduleDatetime, b.scheduleDatetime, true));
        break;
      case 'schedule_desc':
        sorted.sort((a, b) => nullSafeSort(a.scheduleDatetime, b.scheduleDatetime, false));
        break;
      default: // 'latest' — already sorted by updated_at desc from API
        break;
    }
    return sorted;
  }, [inspections, statusFilter, inspectorFilter, executiveFilter, searchQuery, sortBy]);

  const isUncoordinated = (insp: EnrichedInspection) => !insp.scheduleDatetime && !!insp.contractEndDate;

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
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por dirección, ID de propiedad o nombre..."
                className="pl-9"
              />
            </div>

            {/* Filters + Sort */}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={inspectorFilter} onValueChange={setInspectorFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Inspector" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los inspectores</SelectItem>
                  {inspectors.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={executiveFilter} onValueChange={setExecutiveFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ejecutivo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los ejecutivos</SelectItem>
                  {executives.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-caption text-muted-foreground">{filteredInspections.length} resultados</span>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : filteredInspections.length === 0 ? (
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No hay inspecciones con estos filtros
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredInspections.map((insp) => {
                  const uncoord = isUncoordinated(insp);
                  return (
                    <Card
                      key={insp.id}
                      className={cn(
                        'border-0 shadow-sm hover:shadow-md transition-shadow',
                        uncoord
                          ? 'ring-1 ring-amber-200 border-dashed'
                          : 'ring-1 ring-border'
                      )}
                    >
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <p className="font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
                            </div>

                            {/* Explicit date line */}
                            {uncoord ? (
                              <div className="flex items-center gap-1.5 text-xs text-amber-700">
                                <FileText className="h-3 w-3 shrink-0" />
                                <span>Término de contrato: {insp.contractEndDate!.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                              </div>
                            ) : insp.scheduleDatetime ? (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CalendarIcon className="h-3 w-3 shrink-0" />
                                <span>Inspección: {insp.scheduleDatetime.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })} {insp.scheduleDatetime.getHours() > 0 ? insp.scheduleDatetime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                              </div>
                            ) : null}

                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {uncoord ? (
                                <span className="inline-flex items-center text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                                  Por coordinar
                                </span>
                              ) : (
                                <InspectionStatusBadge status={insp.status} />
                              )}
                              <span className="text-tiny text-muted-foreground">{insp.inspection_type} · {insp.market}</span>
                              {insp.inspectorName && (
                                <span className="text-tiny text-muted-foreground flex items-center gap-1">
                                  <User className="h-3 w-3" /> {insp.inspectorName}
                                </span>
                              )}
                            </div>
                          </div>
                          <Link to={`/admin/inspections/${insp.id}`}>
                            <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                              <ExternalLink className="h-3.5 w-3.5" /> Ver / Editar
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
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
