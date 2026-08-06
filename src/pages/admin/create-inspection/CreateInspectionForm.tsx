/**
 * Creación de inspecciones on-demand (admin).
 *
 * Reemplaza el flujo antiguo de "pegar JSON": el admin ingresa el ID de
 * inmueble, se traen los datos desde la API de Homie (editables), se pide el
 * ID de objeto de HubSpot para habilitar el sync y se asigna receptor +
 * ejecutivo. La creación reutiliza la misma RPC transaccional que el intake
 * automático.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { lookupRealty } from '@/lib/homie-realty';
import { createInspectionFromPayload } from '@/lib/inspection-service';
import { inspectionTypeLabel } from '@/lib/inspection-type-labels';
import type { Inspection, Profile, PropertyPayload } from '@/lib/types';
import { AlertCircle, Building2, CheckCircle2, Loader2, Search, Zap } from 'lucide-react';

interface Props {
  inspectors: Profile[];
  executives: Profile[];
  createdBy: string;
  onCreated: (inspection: Inspection) => void;
}

type FormState = {
  inspection_type: 'check_out' | 'captacion';
  market: string;
  property_id: string;
  property_name: string;
  address: string;
  property_type: string;
  bedrooms_count: string;
  bathrooms_count: string;
  unit_number: string;
  comuna: string;
  has_parking: boolean;
  parking_number: string;
  has_storage: boolean;
  storage_number: string;
  hubspot_object_id: string;
  scheduled_at: string;
  fecha_de_termino_real_de_contrato: string;
  fecha_recoleccion_llaves: string;
  hora_recoleccion_llaves: string;
  tenant_name: string;
  tenant_whatsapp: string;
  warranty_deposit: string;
  inspector_id: string;
  executive_id: string;
};

const INITIAL: FormState = {
  inspection_type: 'check_out',
  market: 'chile',
  property_id: '',
  property_name: '',
  address: '',
  property_type: '',
  bedrooms_count: '',
  bathrooms_count: '',
  unit_number: '',
  comuna: '',
  has_parking: false,
  parking_number: '',
  has_storage: false,
  storage_number: '',
  hubspot_object_id: '',
  scheduled_at: '',
  fecha_de_termino_real_de_contrato: '',
  fecha_recoleccion_llaves: '',
  hora_recoleccion_llaves: '',
  tenant_name: '',
  tenant_whatsapp: '',
  warranty_deposit: '',
  inspector_id: '',
  executive_id: '',
};

const PROPERTY_TYPES = [
  { value: 'departamento', label: 'Departamento' },
  { value: 'casa', label: 'Casa' },
  { value: 'estudio', label: 'Estudio' },
];

export default function CreateInspectionForm({ inspectors, executives, createdBy, onCreated }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [lookupId, setLookupId] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupOk, setLookupOk] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleLookup = async () => {
    const id = lookupId.trim().toUpperCase();
    if (!id) return;
    setLooking(true);
    setLookupError(null);
    setLookupOk(false);
    try {
      const r = await lookupRealty(id);
      setForm((prev) => ({
        ...prev,
        property_id: r.property_id || id,
        property_name: r.property_name ?? prev.property_name,
        address: r.address ?? prev.address,
        property_type: r.property_type ?? prev.property_type,
        bedrooms_count: r.bedrooms_count != null ? String(r.bedrooms_count) : prev.bedrooms_count,
        bathrooms_count: r.bathrooms_count != null ? String(r.bathrooms_count) : prev.bathrooms_count,
        unit_number: r.unit_number ?? prev.unit_number,
        comuna: r.comuna ?? prev.comuna,
        has_parking: r.has_parking ?? prev.has_parking,
        parking_number: r.parking_number ?? prev.parking_number,
        has_storage: r.has_storage ?? prev.has_storage,
        storage_number: r.storage_number ?? prev.storage_number,
      }));
      setLookupOk(true);
      toast({ title: 'Inmueble encontrado', description: r.address ?? r.property_id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error consultando la API';
      setLookupError(msg);
      set('property_id', id);
    } finally {
      setLooking(false);
    }
  };

  const missing: string[] = [];
  if (!form.property_id.trim()) missing.push('ID de inmueble');
  if (!form.address.trim()) missing.push('dirección');
  if (!form.property_type) missing.push('tipo de propiedad');
  if (form.bedrooms_count === '') missing.push('dormitorios');
  if (form.bathrooms_count === '') missing.push('baños');
  if (!form.hubspot_object_id.trim()) missing.push('ID de objeto de HubSpot');
  if (!form.inspector_id) missing.push('receptor');
  if (!form.executive_id) missing.push('ejecutivo');

  const handleCreate = async () => {
    if (missing.length > 0) return;
    setCreating(true);
    try {
      const inspector = inspectors.find((p) => p.id === form.inspector_id);
      const executive = executives.find((p) => p.id === form.executive_id);
      const hubspotId = form.hubspot_object_id.trim();

      const payload: PropertyPayload = {
        property_id: form.property_id.trim().toUpperCase(),
        market: form.market,
        inspection_type: form.inspection_type,
        hubspot_property_id: hubspotId,
        property_name: form.property_name.trim() || form.address.trim(),
        address: form.address.trim(),
        property_type: form.property_type,
        bedrooms_count: Number(form.bedrooms_count),
        bathrooms_count: Number(form.bathrooms_count),
        unit_number: form.unit_number.trim() || undefined,
        comuna: form.comuna.trim() || undefined,
        has_parking: form.has_parking,
        parking_number: form.has_parking ? form.parking_number.trim() || undefined : undefined,
        has_storage: form.has_storage,
        storage_number: form.has_storage ? form.storage_number.trim() || undefined : undefined,
        tenant_name: form.tenant_name.trim() || undefined,
        tenant_whatsapp: form.tenant_whatsapp.trim() || undefined,
        warranty_deposit: form.warranty_deposit ? Number(form.warranty_deposit) : undefined,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : undefined,
        fecha_de_termino_real_de_contrato: form.fecha_de_termino_real_de_contrato || undefined,
        fecha_recoleccion_llaves: form.fecha_recoleccion_llaves || undefined,
        hora_recoleccion_llaves: form.hora_recoleccion_llaves || undefined,
        inspector: inspector
          ? { id: inspector.id, name: inspector.full_name, email: inspector.email }
          : undefined,
        executive: executive
          ? { id: executive.id, name: executive.full_name, email: executive.email }
          : undefined,
      };

      const inspection = await createInspectionFromPayload(payload, createdBy, {
        externalObjectId: hubspotId,
      });

      toast({
        title: 'Inspección creada',
        description: `${payload.property_id} — ${payload.address}`,
      });
      onCreated(inspection as unknown as Inspection);
      setForm(INITIAL);
      setLookupId('');
      setLookupOk(false);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error creando la inspección',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Paso 1 — Tipo + búsqueda del inmueble */}
      <Card className="border-0 ring-1 ring-border shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-body-lg">Paso 1 — Inmueble</CardTitle>
          </div>
          <CardDescription>
            Ingresa el ID de inmueble para traer los datos desde Homie
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de inspección</Label>
              <Select
                value={form.inspection_type}
                onValueChange={(v) => set('inspection_type', v as FormState['inspection_type'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="check_out">{inspectionTypeLabel('check_out')}</SelectItem>
                  <SelectItem value="captacion">{inspectionTypeLabel('captacion')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mercado</Label>
              <Select value={form.market} onValueChange={(v) => set('market', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="chile">Chile</SelectItem>
                  <SelectItem value="mexico">México</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>ID de inmueble</Label>
            <div className="flex gap-2">
              <Input
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
                placeholder="RE0003927"
                className="font-mono"
              />
              <Button onClick={handleLookup} disabled={looking || !lookupId.trim()} variant="secondary">
                {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2">Buscar</span>
              </Button>
            </div>
            {lookupOk && (
              <p className="flex items-center gap-1.5 text-caption text-status-good">
                <CheckCircle2 className="h-3.5 w-3.5" /> Datos precargados desde la API — podés editarlos abajo
              </p>
            )}
            {lookupError && (
              <p className="flex items-start gap-1.5 text-caption text-status-regular">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {lookupError} — completá los datos manualmente.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Paso 2 — Datos del inmueble */}
      <Card className="border-0 ring-1 ring-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-body-lg">Paso 2 — Datos del inmueble</CardTitle>
          <CardDescription>Todos los campos son editables</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>ID de inmueble *</Label>
            <Input value={form.property_id} onChange={(e) => set('property_id', e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Nombre / referencia</Label>
            <Input value={form.property_name} onChange={(e) => set('property_name', e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Dirección *</Label>
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="San Ignacio de Loyola 3233 D 503" />
          </div>
          <div className="space-y-2">
            <Label>Tipo de propiedad *</Label>
            <Select value={form.property_type} onValueChange={(v) => set('property_type', v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Comuna</Label>
            <Input value={form.comuna} onChange={(e) => set('comuna', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Dormitorios *</Label>
            <Input type="number" min={0} value={form.bedrooms_count} onChange={(e) => set('bedrooms_count', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Baños *</Label>
            <Input type="number" min={0} value={form.bathrooms_count} onChange={(e) => set('bathrooms_count', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Departamento / unidad</Label>
            <Input value={form.unit_number} onChange={(e) => set('unit_number', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Garantía</Label>
            <Input type="number" min={0} value={form.warranty_deposit} onChange={(e) => set('warranty_deposit', e.target.value)} />
          </div>
          <div className="space-y-3 rounded-lg bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">Tiene estacionamiento</Label>
              <Switch checked={form.has_parking} onCheckedChange={(v) => set('has_parking', v)} />
            </div>
            {form.has_parking && (
              <Input
                value={form.parking_number}
                onChange={(e) => set('parking_number', e.target.value)}
                placeholder="N° de estacionamiento"
              />
            )}
          </div>
          <div className="space-y-3 rounded-lg bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">Tiene bodega</Label>
              <Switch checked={form.has_storage} onCheckedChange={(v) => set('has_storage', v)} />
            </div>
            {form.has_storage && (
              <Input
                value={form.storage_number}
                onChange={(e) => set('storage_number', e.target.value)}
                placeholder="N° de bodega"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Paso 3 — HubSpot */}
      <Card className="border-0 ring-1 ring-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-body-lg">Paso 3 — HubSpot</CardTitle>
          <CardDescription>
            {form.inspection_type === 'captacion'
              ? 'ID del Deal (pipeline Publicaciones) — habilita la sincronización'
              : 'ID del objeto Contrato de Locación — habilita la sincronización'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>ID de objeto de HubSpot *</Label>
          <Input
            value={form.hubspot_object_id}
            onChange={(e) => set('hubspot_object_id', e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="37395005360"
            className="font-mono"
          />
          <p className="text-caption text-muted-foreground">
            Sólo el número que aparece en la URL del registro en HubSpot.
          </p>
        </CardContent>
      </Card>

      {/* Paso 4 — Fechas e inquilino */}
      <Card className="border-0 ring-1 ring-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-body-lg">Paso 4 — Fechas e inquilino</CardTitle>
          <CardDescription>Opcional, pero recomendado para el calendario y el aviso al inquilino</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Recepción programada</Label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => set('scheduled_at', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Término real de contrato</Label>
            <Input type="date" value={form.fecha_de_termino_real_de_contrato} onChange={(e) => set('fecha_de_termino_real_de_contrato', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Fecha recolección de llaves</Label>
            <Input type="date" value={form.fecha_recoleccion_llaves} onChange={(e) => set('fecha_recoleccion_llaves', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Hora recolección de llaves</Label>
            <Input type="time" value={form.hora_recoleccion_llaves} onChange={(e) => set('hora_recoleccion_llaves', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Nombre del inquilino</Label>
            <Input value={form.tenant_name} onChange={(e) => set('tenant_name', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp del inquilino</Label>
            <Input value={form.tenant_whatsapp} onChange={(e) => set('tenant_whatsapp', e.target.value)} placeholder="+56912345678" />
          </div>
        </CardContent>
      </Card>

      {/* Paso 5 — Asignación */}
      <Card className="border-0 ring-1 ring-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-body-lg">Paso 5 — Asignación</CardTitle>
          <CardDescription>Receptor en terreno y ejecutivo responsable</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Receptor *</Label>
            {inspectors.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-status-regular">
                <AlertCircle className="h-4 w-4" /> No hay receptores registrados
              </div>
            ) : (
              <Select value={form.inspector_id} onValueChange={(v) => set('inspector_id', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {inspectors.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>Ejecutivo *</Label>
            {executives.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-status-regular">
                <AlertCircle className="h-4 w-4" /> No hay ejecutivos registrados
              </div>
            ) : (
              <Select value={form.executive_id} onValueChange={(v) => set('executive_id', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {executives.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {missing.length > 0 && (
        <p className="text-caption text-muted-foreground">
          Falta completar: {missing.join(', ')}.
        </p>
      )}

      <Button
        onClick={handleCreate}
        disabled={creating || missing.length > 0}
        className="w-full h-12 text-body-lg"
        size="lg"
      >
        {creating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Zap className="mr-2 h-5 w-5" />}
        {creating ? 'Creando...' : 'Crear inspección'}
      </Button>
    </div>
  );
}
