import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { RepairCatalogCategory, RepairCatalogItem } from '@/lib/types';
import { Plus, Pencil, Search, Tag, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRICING_TYPES = [
  { value: 'fixed', label: 'Precio fijo' },
  { value: 'per_unit', label: 'Por unidad' },
  { value: 'per_m2', label: 'Por m²' },
];

const UNIT_OPTIONS = ['unit', 'ml', 'm2', 'pieza', 'servicio', 'hora'];

export default function AdminRepairCatalog() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [categories, setCategories] = useState<RepairCatalogCategory[]>([]);
  const [items, setItems] = useState<RepairCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<string>('active');

  // Category dialog
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<RepairCatalogCategory | null>(null);
  const [catName, setCatName] = useState('');

  // Item dialog
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RepairCatalogItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: '', owner_friendly_name: '', category_id: '', description: '',
    unit: 'unit', pricing_type: 'fixed', base_price: '0', currency: 'MXN',
    market: '', internal_notes: '', is_active: true,
  });

  const fetchData = async () => {
    const [{ data: cats }, { data: its }] = await Promise.all([
      supabase.from('repair_catalog_categories').select('*').order('sort_order'),
      supabase.from('repair_catalog_items').select('*, repair_catalog_categories(*)').order('name'),
    ]);
    setCategories((cats ?? []) as unknown as RepairCatalogCategory[]);
    setItems((its ?? []).map((i: any) => ({ ...i, category: i.repair_catalog_categories })) as unknown as RepairCatalogItem[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Category CRUD
  const saveCat = async () => {
    if (!catName.trim()) return;
    if (editingCat) {
      await supabase.from('repair_catalog_categories').update({ name: catName.trim() }).eq('id', editingCat.id);
    } else {
      await supabase.from('repair_catalog_categories').insert({ name: catName.trim(), sort_order: categories.length });
    }
    setCatDialogOpen(false);
    setCatName('');
    setEditingCat(null);
    fetchData();
    toast({ title: editingCat ? 'Categoría actualizada' : 'Categoría creada' });
  };

  // Item CRUD
  const openItemDialog = (item?: RepairCatalogItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        name: item.name, owner_friendly_name: item.owner_friendly_name ?? '',
        category_id: item.category_id, description: item.description ?? '',
        unit: item.unit, pricing_type: item.pricing_type, base_price: String(item.base_price),
        currency: item.currency, market: item.market ?? '', internal_notes: item.internal_notes ?? '',
        is_active: item.is_active,
      });
    } else {
      setEditingItem(null);
      setItemForm({
        name: '', owner_friendly_name: '', category_id: categories[0]?.id ?? '',
        description: '', unit: 'unit', pricing_type: 'fixed', base_price: '0',
        currency: 'MXN', market: '', internal_notes: '', is_active: true,
      });
    }
    setItemDialogOpen(true);
  };

  const saveItem = async () => {
    if (!itemForm.name.trim() || !itemForm.category_id) {
      toast({ title: 'Nombre y categoría son requeridos', variant: 'destructive' });
      return;
    }
    const payload = {
      name: itemForm.name.trim(),
      owner_friendly_name: itemForm.owner_friendly_name.trim() || null,
      category_id: itemForm.category_id,
      description: itemForm.description.trim() || null,
      unit: itemForm.unit,
      pricing_type: itemForm.pricing_type,
      base_price: parseFloat(itemForm.base_price) || 0,
      currency: itemForm.currency,
      market: itemForm.market.trim() || null,
      internal_notes: itemForm.internal_notes.trim() || null,
      is_active: itemForm.is_active,
      updated_by: profile?.id,
    };
    if (editingItem) {
      await supabase.from('repair_catalog_items').update(payload).eq('id', editingItem.id);
    } else {
      await supabase.from('repair_catalog_items').insert({ ...payload, created_by: profile?.id });
    }
    setItemDialogOpen(false);
    fetchData();
    toast({ title: editingItem ? 'Reparación actualizada' : 'Reparación creada' });
  };

  const toggleItemActive = async (item: RepairCatalogItem) => {
    await supabase.from('repair_catalog_items').update({ is_active: !item.is_active, updated_by: profile?.id }).eq('id', item.id);
    fetchData();
  };

  // Filtered items
  const filtered = items.filter((i) => {
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !(i.owner_friendly_name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory !== 'all' && i.category_id !== filterCategory) return false;
    if (filterActive === 'active' && !i.is_active) return false;
    if (filterActive === 'inactive' && i.is_active) return false;
    return true;
  });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h2">Catálogo de Reparaciones</h1>
            <p className="text-caption text-muted-foreground">{items.length} reparaciones · {categories.length} categorías</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => { setEditingCat(null); setCatName(''); }}>
                  <Tag className="mr-1 h-3.5 w-3.5" /> Categoría
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingCat ? 'Editar' : 'Nueva'} Categoría</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Label>Nombre</Label>
                  <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ej: Plomería" />
                  {/* List existing categories for quick edit */}
                  <div className="border-t pt-3 space-y-1 max-h-48 overflow-y-auto">
                    <p className="text-caption text-muted-foreground mb-1">Categorías existentes</p>
                    {categories.map((c) => (
                      <div key={c.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50">
                        <span className="text-body">{c.name}</span>
                        <Button variant="ghost" size="sm" onClick={() => { setEditingCat(c); setCatName(c.name); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={saveCat}>{editingCat ? 'Actualizar' : 'Crear'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button size="sm" onClick={() => openItemDialog()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Reparación
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterActive} onValueChange={setFilterActive}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Items table */}
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : (
          <Card className="border-0 ring-1 ring-border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-body">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 text-caption font-medium text-muted-foreground">Nombre</th>
                      <th className="text-left p-3 text-caption font-medium text-muted-foreground">Nombre propietario</th>
                      <th className="text-left p-3 text-caption font-medium text-muted-foreground">Categoría</th>
                      <th className="text-left p-3 text-caption font-medium text-muted-foreground">Unidad</th>
                      <th className="text-left p-3 text-caption font-medium text-muted-foreground">Tipo precio</th>
                      <th className="text-right p-3 text-caption font-medium text-muted-foreground">Precio base</th>
                      <th className="text-center p-3 text-caption font-medium text-muted-foreground">Activo</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={item.id} className={cn('border-b last:border-0 hover:bg-muted/20 transition-colors', !item.is_active && 'opacity-50')}>
                        <td className="p-3 font-medium">{item.name}</td>
                        <td className="p-3 text-muted-foreground">{item.owner_friendly_name ?? '—'}</td>
                        <td className="p-3">
                          <Badge variant="secondary" className="text-tiny">{item.category?.name ?? '—'}</Badge>
                        </td>
                        <td className="p-3">{item.unit}</td>
                        <td className="p-3">{PRICING_TYPES.find((p) => p.value === item.pricing_type)?.label ?? item.pricing_type}</td>
                        <td className="p-3 text-right font-mono">${Number(item.base_price).toFixed(2)}</td>
                        <td className="p-3 text-center">
                          <Switch checked={item.is_active} onCheckedChange={() => toggleItemActive(item)} />
                        </td>
                        <td className="p-3">
                          <Button variant="ghost" size="sm" onClick={() => openItemDialog(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No se encontraron reparaciones</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Item Dialog */}
        <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {editingItem ? 'Editar' : 'Nueva'} Reparación
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label>Nombre interno *</Label>
                <Input value={itemForm.name} onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Nombre para propietario</Label>
                <Input value={itemForm.owner_friendly_name} onChange={(e) => setItemForm((p) => ({ ...p, owner_friendly_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Categoría *</Label>
                <Select value={itemForm.category_id} onValueChange={(v) => setItemForm((p) => ({ ...p, category_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea value={itemForm.description} onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Unidad</Label>
                  <Select value={itemForm.unit} onValueChange={(v) => setItemForm((p) => ({ ...p, unit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de precio</Label>
                  <Select value={itemForm.pricing_type} onValueChange={(v) => setItemForm((p) => ({ ...p, pricing_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRICING_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Precio base</Label>
                  <Input type="number" step="0.01" value={itemForm.base_price} onChange={(e) => setItemForm((p) => ({ ...p, base_price: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Moneda</Label>
                  <Select value={itemForm.currency} onValueChange={(v) => setItemForm((p) => ({ ...p, currency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MXN">MXN</SelectItem>
                      <SelectItem value="CLP">CLP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Mercado</Label>
                <Select value={itemForm.market || 'none'} onValueChange={(v) => setItemForm((p) => ({ ...p, market: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar mercado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin mercado</SelectItem>
                    <SelectItem value="MX">MX</SelectItem>
                    <SelectItem value="CL">CL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notas internas</Label>
                <Textarea value={itemForm.internal_notes} onChange={(e) => setItemForm((p) => ({ ...p, internal_notes: e.target.value }))} rows={2} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={itemForm.is_active} onCheckedChange={(v) => setItemForm((p) => ({ ...p, is_active: v }))} />
                <Label>Activo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setItemDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveItem}>{editingItem ? 'Actualizar' : 'Crear'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
