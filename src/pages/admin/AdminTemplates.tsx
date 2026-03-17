import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, ChevronRight, Layers, Eye, EyeOff, Repeat, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Template {
  id: string;
  name: string;
  market: string;
  property_type: string | null;
  typology: string | null;
  inspection_type: string;
  is_active: boolean;
  created_at: string;
}

interface TemplateSection {
  id: string;
  template_id: string;
  section_key: string;
  section_title: string;
  section_type: string;
  sort_order: number;
  is_repeatable: boolean;
  visibility_rules: Record<string, unknown> | null;
}

export default function AdminTemplates() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Create template dialog
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMarket, setNewMarket] = useState('CL');
  const [newPropertyType, setNewPropertyType] = useState('');
  const [newTypology, setNewTypology] = useState('');
  const [newInspectionType, setNewInspectionType] = useState('check_out');
  const [saving, setSaving] = useState(false);

  // Detail view
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);

  // Add section dialog
  const [addingSection, setAddingSection] = useState(false);
  const [secKey, setSecKey] = useState('');
  const [secTitle, setSecTitle] = useState('');
  const [secType, setSecType] = useState('space_standard');
  const [secRepeatable, setSecRepeatable] = useState(false);
  const [secRulesText, setSecRulesText] = useState('');

  const fetchTemplates = async () => {
    const { data } = await supabase.from('inspection_templates').select('*').order('created_at', { ascending: false });
    setTemplates((data ?? []) as unknown as Template[]);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const fetchSections = async (templateId: string) => {
    setLoadingSections(true);
    const { data } = await supabase
      .from('inspection_template_sections')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order');
    setSections((data ?? []) as unknown as TemplateSection[]);
    setLoadingSections(false);
  };

  const handleSelectTemplate = (t: Template) => {
    setSelectedTemplate(t);
    fetchSections(t.id);
  };

  const handleCreateTemplate = async () => {
    if (!newName) return;
    setSaving(true);
    const { data, error } = await supabase.from('inspection_templates').insert({
      name: newName,
      market: newMarket,
      property_type: newPropertyType || null,
      typology: newTypology || null,
      inspection_type: newInspectionType,
    }).select().single();
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Template creado' });
      setCreating(false);
      setNewName('');
      fetchTemplates();
    }
  };

  const handleToggleActive = async (t: Template) => {
    const { error } = await supabase.from('inspection_templates').update({ is_active: !t.is_active }).eq('id', t.id);
    if (!error) {
      setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: !x.is_active } : x));
      if (selectedTemplate?.id === t.id) setSelectedTemplate({ ...t, is_active: !t.is_active });
    }
  };

  const handleAddSection = async () => {
    if (!selectedTemplate || !secKey || !secTitle) return;
    setSaving(true);
    let rules: Record<string, unknown> | null = null;
    if (secRulesText.trim()) {
      try { rules = JSON.parse(secRulesText); } catch { toast({ title: 'JSON inválido en reglas', variant: 'destructive' }); setSaving(false); return; }
    }
    const { error } = await supabase.from('inspection_template_sections').insert([{
      template_id: selectedTemplate.id,
      section_key: secKey,
      section_title: secTitle,
      section_type: secType,
      sort_order: sections.length,
      is_repeatable: secRepeatable,
      visibility_rules: rules as unknown as import('@/integrations/supabase/types').Json,
    }]);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Sección agregada' });
      setAddingSection(false);
      setSecKey(''); setSecTitle(''); setSecRulesText(''); setSecRepeatable(false);
      fetchSections(selectedTemplate.id);
    }
  };

  // List view
  if (!selectedTemplate) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
          <div className="container flex h-16 items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold">Templates de Inspección</h1>
              <p className="text-xs text-muted-foreground">Plantillas para generación dinámica de secciones</p>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Nuevo Template
            </Button>
          </div>
        </header>

        <main className="container max-w-4xl py-6 space-y-4">
          {/* Current generation rules info */}
          <Card className="border-0 ring-1 ring-primary/20 bg-primary/5 shadow-sm">
            <CardContent className="py-4">
              <p className="text-sm font-medium text-primary">Generación Actual</p>
              <p className="text-xs text-muted-foreground mt-1">
                El sistema actualmente genera secciones dinámicamente desde el payload de la propiedad usando reglas codificadas.
                Los templates listados aquí se usarán en el futuro para reemplazar esas reglas estáticas.
              </p>
            </CardContent>
          </Card>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Cargando...</div>
          ) : templates.length === 0 ? (
            <Card className="border-0 ring-1 ring-border/50 shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Layers className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p>No hay templates creados aún.</p>
                <Button className="mt-4" size="sm" onClick={() => setCreating(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Crear Primer Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <Card
                  key={t.id}
                  className="border-0 ring-1 ring-border/50 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleSelectTemplate(t)}
                >
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{t.name}</p>
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                          t.is_active ? 'bg-status-good-bg text-status-good' : 'bg-muted text-muted-foreground'
                        )}>
                          {t.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{t.market}</span>
                        {t.property_type && <span>{t.property_type}</span>}
                        {t.typology && <span>{t.typology}</span>}
                        <span>{t.inspection_type}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>

        {/* Create dialog */}
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo Template</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ej: Check Out Departamento CL" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mercado</Label>
                  <Select value={newMarket} onValueChange={setNewMarket}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CL">Chile</SelectItem>
                      <SelectItem value="MX">México</SelectItem>
                      <SelectItem value="CO">Colombia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo Inspección</Label>
                  <Select value={newInspectionType} onValueChange={setNewInspectionType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="check_out">Check Out</SelectItem>
                      <SelectItem value="check_in">Check In</SelectItem>
                      <SelectItem value="periodic">Periódica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo Propiedad (opcional)</Label>
                  <Input value={newPropertyType} onChange={(e) => setNewPropertyType(e.target.value)} placeholder="departamento, casa" />
                </div>
                <div className="space-y-2">
                  <Label>Tipología (opcional)</Label>
                  <Input value={newTypology} onChange={(e) => setNewTypology(e.target.value)} placeholder="Estudio, 2D2B" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setCreating(false)} className="flex-1">Cancelar</Button>
                <Button onClick={handleCreateTemplate} disabled={saving || !newName} className="flex-1">
                  {saving ? 'Creando...' : 'Crear'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Detail view
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setSelectedTemplate(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{selectedTemplate.name}</h1>
            <p className="text-xs text-muted-foreground">
              {selectedTemplate.market} · {selectedTemplate.inspection_type}
              {selectedTemplate.property_type ? ` · ${selectedTemplate.property_type}` : ''}
              {selectedTemplate.typology ? ` · ${selectedTemplate.typology}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Activo</span>
            <Switch
              checked={selectedTemplate.is_active}
              onCheckedChange={() => handleToggleActive(selectedTemplate)}
            />
          </div>
        </div>
      </header>

      <main className="container max-w-4xl py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Secciones ({sections.length})
          </h2>
          <Button size="sm" onClick={() => setAddingSection(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Agregar Sección
          </Button>
        </div>

        {loadingSections ? (
          <div className="py-12 text-center text-muted-foreground">Cargando secciones...</div>
        ) : sections.length === 0 ? (
          <Card className="border-0 ring-1 ring-border/50 shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>Este template no tiene secciones aún.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sections.map((s, idx) => (
              <Card key={s.id} className="border-0 ring-1 ring-border/50 shadow-sm">
                <CardContent className="py-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{s.section_title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{s.section_key}</span>
                      <span>·</span>
                      <span>{s.section_type}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.is_repeatable && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        <Repeat className="h-3 w-3" /> Repetible
                      </span>
                    )}
                    {s.visibility_rules && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-status-regular-bg px-2 py-0.5 text-[11px] font-medium text-status-regular">
                        <Eye className="h-3 w-3" /> Condicional
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Generation rules reference */}
        <Card className="border-0 ring-1 ring-border/50 shadow-sm mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Reglas de Generación (Referencia)</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Las reglas de visibilidad se definen como JSON en cada sección. Ejemplos:</p>
            <pre className="bg-muted/50 rounded-lg p-3 overflow-x-auto text-[11px] font-mono">
{`{ "condition": "typology", "equals": "Estudio" }
{ "condition": "has_terrace_living", "equals": true }
{ "condition": "bedrooms_count", "gte": 2 }
{ "condition": "property_type", "equals": "casa" }`}</pre>
          </CardContent>
        </Card>
      </main>

      {/* Add section dialog */}
      <Dialog open={addingSection} onOpenChange={setAddingSection}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agregar Sección</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input value={secKey} onChange={(e) => setSecKey(e.target.value)} placeholder="ej: bedroom_1" className="font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={secTitle} onChange={(e) => setSecTitle(e.target.value)} placeholder="ej: Dormitorio 1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={secType} onValueChange={setSecType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="property_meta">Metadatos</SelectItem>
                    <SelectItem value="handover_meta">Entrega</SelectItem>
                    <SelectItem value="space_standard">Espacio Estándar</SelectItem>
                    <SelectItem value="space_secondary">Espacio Secundario</SelectItem>
                    <SelectItem value="space_technical">Espacio Técnico</SelectItem>
                    <SelectItem value="closing_summary">Cierre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Repetible</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Switch checked={secRepeatable} onCheckedChange={setSecRepeatable} />
                  <span className="text-sm text-muted-foreground">{secRepeatable ? 'Sí' : 'No'}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reglas de Visibilidad (JSON, opcional)</Label>
              <Textarea
                value={secRulesText}
                onChange={(e) => setSecRulesText(e.target.value)}
                placeholder='{ "condition": "has_terrace_living", "equals": true }'
                className="font-mono text-xs"
                rows={3}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setAddingSection(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleAddSection} disabled={saving || !secKey || !secTitle} className="flex-1">
                {saving ? 'Agregando...' : 'Agregar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
