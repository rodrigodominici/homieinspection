import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import ExecutiveLayout from '@/components/ExecutiveLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, BookOpen } from 'lucide-react';
import type { RepairCatalogCategory, RepairCatalogItem, Contractor } from '@/lib/types';

interface ContractorPrice {
  repair_catalog_item_id: string;
  contractor_id: string;
  price: number;
}

const fmt = (n: number) => `$${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`;

export default function ExecutiveRepairCatalog() {
  const [categories, setCategories] = useState<RepairCatalogCategory[]>([]);
  const [items, setItems] = useState<RepairCatalogItem[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [priceMatrix, setPriceMatrix] = useState<Map<string, Map<string, number>>>(new Map());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    (async () => {
      const [{ data: cats }, { data: its }, { data: conts }, { data: prices }] = await Promise.all([
        supabase.from('repair_catalog_categories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('repair_catalog_items').select('*, repair_catalog_categories(*)').eq('is_active', true).order('name'),
        supabase.from('contractors').select('*').eq('is_active', true).order('name'),
        supabase.from('repair_catalog_item_contractor_prices').select('repair_catalog_item_id, contractor_id, price'),
      ]);
      setCategories((cats ?? []) as unknown as RepairCatalogCategory[]);
      setItems((its ?? []).map((i: any) => ({ ...i, category: i.repair_catalog_categories })) as unknown as RepairCatalogItem[]);
      setContractors((conts ?? []) as unknown as Contractor[]);

      const matrix = new Map<string, Map<string, number>>();
      for (const p of (prices ?? []) as unknown as ContractorPrice[]) {
        if (!matrix.has(p.repair_catalog_item_id)) matrix.set(p.repair_catalog_item_id, new Map());
        matrix.get(p.repair_catalog_item_id)!.set(p.contractor_id, Number(p.price));
      }
      setPriceMatrix(matrix);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filterCategory !== 'all' && it.category_id !== filterCategory) return false;
      if (!s) return true;
      return (
        it.name.toLowerCase().includes(s) ||
        (it.owner_friendly_name ?? '').toLowerCase().includes(s) ||
        (it.description ?? '').toLowerCase().includes(s)
      );
    });
  }, [items, search, filterCategory]);

  return (
    <ExecutiveLayout>
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-h3 font-semibold leading-tight">Catálogo de reparaciones</h1>
            <p className="text-caption text-muted-foreground">Vista de solo lectura · Precios por contratista</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
            <CardDescription>Buscar por nombre o filtrar por categoría.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar reparación..."
                  className="pl-9"
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Matriz de precios</CardTitle>
            <CardDescription>
              {loading ? 'Cargando…' : `${filtered.length} reparaciones · ${contractors.length} contratistas`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground text-caption">Sin resultados</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[240px] sticky left-0 bg-card z-10">Reparación</TableHead>
                      <TableHead className="min-w-[140px]">Categoría</TableHead>
                      <TableHead className="text-right min-w-[100px]">Base</TableHead>
                      {contractors.map((c) => (
                        <TableHead key={c.id} className="text-right min-w-[110px]">{c.name}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((it) => {
                      const row = priceMatrix.get(it.id);
                      return (
                        <TableRow key={it.id}>
                          <TableCell className="sticky left-0 bg-card z-10">
                            <div className="font-medium">{it.name}</div>
                            {it.owner_friendly_name && (
                              <div className="text-tiny text-muted-foreground">{it.owner_friendly_name}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-tiny font-normal">
                              {(it as any).category?.name ?? '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(Number(it.base_price))}</TableCell>
                          {contractors.map((c) => {
                            const price = row?.get(c.id);
                            return (
                              <TableCell key={c.id} className="text-right font-mono text-sm">
                                {price != null ? fmt(price) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ExecutiveLayout>
  );
}
