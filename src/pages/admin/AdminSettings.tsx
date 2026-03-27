import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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
  const { toast } = useToast();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [newName, setNewName] = useState('');
  const [newCountry, setNewCountry] = useState('CL');
  const [loadingContractors, setLoadingContractors] = useState(true);

  const fetchContractors = async () => {
    const { data } = await supabase.from('contractors').select('*').order('name');
    setContractors((data ?? []) as unknown as Contractor[]);
    setLoadingContractors(false);
  };

  useEffect(() => { fetchContractors(); }, []);

  const addContractor = async () => {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from('contractors').insert({ name, country: newCountry });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName('');
    toast({ title: 'Contratista agregado' });
    fetchContractors();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('contractors').update({ is_active: !current }).eq('id', id);
    fetchContractors();
  };

  const deleteContractor = async (id: string) => {
    await supabase.from('contractors').delete().eq('id', id);
    toast({ title: 'Contratista eliminado' });
    fetchContractors();
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl space-y-6">
        <h1 className="text-h2">Configuración</h1>

        {/* ── Contractor Management ─────────────────────── */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <HardHat className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-body-lg">Contratistas</CardTitle>
            </div>
            <CardDescription>Gestiona los contratistas disponibles para asignación en presupuestos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add form */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-tiny font-medium text-muted-foreground mb-1 block">Nombre</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre del contratista" />
              </div>
              <div className="w-28">
                <label className="text-tiny font-medium text-muted-foreground mb-1 block">País</label>
                <Select value={newCountry} onValueChange={setNewCountry}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CL">Chile</SelectItem>
                    <SelectItem value="MX">México</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addContractor} disabled={!newName.trim()}>
                <Plus className="mr-1 h-4 w-4" /> Agregar
              </Button>
            </div>

            {/* Table */}
            {loadingContractors ? (
              <p className="text-caption text-muted-foreground py-4 text-center">Cargando...</p>
            ) : contractors.length === 0 ? (
              <p className="text-caption text-muted-foreground py-4 text-center">No hay contratistas registrados</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>País</TableHead>
                    <TableHead>Activo</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contractors.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-tiny">{c.country}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c.id, c.is_active)} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteContractor(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── Existing settings content below ───────────── */}
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
