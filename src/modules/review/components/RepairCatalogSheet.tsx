import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import type { RepairCatalogItem } from '@/lib/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  items: RepairCatalogItem[];
  onSelect: (item: RepairCatalogItem) => void;
}

export function RepairCatalogSheet({ open, onOpenChange, search, onSearchChange, items, onSelect }: Props) {
  const filtered = items.filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.owner_friendly_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Catálogo de Reparaciones</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
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
