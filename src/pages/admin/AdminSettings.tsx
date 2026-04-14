import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import AdminLayout from '@/components/AdminLayout';
import { Info, Repeat, Eye, GitBranch, BookOpen, CheckCircle, AlertTriangle, ListOrdered } from 'lucide-react';

/**
 * Admin Settings — Generation Rules Documentation
 *
 * This page is the source of truth for the inspection flow as implemented
 * in src/lib/inspection-generator.ts (V4 — 15-screen model).
 */

const SECTION_ORDER = [
  { n: 1,  key: 'introduction',        title: 'Introducción',              visibility: 'Always',                             note: 'Aseo, fumigación, retiro de enseres' },
  { n: 2,  key: 'property_data',       title: 'Datos del Inmueble',        visibility: 'Always',                             note: 'Medidores, contacto administración' },
  { n: 3,  key: 'handover_person',     title: 'Datos del Inquilino',       visibility: 'Always',                             note: 'Persona que entrega' },
  { n: 4,  key: 'access',             title: 'Acceso',                    visibility: 'Always',                             note: '' },
  { n: 5,  key: 'living',             title: 'Living',                    visibility: 'Always',                             note: '' },
  { n: 6,  key: 'kitchen_appliances', title: 'Cocina / Electrodomésticos', visibility: 'Always',                            note: 'Logia como sub-grupo matrix (8 ítems), NA permitido' },
  { n: 7,  key: 'bedroom_N',          title: 'Dormitorio 1..N',           visibility: 'NOT estudio; repeat bedrooms_count', note: 'Se repite según cantidad de dormitorios' },
  { n: 8,  key: 'walking_closet',     title: 'Walking Closet',            visibility: 'NOT estudio',                        note: 'Después del último Dormitorio, antes de Baños' },
  { n: 9,  key: 'bathroom_N',         title: 'Baño 1..N',                 visibility: 'Always; repeat bathrooms_count',     note: 'Siempre al menos 1 instancia (min 1)' },
  { n: 10, key: 'terrace_patio',      title: 'Terraza / Patio Trasero',   visibility: 'Always',                             note: '' },
  { n: 11, key: 'front_yard',         title: 'Patio Delantero',           visibility: 'property_type = casa',               note: 'Solo para casas' },
  { n: 12, key: 'otros_generales',    title: 'Otros Generales',           visibility: 'Always',                             note: 'Formulario operativo de cierre (closing_operational)' },
  { n: 13, key: 'bodega',             title: 'Bodega',                    visibility: 'has_storage = true',                 note: 'Condicional — solo bodega' },
  { n: 14, key: 'estacionamiento',    title: 'Estacionamiento',           visibility: 'has_parking = true',                 note: 'Solo fotos — evidencia de estacionamiento' },
  { n: 15, key: 'tenant_signature',   title: 'Firma de Inquilino',        visibility: 'Always (final)',                     note: 'Observaciones generales + firma' },
];

const ACTIVE_DRIVERS = [
  { field: 'property_type',   type: 'string',  usage: 'Fuente primaria para detección de estudio (estudio_loft). También determina Patio Delantero (casa)' },
  { field: 'typology',        type: 'string',  usage: 'Compatibilidad retroactiva para detección de estudio. Secundario a property_type' },
  { field: 'bedrooms_count',  type: 'number',  usage: 'Cantidad de Dormitorios repetidos. NO se usa para clasificar estudio' },
  { field: 'bathrooms_count', type: 'number',  usage: 'Cantidad de Baños repetidos (min 1 siempre)' },
  { field: 'has_storage',     type: 'boolean', usage: 'Visibilidad de sección Bodega' },
  { field: 'has_parking',     type: 'boolean', usage: 'Visibilidad de sección Estacionamiento' },
];

