import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import AdminLayout from '@/components/AdminLayout';
import { Info, Lock, Repeat, Eye, GitBranch, BookOpen } from 'lucide-react';

const FIXED_SECTIONS = [
  'Datos de propiedad', 'Persona que entrega', 'Acceso', 'Cocina',
  'Electrodomésticos', 'Aseo', 'Llaves', 'Medidores', 'Info Adicional',
];

const CONDITIONAL_SECTIONS = [
  { name: 'Terraza Living', condition: 'has_terrace_living = true' },
  { name: 'Terraza Dormitorio', condition: 'has_terrace_bedroom = true' },
  { name: 'Walking Closet', condition: 'has_walking_closet = true' },
  { name: 'Logia', condition: 'has_logia = true' },
  { name: 'Bodega y Estacionamiento', condition: 'has_storage = true OR has_parking = true' },
  { name: 'Antejardín', condition: 'has_front_yard = true AND property_type = casa' },
];

export default function AdminSettings() {
  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl space-y-6">
        <h1 className="text-h2">Configuración</h1>

        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Estas reglas están <strong>hardcodeadas</strong> en el MVP.
            Definen cómo se generan las secciones de inspección a partir del payload.
            En el futuro evolucionarán a templates editables.
          </AlertDescription>
        </Alert>

        {/* Fixed Sections */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-body-lg">Secciones Fijas</CardTitle>
            </div>
            <CardDescription>Siempre incluidas en toda inspección.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {FIXED_SECTIONS.map((s) => (
                <Badge key={s} variant="secondary" className="text-caption font-normal">{s}</Badge>
              ))}
            </div>
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
                  <TableCell className="font-medium">Dormitorio</TableCell>
                  <TableCell><code className="text-tiny bg-muted px-1.5 py-0.5 rounded">bedrooms_count</code></TableCell>
                  <TableCell className="text-caption text-muted-foreground">Repetir N veces → Dormitorio 1, 2…</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Baño</TableCell>
                  <TableCell><code className="text-tiny bg-muted px-1.5 py-0.5 rounded">bathrooms_count</code></TableCell>
                  <TableCell className="text-caption text-muted-foreground">Repetir N veces → Baño 1, 2…</TableCell>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {CONDITIONAL_SECTIONS.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell><code className="text-tiny bg-muted px-1.5 py-0.5 rounded">{s.condition}</code></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Property-Based Rules */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-body-lg">Reglas Basadas en Propiedad</CardTitle>
            </div>
            <CardDescription>Modifica nombre o tipo de sección según tipología.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border p-4 space-y-2">
              <p className="text-sm font-medium">Sección de Living</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <code className="text-tiny bg-muted px-1.5 py-0.5 rounded">typology = Estudio</code>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline">Living/Dormitorio</Badge>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <code className="text-tiny bg-muted px-1.5 py-0.5 rounded">typology ≠ Estudio</code>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline">Living/Comedor</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product Logic / Help */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-body-lg">Lógica de Producto</CardTitle>
            </div>
            <CardDescription>
              Documentación completa del modelo de negocio, flujo de trabajo y arquitectura.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-caption text-muted-foreground space-y-2">
            <p>La documentación técnica vive en <code className="bg-muted px-1.5 py-0.5 rounded">docs/PRODUCT_LOGIC.md</code>.</p>
            <p>Incluye: modelo de datos, roles, workflow, reglas de generación, persistencia, y limitaciones del MVP actual.</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
