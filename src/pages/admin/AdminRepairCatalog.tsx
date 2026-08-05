import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import type { RepairCatalogCategory, RepairCatalogItem, Contractor } from '@/lib/types';
import { Plus, Pencil, Search, Tag, Package, HardHat, Trash2, DollarSign, Grid3X3, Check, Loader2, AlertCircle, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRICING_TYPES = [
  { value: 'fixed', label: 'Precio fijo' },
  { value: 'per_unit', label: 'Por unidad' },
  { value: 'per_m2', label: 'Por m²' },
];

const UNIT_OPTIONS = ['unit', 'ml', 'm2', 'pieza', 'servicio', 'hora'];

interface ContractorPrice {
  id: string;
  repair_catalog_item_id: string;
  contractor_id: string;
  price: number;
  currency: string;
}

// ── Matrix Cell with debounced save + feedback ───────────────
type CellSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function MatrixCell({
  value,
  onSave,
  className,
}: {
  value: number | null;
  onSave: (v: number) => Promise<void>;
  className?: string;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '');
  const [status, setStatus] = useState<CellSaveStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const fadeRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync from parent when value changes externally
  useEffect(() => {
    setLocal(value != null ? String(value) : '');
  }, [value]);

  const commitSave = useCallback(async (val: string) => {
    const num = parseFloat(val) || 0;
    if (num === (value ?? 0)) return;
    setStatus('saving');
    try {
      await onSave(num);
      setStatus('saved');
      fadeRef.current = setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
      fadeRef.current = setTimeout(() => setStatus('idle'), 3000);
    }
  }, [value, onSave]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocal(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commitSave(val), 500);
  };

  const handleBlur = () => {
    clearTimeout(timerRef.current);
    commitSave(local);
  };

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    clearTimeout(fadeRef.current);
  }, []);

  return (
    <div className={cn('relative flex items-center', className)}>
      <Input
        type="number"
        step="0.01"
        className="w-24 h-8 text-right text-xs font-mono pr-6"
        value={local}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
        {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {status === 'saved' && <Check className="h-3 w-3 text-green-600" />}
        {status === 'error' && <AlertCircle className="h-3 w-3 text-destructive" />}
      </span>
    </div>
  );
}

