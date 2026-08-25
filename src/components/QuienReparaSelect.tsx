import { useState } from 'react';
import { Wrench } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { QUIEN_REPARA_LABELS, QUIEN_REPARA_VALUES, type QuienRepara } from '@/lib/quien-repara';

/**
 * Editable control for the inspection-level `quien_repara` flag.
 * Only rendered for roles allowed to edit (executive / admin).
 */
export default function QuienReparaSelect({
  inspectionId,
  value,
  onSaved,
  className,
}: {
  inspectionId: string;
  value: string | null | undefined;
  onSaved?: (next: QuienRepara | null) => void;
  className?: string;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<string | null>(value ?? null);

  const handleChange = async (next: string) => {
    const parsed = next === 'undefined' ? null : (next as QuienRepara);
    const previous = local;
    setLocal(parsed);
    setSaving(true);
    const { error } = await supabase
      .from('inspections')
      .update({ quien_repara: parsed })
      .eq('id', inspectionId);
    setSaving(false);
    if (error) {
      setLocal(previous);
      toast({ title: 'No se pudo guardar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Actualizado', description: '¿Quién repara? guardado.' });
    onSaved?.(parsed);
  };

  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight mb-1 flex items-center gap-1">
        <Wrench className="h-3 w-3" /> ¿Quién repara?
      </p>
      <Select value={local ?? 'undefined'} onValueChange={handleChange} disabled={saving}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Sin definir" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="undefined">Sin definir</SelectItem>
          {QUIEN_REPARA_VALUES.map((v) => (
            <SelectItem key={v} value={v}>{QUIEN_REPARA_LABELS[v]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
