import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import type { DateFilterState, DateField, DateRange } from '@/shared/lib/date-range-filter';

export function DateRangeFilter({ value, onChange }: { value: DateFilterState; onChange: (v: DateFilterState) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.field} onValueChange={(v) => onChange({ ...value, field: v as DateField })}>
        <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="scheduled">Fecha programada</SelectItem>
          <SelectItem value="created">Fecha de creación</SelectItem>
          <SelectItem value="keys">Recolección de llaves</SelectItem>
        </SelectContent>
      </Select>
      <Select value={value.range} onValueChange={(v) => onChange({ ...value, range: v as DateRange })}>
        <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las fechas</SelectItem>
          <SelectItem value="today">Hoy</SelectItem>
          <SelectItem value="week">Esta semana</SelectItem>
          <SelectItem value="month">Este mes</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>
      {value.range === 'custom' && (
        <>
          <Input type="date" className="h-9 w-[150px]" value={value.from ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value || undefined })} aria-label="Desde" />
          <Input type="date" className="h-9 w-[150px]" value={value.to ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value || undefined })} aria-label="Hasta" />
        </>
      )}
      <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5"
        onClick={() => onChange({ ...value, order: value.order === 'asc' ? 'desc' : 'asc' })}>
        {value.order === 'asc' ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownWideNarrow className="h-4 w-4" />}
        {value.order === 'asc' ? 'Más antiguas' : 'Más recientes'}
      </Button>
    </div>
  );
}