// ── Margin display ───────────────────────────────────────────
function MarginDisplay({ basePrice, contractorPrice }: { basePrice: number; contractorPrice: number | null }) {
  if (contractorPrice == null) return <span className="text-muted-foreground text-xs">—</span>;
  const amount = basePrice - contractorPrice;
  const pct = basePrice > 0 ? (amount / basePrice) * 100 : 0;
  const positive = amount >= 0;
  return (
    <div className={cn('text-xs leading-tight font-mono', positive ? 'text-green-700 dark:text-green-400' : 'text-destructive')}>
      <div>${Math.abs(amount).toFixed(0)}</div>
      <div className="text-[10px] opacity-75">{positive ? '+' : '-'}{Math.abs(pct).toFixed(1)}%</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
export default function AdminRepairCatalog() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [categories, setCategories] = useState<RepairCatalogCategory[]>([]);
  const [items, setItems] = useState<RepairCatalogItem[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (shared across tabs)
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
  const [contractorPrices, setContractorPrices] = useState<ContractorPrice[]>([]);
  const [newPriceContractorId, setNewPriceContractorId] = useState('');
  const [newPriceValue, setNewPriceValue] = useState('');

  // Contractor management
  const [newContractorName, setNewContractorName] = useState('');
  const [newContractorCountry, setNewContractorCountry] = useState('CL');
  const [loadingContractors, setLoadingContractors] = useState(true);

  // Duplicate contractor dialog
  const [dupSource, setDupSource] = useState<Contractor | null>(null);
  const [dupName, setDupName] = useState('');
  const [dupCountry, setDupCountry] = useState('CL');
  const [dupCopyPrices, setDupCopyPrices] = useState(true);
  const [dupSaving, setDupSaving] = useState(false);

  // Matrix pricing state: Map<item_id, Map<contractor_id, ContractorPrice>>
  const [priceMatrix, setPriceMatrix] = useState<Map<string, Map<string, ContractorPrice>>>(new Map());

  const fetchData = async () => {
    const [{ data: cats }, { data: its }, { data: conts }, { data: allPrices }] = await Promise.all([
      supabase.from('repair_catalog_categories').select('*').order('sort_order'),
      supabase.from('repair_catalog_items').select('*, repair_catalog_categories(*)').order('name'),
      supabase.from('contractors').select('*').order('name'),
      supabase.from('repair_catalog_item_contractor_prices').select('*'),
    ]);
    setCategories((cats ?? []) as unknown as RepairCatalogCategory[]);
    setItems((its ?? []).map((i: any) => ({ ...i, category: i.repair_catalog_categories })) as unknown as RepairCatalogItem[]);
    setContractors((conts ?? []) as unknown as Contractor[]);

    // Index prices into matrix map
    const matrix = new Map<string, Map<string, ContractorPrice>>();
    for (const p of (allPrices ?? []) as unknown as ContractorPrice[]) {
      if (!matrix.has(p.repair_catalog_item_id)) matrix.set(p.repair_catalog_item_id, new Map());
      matrix.get(p.repair_catalog_item_id)!.set(p.contractor_id, p);
    }
    setPriceMatrix(matrix);

    setLoading(false);
    setLoadingContractors(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Category CRUD ──────────────────────────────────────────
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

  // ── Item CRUD ──────────────────────────────────────────────
  const openItemDialog = async (item?: RepairCatalogItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        name: item.name, owner_friendly_name: item.owner_friendly_name ?? '',
        category_id: item.category_id, description: item.description ?? '',
        unit: item.unit, pricing_type: item.pricing_type, base_price: String(item.base_price),
        currency: item.currency, market: item.market ?? '', internal_notes: item.internal_notes ?? '',
        is_active: item.is_active,
      });
      const { data: prices } = await supabase
        .from('repair_catalog_item_contractor_prices')
        .select('*')
        .eq('repair_catalog_item_id', item.id);
      setContractorPrices((prices ?? []) as unknown as ContractorPrice[]);
    } else {
      setEditingItem(null);
      setItemForm({
        name: '', owner_friendly_name: '', category_id: categories[0]?.id ?? '',
        description: '', unit: 'unit', pricing_type: 'fixed', base_price: '0',
        currency: 'MXN', market: '', internal_notes: '', is_active: true,
      });
      setContractorPrices([]);
    }
    setNewPriceContractorId('');
    setNewPriceValue('');
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

  // ── Contractor pricing within item dialog ──────────────────
  const addContractorPrice = async () => {
    if (!editingItem || !newPriceContractorId || !newPriceValue) return;
    const { error } = await supabase.from('repair_catalog_item_contractor_prices').insert({
      repair_catalog_item_id: editingItem.id,
      contractor_id: newPriceContractorId,
      price: parseFloat(newPriceValue) || 0,
      currency: itemForm.currency,
    });
    if (error) {
      toast({ title: 'Error', description: error.message.includes('unique') ? 'Este contratista ya tiene un precio asignado' : error.message, variant: 'destructive' });
      return;
    }
    const { data } = await supabase.from('repair_catalog_item_contractor_prices').select('*').eq('repair_catalog_item_id', editingItem.id);
    setContractorPrices((data ?? []) as unknown as ContractorPrice[]);
    setNewPriceContractorId('');
    setNewPriceValue('');
    toast({ title: 'Precio de contratista agregado' });
  };

  const updateContractorPrice = async (priceId: string, newPrice: number) => {
    await supabase.from('repair_catalog_item_contractor_prices').update({ price: newPrice }).eq('id', priceId);
    if (editingItem) {
      const { data } = await supabase.from('repair_catalog_item_contractor_prices').select('*').eq('repair_catalog_item_id', editingItem.id);
      setContractorPrices((data ?? []) as unknown as ContractorPrice[]);
    }
  };

  const deleteContractorPrice = async (priceId: string) => {
    await supabase.from('repair_catalog_item_contractor_prices').delete().eq('id', priceId);
    if (editingItem) {
      const { data } = await supabase.from('repair_catalog_item_contractor_prices').select('*').eq('repair_catalog_item_id', editingItem.id);
      setContractorPrices((data ?? []) as unknown as ContractorPrice[]);
    }
    toast({ title: 'Precio eliminado' });
  };

  // ── Contractor management ──────────────────────────────────
  const addContractor = async () => {
    const name = newContractorName.trim();
    if (!name) return;
    const { error } = await supabase.from('contractors').insert({ name, country: newContractorCountry });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewContractorName('');
    toast({ title: 'Contratista agregado' });
    fetchData();
  };

  const toggleContractorActive = async (id: string, current: boolean) => {
    await supabase.from('contractors').update({ is_active: !current }).eq('id', id);
    fetchData();
  };

  const deleteContractor = async (id: string) => {
    await supabase.from('contractors').delete().eq('id', id);
    toast({ title: 'Contratista eliminado' });
    fetchData();
  };

  // ── Duplicate contractor (with its price matrix) ───────────
  const countPricesFor = (contractorId: string) => {
    let n = 0;
    for (const itemMap of priceMatrix.values()) if (itemMap.has(contractorId)) n++;
    return n;
  };

  const openDuplicate = (c: Contractor) => {
    setDupSource(c);
    setDupName(`Copia de ${c.name}`);
    setDupCountry(c.country);
    setDupCopyPrices(true);
  };

  const dupNameTrimmed = dupName.trim();
  const dupNameExists = contractors.some(
    (c) => c.name.trim().toLowerCase() === dupNameTrimmed.toLowerCase(),
  );

  const duplicateContractor = async () => {
    if (!dupSource || !dupNameTrimmed || dupNameExists) return;
    setDupSaving(true);
    try {
      const { data: created, error: createErr } = await supabase
        .from('contractors')
        .insert({ name: dupNameTrimmed, country: dupCountry, is_active: true })
        .select('id')
        .single();
      if (createErr || !created) throw createErr ?? new Error('insert_failed');

      let copied = 0;
      if (dupCopyPrices) {
        const { data: srcPrices, error: readErr } = await supabase
          .from('repair_catalog_item_contractor_prices')
          .select('repair_catalog_item_id, price, currency')
          .eq('contractor_id', dupSource.id);
        if (readErr) throw readErr;

        const rows = (srcPrices ?? []).map((p: any) => ({
          repair_catalog_item_id: p.repair_catalog_item_id,
          contractor_id: created.id,
          price: p.price,
          currency: p.currency,
        }));
        if (rows.length > 0) {
          const { error: insErr } = await supabase
            .from('repair_catalog_item_contractor_prices')
            .insert(rows);
          if (insErr) {
            // Rollback: avoid leaving an empty duplicate behind.
            await supabase.from('contractors').delete().eq('id', created.id);
            throw insErr;
          }
        }
        copied = rows.length;
      }

      toast({
        title: 'Contratista duplicado',
        description: dupCopyPrices
          ? `${copied} precio${copied === 1 ? '' : 's'} de reparaciones copiado${copied === 1 ? '' : 's'}`
          : 'Sin copiar precios',
      });
      setDupSource(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error al duplicar', description: err?.message ?? String(err), variant: 'destructive' });
    } finally {
      setDupSaving(false);
    }
  };



  // ── Matrix save handlers ───────────────────────────────────
  const saveBasePrice = useCallback(async (itemId: string, newPrice: number) => {
    const { error } = await supabase.from('repair_catalog_items')
      .update({ base_price: newPrice, updated_by: profile?.id })
      .eq('id', itemId);
    if (error) throw error;
    // Optimistic local update
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, base_price: newPrice } : i));
  }, [profile?.id]);

  const saveMatrixContractorPrice = useCallback(async (itemId: string, contractorId: string, newPrice: number) => {
    const existing = priceMatrix.get(itemId)?.get(contractorId);
    if (existing) {
      const { error } = await supabase.from('repair_catalog_item_contractor_prices')
        .update({ price: newPrice })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const item = items.find(i => i.id === itemId);
      const { error } = await supabase.from('repair_catalog_item_contractor_prices')
        .insert({
          repair_catalog_item_id: itemId,
          contractor_id: contractorId,
          price: newPrice,
          currency: item?.currency ?? 'MXN',
        });
      if (error) throw error;
    }
    // Optimistic local update
    setPriceMatrix(prev => {
      const next = new Map(prev);
      if (!next.has(itemId)) next.set(itemId, new Map());
      const itemMap = new Map(next.get(itemId)!);
      itemMap.set(contractorId, {
        id: existing?.id ?? 'temp',
        repair_catalog_item_id: itemId,
        contractor_id: contractorId,
        price: newPrice,
        currency: items.find(i => i.id === itemId)?.currency ?? 'MXN',
        ...( existing ? { id: existing.id } : {}),
      });
      next.set(itemId, itemMap);
      return next;
    });
  }, [priceMatrix, items, profile?.id]);

  // ── Filtered items (shared) ────────────────────────────────
  const filtered = items.filter((i) => {
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !(i.owner_friendly_name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory !== 'all' && i.category_id !== filterCategory) return false;
    if (filterActive === 'active' && !i.is_active) return false;
    if (filterActive === 'inactive' && i.is_active) return false;
    return true;
  });

  const activeContractors = contractors.filter(c => c.is_active);

  // Contractors not yet priced for current item (dialog)
  const availableContractorsForPricing = contractors.filter(
    (c) => c.is_active && !contractorPrices.some((p) => p.contractor_id === c.id)
  );

  // ── Filter bar (reusable) ─────────────────────────────────
  const FilterBar = () => (
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
  );

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div>
          <h1 className="text-h2">Catálogo</h1>
          <p className="text-caption text-muted-foreground">Reparaciones, categorías y contratistas</p>
        </div>

        <Tabs defaultValue="repairs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="repairs" className="gap-1.5">
              <Package className="h-3.5 w-3.5" /> Reparaciones
            </TabsTrigger>
            <TabsTrigger value="matrix" className="gap-1.5">
              <Grid3X3 className="h-3.5 w-3.5" /> Matriz de Precios
            </TabsTrigger>
            <TabsTrigger value="contractors" className="gap-1.5">
              <HardHat className="h-3.5 w-3.5" /> Contratistas
            </TabsTrigger>
          </TabsList>

          {/* ── Repairs Tab ─────────────────────────────────── */}
          <TabsContent value="repairs" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-caption text-muted-foreground">{items.length} reparaciones · {categories.length} categorías</p>
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

            <FilterBar />

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
          </TabsContent>

          {/* ── Matrix Tab ──────────────────────────────────── */}
          <TabsContent value="matrix" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-caption text-muted-foreground">
                {filtered.length} reparaciones · {activeContractors.length} contratistas activos
              </p>
            </div>

            <FilterBar />

            {loading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
            ) : activeContractors.length === 0 ? (
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="p-8 text-center text-muted-foreground">
                  No hay contratistas activos. Agrégalos en la pestaña Contratistas.
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="p-0">
                  <TooltipProvider delayDuration={200}>
                    <div className="overflow-x-auto max-h-[70vh] overflow-y-auto relative">
                      <table className="w-full text-xs border-collapse" style={{ minWidth: `${300 + 200 + activeContractors.length * 200}px` }}>
                        <thead className="sticky top-0 z-20">
                          {/* Contractor group header */}
                          <tr className="bg-muted/60 border-b">
                            {/* Spacer for fixed cols */}
                            <th className="sticky left-0 z-30 bg-muted/60" style={{ minWidth: 180 }}></th>
                            <th className="sticky z-30 bg-muted/60" style={{ left: 180, minWidth: 120 }}></th>
                            <th colSpan={3} className="p-2 text-center text-caption font-semibold text-primary border-l border-r border-border/50 bg-primary/5">
                              Homie
                            </th>
                            {activeContractors.map((c, idx) => (
                              <th
                                key={c.id}
                                colSpan={2}
                                className={cn(
                                  'p-2 text-center text-caption font-semibold border-l border-border/50',
                                  idx % 2 === 0 ? 'bg-accent/30' : 'bg-accent/10'
                                )}
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="block truncate max-w-[160px] mx-auto">{c.name}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>{c.name} ({c.country})</TooltipContent>
                                </Tooltip>
                              </th>
                            ))}
                          </tr>
                          {/* Sub-header */}
                          <tr className="bg-muted/40 border-b">
                            <th className="sticky left-0 z-30 bg-muted/40 text-left p-2 font-medium text-muted-foreground" style={{ minWidth: 180 }}>
                              Reparación
                            </th>
                            <th className="sticky z-30 bg-muted/40 text-left p-2 font-medium text-muted-foreground" style={{ left: 180, minWidth: 120 }}>
                              Categoría
                            </th>
                            <th className="p-2 text-right font-medium text-muted-foreground border-l border-border/50" style={{ minWidth: 100 }}>
                              Base ($)
                            </th>
                            <th className="p-2 text-center font-medium text-muted-foreground" style={{ minWidth: 50 }}>Mon</th>
                            <th className="p-2 text-center font-medium text-muted-foreground border-r border-border/50" style={{ minWidth: 50 }}>Mkt</th>
                            {activeContractors.map((c, idx) => (
                              <th key={`${c.id}-sub`} colSpan={2} className={cn('border-l border-border/50', idx % 2 === 0 ? 'bg-accent/10' : 'bg-accent/5')}>
                                <div className="flex">
                                  <span className="flex-1 p-2 text-right font-medium text-muted-foreground" style={{ minWidth: 100 }}>Precio</span>
                                  <span className="flex-1 p-2 text-center font-medium text-muted-foreground" style={{ minWidth: 80 }}>Mg Homie</span>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((item) => {
                            const basePrice = Number(item.base_price) || 0;
                            const itemPrices = priceMatrix.get(item.id);
                            return (
                              <tr key={item.id} className={cn('border-b last:border-0 hover:bg-muted/10 transition-colors', !item.is_active && 'opacity-40')}>
                                <td className="sticky left-0 z-10 bg-background p-2 font-medium truncate" style={{ minWidth: 180, maxWidth: 220 }} title={item.name}>
                                  {item.name}
                                </td>
                                <td className="sticky z-10 bg-background p-2" style={{ left: 180, minWidth: 120 }}>
                                  <Badge variant="secondary" className="text-[10px]">{item.category?.name ?? '—'}</Badge>
                                </td>
                                <td className="p-2 border-l border-border/50">
                                  <MatrixCell
                                    value={basePrice}
                                    onSave={(v) => saveBasePrice(item.id, v)}
                                  />
                                </td>
                                <td className="p-2 text-center text-muted-foreground">{item.currency}</td>
                                <td className="p-2 text-center text-muted-foreground border-r border-border/50">{item.market ?? '—'}</td>
                                {activeContractors.map((c, idx) => {
                                  const cp = itemPrices?.get(c.id);
                                  return (
                                    <td key={c.id} colSpan={2} className={cn('border-l border-border/50', idx % 2 === 0 ? 'bg-accent/5' : '')}>
                                      <div className="flex items-center">
                                        <div className="flex-1 p-1">
                                          <MatrixCell
                                            value={cp?.price ?? null}
                                            onSave={(v) => saveMatrixContractorPrice(item.id, c.id, v)}
                                          />
                                        </div>
                                        <div className="flex-1 p-1 flex justify-center">
                                          <MarginDisplay basePrice={basePrice} contractorPrice={cp?.price ?? null} />
                                        </div>
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                          {filtered.length === 0 && (
                            <tr><td colSpan={5 + activeContractors.length * 2} className="p-8 text-center text-muted-foreground">No se encontraron reparaciones</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </TooltipProvider>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Contractors Tab ──────────────────────────────── */}
          <TabsContent value="contractors" className="space-y-4">
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-body-lg">Contratistas</CardTitle>
                <CardDescription>Gestiona los contratistas disponibles para asignación en presupuestos.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add form */}
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-tiny font-medium text-muted-foreground mb-1 block">Nombre</label>
                    <Input value={newContractorName} onChange={(e) => setNewContractorName(e.target.value)} placeholder="Nombre del contratista" />
                  </div>
                  <div className="w-28">
                    <label className="text-tiny font-medium text-muted-foreground mb-1 block">País</label>
                    <Select value={newContractorCountry} onValueChange={setNewContractorCountry}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CL">Chile</SelectItem>
                        <SelectItem value="MX">México</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={addContractor} disabled={!newContractorName.trim()}>
                    <Plus className="mr-1 h-4 w-4" /> Agregar
                  </Button>
                </div>

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
                        <TableHead className="w-24 text-right">Acciones</TableHead>
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
                            <Switch checked={c.is_active} onCheckedChange={() => toggleContractorActive(c.id, c.is_active)} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8"
                              title="Duplicar con sus precios" aria-label="Duplicar contratista"
                              onClick={() => openDuplicate(c)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>

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
          </TabsContent>
        </Tabs>

        {/* Item Dialog */}
        <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {editingItem ? 'Editar' : 'Nueva'} Reparación
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
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
                  <Label>Precio base (cliente)</Label>
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

              {/* Contractor Pricing Section (kept in dialog for reference) */}
              {editingItem && (
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-body-lg font-semibold">Precios por contratista</Label>
                  </div>
                  <p className="text-caption text-muted-foreground">
                    Para gestión masiva de precios, usa la pestaña <strong>Matriz de Precios</strong>.
                  </p>

                  {contractorPrices.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Contratista</TableHead>
                          <TableHead>País</TableHead>
                          <TableHead className="text-right">Precio contratista</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contractorPrices.map((cp) => {
                          const contractor = contractors.find((c) => c.id === cp.contractor_id);
                          return (
                            <TableRow key={cp.id}>
                              <TableCell className="font-medium">{contractor?.name ?? 'Desconocido'}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-tiny">{contractor?.country ?? '—'}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number" step="0.01" className="w-28 ml-auto text-right"
                                  defaultValue={cp.price}
                                  onBlur={(e) => {
                                    const v = parseFloat(e.target.value) || 0;
                                    if (v !== cp.price) updateContractorPrice(cp.id, v);
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => deleteContractorPrice(cp.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}

                  {availableContractorsForPricing.length > 0 && (
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className="text-tiny font-medium text-muted-foreground mb-1 block">Contratista</label>
                        <Select value={newPriceContractorId} onValueChange={setNewPriceContractorId}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar contratista" /></SelectTrigger>
                          <SelectContent>
                            {availableContractorsForPricing.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name} ({c.country})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32">
                        <label className="text-tiny font-medium text-muted-foreground mb-1 block">Precio</label>
                        <Input type="number" step="0.01" value={newPriceValue} onChange={(e) => setNewPriceValue(e.target.value)} placeholder="0" />
                      </div>
                      <Button size="sm" onClick={addContractorPrice} disabled={!newPriceContractorId || !newPriceValue}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
                      </Button>
                    </div>
                  )}

                  {availableContractorsForPricing.length === 0 && contractorPrices.length > 0 && (
                    <p className="text-caption text-muted-foreground">Todos los contratistas activos tienen precio asignado.</p>
                  )}

                  {contractors.filter(c => c.is_active).length === 0 && (
                    <p className="text-caption text-muted-foreground">No hay contratistas activos. Agrégalos en la pestaña Contratistas.</p>
                  )}
                </div>
              )}

              {!editingItem && (
                <p className="text-caption text-muted-foreground border-t pt-3">
                  Los precios por contratista se configuran después de crear la reparación.
                </p>
              )}
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
