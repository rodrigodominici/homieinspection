import { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, Check, FileJson, ListChecks, ArrowUpRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/hubspot-inspection-intake`;

const SAMPLE_PAYLOAD = {
  source: 'hubspot',
  event_type: 'inspection.create',
  payload_version: 'v1',
  external_event_id: 'hs_evt_98765',
  external_object_id: 'hs_prop_12345',
  data: {
    property_id: 'RE0002496',
    property_name: 'Departamento de prueba',
    property_type: 'departamento',
    market: 'CL',
    inspection_type: 'check_out',
    bedrooms_count: 1,
    bathrooms_count: 1,
    has_storage: false,
    has_parking: true,
    tenant_name: 'María González',
    tenant_whatsapp: '+56912345678',
    fecha_de_termino_real_de_contrato: '2026-03-15',
    inspector_email: 'inspectora@homie.cl',
    executive_email: 'ejecutivo@homie.cl',
  },
};

const FIELD_MAPPING = [
  { field: 'property_id', required: true, note: 'Identificador del inmueble (estable).' },
  { field: 'market', required: true, note: 'Mercado (ej. CL, MX).' },
  { field: 'inspection_type', required: true, note: 'check_in | check_out.' },
  { field: 'property_type', required: false, note: 'Única fuente de verdad para clasificación: estudio | departamento | casa.' },
  { field: 'bedrooms_count', required: false, note: 'Cantidad de dormitorios.' },
  { field: 'bathrooms_count', required: false, note: 'Cantidad de baños (mínimo 1).' },
  { field: 'has_storage', required: false, note: 'Activa la sección Bodega.' },
  { field: 'has_parking', required: false, note: 'Activa la sección Estacionamiento.' },
  { field: 'fecha_de_termino_real_de_contrato', required: false, note: 'Fecha real de término del contrato.' },
  { field: 'inspector_email', required: false, note: 'Resuelto vía external_user_mappings (provider=hubspot) → fallback profiles.email + role=inspector. El intake inyecta el id resuelto; el status final lo decide la RPC (assigned solo si ambos ids existen).' },
  { field: 'executive_email', required: false, note: 'Misma resolución que inspector_email pero con role=executive.' },
  { field: 'inspector / executive', required: false, note: 'Compat — bloque { id, email } legacy. Preferir *_email; si llega id explícito, prevalece.' },
  { field: 'typology / has_walking_closet / has_front_yard', required: false, note: '⚠️ Deprecados — ignorados por el generador.' },
];

function copy(text: string, label = 'Copiado') {
  navigator.clipboard.writeText(text);
  toast({ title: label });
}

export default function AdminIntegrationHubSpot() {
  const [stats, setStats] = useState<{ last_received?: string; last_completed?: string; last_failed?: string }>({});

  useEffect(() => {
    (async () => {
      const [{ data: lr }, { data: lc }, { data: lf }] = await Promise.all([
        supabase.from('inspection_source_events').select('received_at').eq('source', 'hubspot').order('received_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('inspection_source_events').select('processed_at').eq('source', 'hubspot').eq('processing_status', 'completed').order('processed_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('inspection_source_events').select('processed_at').eq('source', 'hubspot').eq('processing_status', 'failed').order('processed_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setStats({
        last_received: lr?.received_at ?? undefined,
        last_completed: lc?.processed_at ?? undefined,
        last_failed: lf?.processed_at ?? undefined,
      });
    })();
  }, []);

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              <Link to="/admin/integrations" className="hover:underline">Integraciones</Link> / HubSpot
            </p>
            <h1 className="text-2xl font-semibold">HubSpot — Inspections</h1>
            <p className="text-muted-foreground text-sm">Configuración del webhook entrante.</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="default">Activa</Badge>
            <Badge variant="outline">v1</Badge>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/integrations/hubspot/logs">
                <ListChecks className="mr-2 h-4 w-4" />
                Ver logs
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endpoint</CardTitle>
            <CardDescription>URL pública para configurar en HubSpot Workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(WEBHOOK_URL, 'URL copiada')}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Método: <code>POST</code> · Header de autenticación: <code>X-Webhook-Secret</code> ·
              Content-Type: <code>application/json</code>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Autenticación</CardTitle>
            <CardDescription>Secret compartido almacenado de forma segura.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <code className="px-2 py-1 rounded bg-muted text-xs">HUBSPOT_INTAKE_SECRET</code>
              <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" />configurado</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              El valor solo es accesible por las funciones de backend. Las solicitudes con secret inválido
              devuelven <code>401</code> y no se persisten.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Último evento recibido</CardDescription></CardHeader>
            <CardContent className="text-sm font-medium">
              {stats.last_received ? new Date(stats.last_received).toLocaleString() : '—'}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Último éxito</CardDescription></CardHeader>
            <CardContent className="text-sm font-medium">
              {stats.last_completed ? new Date(stats.last_completed).toLocaleString() : '—'}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Último fallo</CardDescription></CardHeader>
            <CardContent className="text-sm font-medium">
              {stats.last_failed ? new Date(stats.last_failed).toLocaleString() : '—'}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><FileJson className="h-4 w-4" />Payload de ejemplo (v1)</CardTitle>
            <CardDescription>
              <code>external_event_id</code> es la clave de idempotencia. <code>external_object_id</code> es trazabilidad.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">{JSON.stringify(SAMPLE_PAYLOAD, null, 2)}</pre>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => copy(JSON.stringify(SAMPLE_PAYLOAD, null, 2), 'Payload copiado')}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar payload
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapeo de campos</CardTitle>
            <CardDescription><code>property_type</code> es la fuente de verdad para clasificar la inspección.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="text-left py-3 px-4 align-top">Campo</th>
                  <th className="text-left py-3 px-4 align-top w-[110px]">Requerido</th>
                  <th className="text-left py-3 px-4 align-top">Descripción</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_MAPPING.map((m) => (
                  <tr key={m.field} className="border-b last:border-0">
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <code className="text-xs">{m.field}</code>
                    </td>
                    <td className="py-3 px-4 align-top w-[110px]">
                      <Badge variant={m.required ? 'default' : 'outline'} className="w-fit mr-2">
                        {m.required ? 'requerido' : 'opcional'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 align-top whitespace-normal break-words text-xs text-muted-foreground">
                      {m.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Idempotencia & duplicados</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Si <code>external_event_id</code> no se envía, se genera deterministicamente combinando
              <code> source · event_type · external_object_id · payload_version · property_id · inspection_type · hora actual</code>.
            </p>
            <p>
              Reenvíos del mismo <code>external_event_id</code> NO crean filas nuevas: se acumulan en el
              evento original como <code>duplicate_count</code> y se devuelve <code>200</code> con
              <code> status=duplicate</code>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4" />
                  Sincronización HubSpot saliente
                </CardTitle>
                <CardDescription>
                  Eventos de la inspección que se reflejan automáticamente en el contrato de HubSpot.
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/integrations/hubspot/outbound-logs">
                  <ListChecks className="mr-2 h-4 w-4" />
                  Ver logs salientes
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded border p-3 space-y-1">
              <div className="font-medium">
                <code className="text-xs">fecha_recoleccion_llaves</code>
              </div>
              <p className="text-xs text-muted-foreground">
                Se envía al contrato cuando el inspector guarda la fecha de recolección de llaves.
              </p>
            </div>
            <div className="rounded border p-3 space-y-1">
              <div className="font-medium">
                <code className="text-xs">fecha_recepcion_checkout</code>
              </div>
              <p className="text-xs text-muted-foreground">
                Se envía al contrato cuando la inspección pasa a estado <code>submitted</code>.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Object type id: <code>2-47492934</code> (Contrato de Locación). El contrato destino se resuelve
              vía <code>inspection_external_references</code> — el modelo de inspecciones permanece desacoplado de HubSpot.
            </p>
            <p className="text-xs text-muted-foreground">
              Transporte: PATCH directo a <code>https://api.hubapi.com</code> autenticado con el secreto{' '}
              <code>HUBSPOT_PRIVATE_APP_TOKEN</code> (Private App). El secreto de inbound{' '}
              <code>HUBSPOT_INTAKE_SECRET</code> no se usa para esta ruta.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
