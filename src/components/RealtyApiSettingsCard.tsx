import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Globe, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { marketLabel } from '@/lib/markets';

interface Row { market: string; base_url: string; business_unit: string | null; is_active: boolean }

export function RealtyApiSettingsCard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('market_realty_api_settings' as any).select('*').order('market').then(({ data }) => {
      setRows((data as unknown as Row[]) ?? []);
      setLoading(false);
    });
  }, []);

  const update = (m: string, p: Partial<Row>) => setRows((prev) => prev.map((r) => (r.market === m ? { ...r, ...p } : r)));

  const save = async (m: string) => {
    const row = rows.find((r) => r.market === m);
    if (!row) return;
    const url = row.base_url.trim();
    if (!/^https:\/\/\S+$/.test(url)) {
      toast({ title: 'URL inválida', description: 'Debe comenzar con https://', variant: 'destructive' });
      return;
    }
    setSaving(m);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('market_realty_api_settings' as any)
      .update({ base_url: url, business_unit: row.business_unit?.trim() || null, is_active: row.is_active, updated_by: u.user?.id })
      .eq('market', m);
    setSaving(null);
    if (error) return toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    toast({ title: `Consulta de inmuebles guardada — ${marketLabel(m)}` });
  };

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <CardTitle className="text-body-lg">Consulta de inmuebles por país</CardTitle>
        </div>
        <CardDescription>
          Dirección del servicio de inmuebles de Homie que se usa para traer los datos del inmueble según el país. Al ID (RE…) se le agrega al final de la dirección.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-caption text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">País</TableHead>
                <TableHead className="w-20">Activo</TableHead>
                <TableHead>Dirección (URL)</TableHead>
                <TableHead className="w-48">Unidad de negocio</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.market}>
                  <TableCell className="font-medium">{marketLabel(r.market)}</TableCell>
                  <TableCell><Switch checked={r.is_active} onCheckedChange={(v) => update(r.market, { is_active: v })} /></TableCell>
                  <TableCell><Input className="h-8 font-mono text-caption" value={r.base_url} onChange={(e) => update(r.market, { base_url: e.target.value })} /></TableCell>
                  <TableCell><Input className="h-8" value={r.business_unit ?? ''} onChange={(e) => update(r.market, { business_unit: e.target.value })} /></TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => save(r.market)} disabled={saving === r.market}>
                      {saving === r.market ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