const DEPRECATED_FLAGS = [
  { field: 'has_walking_closet',   reason: 'Ahora se infiere: aparece siempre para no-estudio' },
  { field: 'has_front_yard',       reason: 'Ahora se infiere de property_type = casa' },
  { field: 'has_terrace_living',   reason: 'Terraza es siempre visible' },
  { field: 'has_terrace_bedroom',  reason: 'Fusionada en sección única Terraza / Patio Trasero' },
  { field: 'has_logia',            reason: 'Logia siempre dentro de Cocina con opción NA' },
];

const OTROS_GENERALES_FIELDS = [
  { field: 'og_limpieza',         type: 'single_select', label: '¿Se requiere limpieza?',          options: 'Profunda / Básica / No se requiere', required: true },
  { field: 'og_retiro_enseres',   type: 'single_select', label: '¿Retiro de Enseres?',             options: 'Sí / No',                            required: true },
  { field: 'og_fumigacion',       type: 'single_select', label: '¿Requiere Fumigación?',           options: 'Sí / No',                            required: true },
  { field: 'og_medidores_obs',    type: 'textarea',      label: 'Observaciones / Medidores',       options: '—',                                  required: false },
  { field: 'og_medidores_photos', type: 'photo_upload',  label: 'Fotos Medidores y Otras',         options: '—',                                  required: false },
  { field: 'og_admin_contacto',   type: 'textarea',      label: 'Administrador / Mayordomo',       options: '—',                                  required: false },
];

const LOGIA_MATRIX_ITEMS = [
  'Calefón', 'Thermo', 'Inspección Gas', 'Grifería Lavadero',
  'Lámpara', 'Enchufes', 'Interruptor', 'Armario',
];

