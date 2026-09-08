/** Selector de país global, montado en la barra superior de la app. */
import { Globe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { marketLabel } from '@/lib/markets';
import { useMarket } from '@/contexts/MarketContext';

export default function MarketSwitcher() {
  const { market, setMarket, availableMarkets, canSwitch, canSeeAll } = useMarket();

  // Un solo país asignado: chip de solo lectura, sin posibilidad de cambio.
  if (!canSwitch) {
    return (
      <div className="flex h-9 items-center gap-1.5 rounded-lg bg-card px-3 text-caption text-muted-foreground ring-1 ring-border/60">
        <Globe className="h-3.5 w-3.5" />
        {marketLabel(availableMarkets[0] ?? market)}
      </div>
    );
  }

  return (
    <Select value={market || undefined} onValueChange={setMarket}>
      <SelectTrigger aria-label="País" className="h-9 w-[160px] rounded-lg bg-card text-caption">
        <Globe className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue placeholder="País" />
      </SelectTrigger>
      <SelectContent>
        {canSeeAll && <SelectItem value="all">Todos los países</SelectItem>}
        {availableMarkets.map((m) => (
          <SelectItem key={m} value={m}>{marketLabel(m)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
