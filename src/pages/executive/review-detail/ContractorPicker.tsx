import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCurrency } from './helpers';

interface ContractorPickerProps {
  contractors: any[];
  selectedContractorId: string | null;
  onContractorChange: (id: string) => void;
  contractorTotal: number;
  utility: number;
}

export function ContractorPicker({
  contractors, selectedContractorId, onContractorChange, contractorTotal, utility,
}: ContractorPickerProps) {
  const selected = contractors.find(c => c.id === selectedContractorId);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground hidden sm:inline">Contratista activo:</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs max-w-[200px]">
            {!selectedContractorId && (
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--status-regular))] mr-1.5 shrink-0" aria-hidden />
            )}
            <span className="truncate">
              {selectedContractorId ? selected?.name ?? 'Contratista' : 'Asignar contratista'}
            </span>
            <ChevronDown className="ml-0.5 h-3 w-3 opacity-60 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Contratista activo</Label>
            <p className="text-tiny text-muted-foreground">Define los costos base del presupuesto.</p>
            <Select value={selectedContractorId ?? 'none'} onValueChange={onContractorChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin seleccionar</SelectItem>
                {contractors.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.country})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedContractorId && contractorTotal > 0 && (
            <div className="space-y-1 pt-2 border-t border-border/70 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Costo contratista</span>
                <span className="font-mono font-medium">{fmtCurrency(contractorTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Utilidad</span>
                <span className={cn('font-mono font-medium', utility >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]')}>
                  {fmtCurrency(utility)}
                </span>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