export default function AdminSettings() {
  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl space-y-6">
        <h1 className="text-h2">Reglas de Generación</h1>
        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Esta página refleja la lógica <strong>real implementada</strong> en el generador de inspecciones (V4 — 15 pantallas).
            Actúa como fuente de verdad del flujo actual. En el futuro evolucionará a templates editables.
          </AlertDescription>
        </Alert>

        {/* Section Order */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-body-lg">Orden Final de Secciones</CardTitle>
            </div>
            <CardDescription>Las 15 pantallas generadas en orden, con su regla de visibilidad.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Sección</TableHead>
                  <TableHead>Visibilidad</TableHead>
                  <TableHead>Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SECTION_ORDER.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell className="font-mono text-muted-foreground">{s.n}</TableCell>
                    <TableCell className="font-medium">{s.title}</TableCell>
                    <TableCell>
                      <code className="text-tiny bg-muted px-1.5 py-0.5 rounded">{s.visibility}</code>
                    </TableCell>
                    <TableCell className="text-caption text-muted-foreground">{s.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Repeatable Sections */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-body-lg">Secciones Repetibles</CardTitle>
            </div>
            <CardDescription>Se generan N instancias según datos de la propiedad.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sección</TableHead>
                  <TableHead>Campo fuente</TableHead>
                  <TableHead>Lógica</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Dormitorio 1..N</TableCell>
                  <TableCell><code className="text-tiny bg-muted px-1.5 py-0.5 rounded">bedrooms_count</code></TableCell>
                  <TableCell className="text-caption text-muted-foreground">Solo si NO es estudio. Repite N veces → Dormitorio 1, 2…</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Baño 1..N</TableCell>
                  <TableCell><code className="text-tiny bg-muted px-1.5 py-0.5 rounded">bathrooms_count</code></TableCell>
                  <TableCell className="text-caption text-muted-foreground">Siempre al menos 1 instancia. Repite N veces (min 1) → Baño 1, 2…</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Conditional Sections */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-body-lg">Secciones Condicionales</CardTitle>
            </div>
            <CardDescription>Incluidas solo si la condición se cumple.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sección</TableHead>
                  <TableHead>Condición</TableHead>
                  <TableHead>Posición</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Dormitorio 1..N</TableCell>
                  <TableCell><code className="text-tiny bg-muted px-1.5 py-0.5 rounded">NOT estudio (typology ≠ Estudio AND bedrooms_count &gt; 0)</code></TableCell>
                  <TableCell className="text-caption text-muted-foreground">#7</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Walking Closet</TableCell>
                  <TableCell><code className="text-tiny bg-muted px-1.5 py-0.5 rounded">NOT estudio</code></TableCell>
                  <TableCell className="text-caption text-muted-foreground">#8 — después del último Dormitorio</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Patio Delantero</TableCell>
                  <TableCell><code className="text-tiny bg-muted px-1.5 py-0.5 rounded">property_type = casa</code></TableCell>
                  <TableCell className="text-caption text-muted-foreground">#11</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Bodega</TableCell>
                  <TableCell><code className="text-tiny bg-muted px-1.5 py-0.5 rounded">has_storage = true</code></TableCell>
                  <TableCell className="text-caption text-muted-foreground">#13</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Property-Based Rules */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-body-lg">Regla de Living (Estudio)</CardTitle>
            </div>
            <CardDescription>Modifica nombre de sección según tipología.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border p-4 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <code className="text-tiny bg-muted px-1.5 py-0.5 rounded">typology = Estudio</code>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline">Living (sin Dormitorios, sin Walking Closet)</Badge>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <code className="text-tiny bg-muted px-1.5 py-0.5 rounded">typology ≠ Estudio</code>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline">Living + Dormitorio 1..N + Walking Closet</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Drivers */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <CardTitle className="text-body-lg">Campos Activos del Payload</CardTitle>
            </div>
            <CardDescription>Campos del JSON que actualmente controlan la generación de secciones.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Uso en generación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ACTIVE_DRIVERS.map((d) => (
                  <TableRow key={d.field}>
                    <TableCell><code className="text-tiny bg-muted px-1.5 py-0.5 rounded font-medium">{d.field}</code></TableCell>
                    <TableCell className="text-caption">{d.type}</TableCell>
                    <TableCell className="text-caption text-muted-foreground">{d.usage}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Deprecated Flags */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <CardTitle className="text-body-lg">Flags Deprecados</CardTitle>
            </div>
            <CardDescription>Existen en el DB/payload pero ya no controlan la generación. Se planea eliminarlos.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flag</TableHead>
                  <TableHead>Razón de deprecación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DEPRECATED_FLAGS.map((f) => (
                  <TableRow key={f.field}>
                    <TableCell>
                      <code className="text-tiny bg-muted px-1.5 py-0.5 rounded line-through">{f.field}</code>
                    </TableCell>
                    <TableCell className="text-caption text-muted-foreground">{f.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Logia Matrix */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-body-lg">Logia o Armario de Boiler/Calentador</CardTitle>
            </div>
            <CardDescription>Sub-grupo matrix dentro de Cocina. Cada ítem se evalúa con Bueno / Regular / Malo / NA. Más observaciones y fotos.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {LOGIA_MATRIX_ITEMS.map((item) => (
                <Badge key={item} variant="outline" className="text-caption">{item}</Badge>
              ))}
            </div>
            <p className="text-caption text-muted-foreground mt-3">+ Observaciones Logia (textarea) + Fotos Logia (photo_upload)</p>
          </CardContent>
        </Card>

        {/* Otros Generales */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-body-lg">Otros Generales — Formulario Operativo</CardTitle>
            </div>
            <CardDescription>Sección <code className="text-tiny bg-muted px-1.5 py-0.5 rounded">closing_operational</code>. No es matrix. Campos obligatorios marcados con ●.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Opciones</TableHead>
                  <TableHead className="w-10">Req.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {OTROS_GENERALES_FIELDS.map((f) => (
                  <TableRow key={f.field}>
                    <TableCell className="font-medium">{f.label}</TableCell>
                    <TableCell><code className="text-tiny bg-muted px-1.5 py-0.5 rounded">{f.type}</code></TableCell>
                    <TableCell className="text-caption text-muted-foreground">{f.options}</TableCell>
                    <TableCell>{f.required ? '●' : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
