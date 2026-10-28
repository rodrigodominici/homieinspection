import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { RepairCatalogItem } from '@/lib/types';

interface Props {
  onAddPending: (title: string, quantity: number) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  items: RepairCatalogItem[];
  onSelect: (item: RepairCatalogItem) => void;
}

export function RepairCatalogSheet({ open, onOpenChange, search, onSearchChange, items, onSelect, onAddPending }: Props) {
  const [pending, setPending] = useState(false);
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savePending = async () => {
    setSaving(true); setError('');
    try { await onAddPending(title, quantity); setPending(false); setTitle(''); setQuantity(1); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setSaving(false); }
  };
  const filtered = items.filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.owner_friendly_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Catálogo de Reparaciones</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          <Button variant="outline" className="w-full" onClick={() => setPending(!pending)}>Agregar partida por cotizar</Button>
          {pending && <div className="space-y-3 border-b pb-4">
            <Label htmlFor="pending-title">Descripción del trabajo</Label>
            <Input id="pending-title" value={title} onChange={e => setTitle(e.target.value)} />
            <Label htmlFor="pending-quantity">Cantidad</Label>
            <Input id="pending-quantity" type="number" min="0.01" step="any" value={quantity} onChange={e => setQuantity(Number(e.target.value))} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button disabled={saving || !title.trim() || quantity <= 0} onClick={savePending}>{saving ? 'Guardando…' : 'Guardar partida por cotizar'}</Button>
          </div>}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar reparación..." value={search}
              onChange={(e) => onSearchChange(e.target.value)} className="pl-9" />
          </div>
          <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
            {filtered.map((item) => (
              <button key={item.id} onClick={() => onSelect(item)}
                className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors space-y-1">
                <p className="text-caption font-medium">{item.name}</p>
                {item.owner_friendly_name && <p className="text-tiny text-muted-foreground">{item.owner_friendly_name}</p>}
                <div className="flex items-center gap-2 text-tiny text-muted-foreground">
                  <Badge variant="secondary" className="text-tiny">{item.category?.name}</Badge>
                  <span className="font-mono">${Number(item.base_price).toFixed(2)} / {item.unit}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-center text-muted-foreground text-caption py-8">No se encontraron</p>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
