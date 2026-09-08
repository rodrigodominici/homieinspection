/** Selector de país global, montado en la barra superior de Admin y Ejecutivo. */
import { Globe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MARKET_OPTIONS } from '@/lib/markets';
import { useMarket } from '@/contexts/MarketContext';

export default function MarketSwitcher() {
  const { market, setMarket } = useMarket();

  return (
    <Select value={market} onValueChange={setMarket}>
      <SelectTrigger
        aria-label="País"
        className="h-9 w-[160px] rounded-lg bg-card text-caption"
      >
        <Globe className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue placeholder="País" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los países</SelectItem>
        {MARKET_OPTIONS.map((m) => (
          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
