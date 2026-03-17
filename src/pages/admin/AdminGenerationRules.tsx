import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Info, Lock, Repeat, Eye, GitBranch } from 'lucide-react';

const FIXED_SECTIONS = [
  'Datos de propiedad',
  'Persona que entrega',
  'Acceso',
  'Cocina',
  'Electrodomésticos',
  'Aseo',
  'Llaves',
  'Medidores',
  'Info Adicional',
];

const CONDITIONAL_SECTIONS = [
  { name: 'Terraza Living', condition: 'has_terrace_living = true' },
  { name: 'Terraza Dormitorio', condition: 'has_terrace_bedroom = true' },
  { name: 'Walking Closet', condition: 'has_walking_closet = true' },
  { name: 'Logia', condition: 'has_logia = true' },
  { name: 'Bodega y Estacionamiento', condition: 'has_storage = true OR has_parking = true' },
  { name: 'Antejardín', condition: 'has_front_yard = true AND property_type = casa' },
];

export default function AdminGenerationRules() {
  const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold">Reglas de Generación</h1>
              <p className="text-xs text-muted-foreground">Configuración activa · Solo lectura</p>
            </div>
          </div>
          <span className="text-sm text-muted-foreground">{profile?.full_name}</span>
        </div>
      </header>

      <main className="container py-6 space-y-6 max-w-4xl">
        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Estas reglas están actualmente <strong>hardcodeadas</strong> en el MVP.
            Definen cómo se generan las secciones de inspección a partir del payload de la propiedad.
            En el futuro evolucionarán a templates editables.
          </AlertDescription>
        </Alert>

        {/* Fixed Sections */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Secciones Fijas</CardTitle>
            </div>
            <CardDescription>Siempre incluidas en toda inspección, sin importar las propiedades.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {FIXED_SECTIONS.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs font-normal">{s}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Repeatable Sections */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Secciones Repetibles</CardTitle>
            </div>
            <CardDescription>Se generan N instancias según los datos de la propiedad.</CardDescription>
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
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">bedrooms_count</code></TableCell>
                  <TableCell className="text-sm text-muted-foreground">Repetir N veces → Dormitorio 1, Dormitorio 2…</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Baño</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">bathrooms_count</code></TableCell>
                  <TableCell className="text-sm text-muted-foreground">Repetir N veces → Baño 1, Baño 2…</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Conditional Sections */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Secciones Condicionales</CardTitle>
            </div>
            <CardDescription>Se incluyen solo si la condición del payload se cumple.</CardDescription>
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
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{s.condition}</code></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Property-Based Rules */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Reglas Basadas en Propiedad</CardTitle>
            </div>
            <CardDescription>Lógica condicional que modifica el nombre o tipo de sección.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-sm font-medium">Sección de Living</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 rounded bg-muted/50 px-3 py-2">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">typology = Estudio</code>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline">Living/Dormitorio</Badge>
                </div>
                <div className="flex items-center gap-2 rounded bg-muted/50 px-3 py-2">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">typology ≠ Estudio</code>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline">Living/Comedor</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
