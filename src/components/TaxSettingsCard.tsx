import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Percent, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { fetchAllTaxConfigs, invalidateTaxCache, type MarketTaxSettings } from '@/lib/tax';
import { marketLabel } from '@/lib/markets';

export function TaxSettingsCard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<MarketTaxSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMarket, setSavingMarket] = useState<string | null>(null);

  useEffect(() => {
    fetchAllTaxConfigs().then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, []);

  const update = (market: string, patch: Partial<MarketTaxSettings>) => {
    setRows((prev) => prev.map((r) => (r.market === market ? { ...r, ...patch } : r)));
  };

  const save = async (market: string) => {
    const row = rows.find((r) => r.market === market);
    if (!row) return;
    setSavingMarket(market);
    const { error } = await supabase
      .from('market_tax_settings' as any)
      .update({
        vat_enabled: row.vat_enabled,
        vat_percentage: Number(row.vat_percentage) || 0,
        vat_label: row.vat_label || 'IVA',
      })
      .eq('market', market);
    setSavingMarket(null);
    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
      return;
    }
    invalidateTaxCache(market);
    toast({ title: `Configuración guardada — ${marketLabel(market)}` });
  };

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-primary" />
          <CardTitle className="text-body-lg">Impuestos por mercado</CardTitle>
        </div>
        <CardDescription>
          IVA/VAT aplicado al total de cotizaciones y reportes públicos. Se calcula sobre el subtotal visible. No se aplica a totales operativos internos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-caption text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mercado</TableHead>
                <TableHead className="w-24">Activo</TableHead>
                <TableHead className="w-32">Porcentaje</TableHead>
                <TableHead className="w-32">Etiqueta</TableHead>
                <TableHead className="w-20">Moneda</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.market}>
                  <TableCell className="font-medium">{marketLabel(row.market)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={row.vat_enabled}
                      onCheckedChange={(v) => update(row.market, { vat_enabled: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={row.vat_percentage}
                        onChange={(e) => update(row.market, { vat_percentage: Number(e.target.value) })}
                        className="h-8 w-20"
                        disabled={!row.vat_enabled}
                      />
                      <span className="text-caption text-muted-foreground">%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.vat_label}
                      onChange={(e) => update(row.market, { vat_label: e.target.value })}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="text-caption text-muted-foreground">{row.currency}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => save(row.market)}
                      disabled={savingMarket === row.market}
                    >
                      {savingMarket === row.market ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
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
