import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Trash2, Plus, Search, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCurrency } from './helpers';
import { ContractorPicker } from './ContractorPicker';
import { OwnerFeedbackBadge, feedbackAccentClasses } from './OwnerFeedbackBadge';
import type { InspectionRepairItem, InspectionSection } from '@/lib/types';
import type { OwnerFeedbackEntry } from '@/modules/review/api/useOwnerFeedbackByRepair';

interface RepairsTableViewProps {
  sections: InspectionSection[];
  allRepairs: InspectionRepairItem[];
  contractors: Array<{ id: string; name: string; country: string }>;
  selectedContractorId: string | null;
  onContractorChange: (id: string) => void;
  contractorTotal: number;
  clientTotal: number;
  utility: number;
  budgetBreakdown: {
    ownerRequired: number; ownerOptional: number; ownerTotal: number;
    tenantRequired: number; tenantOptional: number; tenantTotal: number;
    grandTotal: number;
  };
  warrantyDeposit: number | null;
  depositDiff: number | null;
  onOpenCatalog: (sectionId: string) => void;
  onUpdateRepair: (id: string, field: string, value: any) => void;
  onDeleteRepair: (id: string) => void;
  feedbackByRepairId?: Map<string, OwnerFeedbackEntry>;
}

type PayerFilter = 'all' | 'owner' | 'tenant';
type NatureFilter = 'all' | 'required' | 'optional';

type FeedbackFilter = 'all' | 'pending';

export function RepairsTableView({
  sections, allRepairs, contractors, selectedContractorId, onContractorChange,
  contractorTotal, clientTotal, utility, budgetBreakdown, warrantyDeposit, depositDiff,
  onOpenCatalog, onUpdateRepair, onDeleteRepair, feedbackByRepairId,
}: RepairsTableViewProps) {
  const [payerFilter, setPayerFilter] = useState<PayerFilter>('all');
  const [natureFilter, setNatureFilter] = useState<NatureFilter>('all');
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [addToSection, setAddToSection] = useState<string>(sections[0]?.id ?? '');

  const sectionTitle = (id: string) =>
    sections.find((s) => s.id === id)?.section_title ?? '—';

  const pendingFeedbackCount = useMemo(() => {
    if (!feedbackByRepairId || feedbackByRepairId.size === 0) return 0;
    let n = 0;
    for (const r of allRepairs) {
      const fb = feedbackByRepairId.get(r.id);
      if (fb && fb.decision !== 'accepted') n += 1;
    }
    return n;
  }, [allRepairs, feedbackByRepairId]);

  const filtered = useMemo(() => {
    return allRepairs.filter((r) => {
      if (payerFilter !== 'all' && r.payer_role !== payerFilter) return false;
      if (natureFilter !== 'all' && r.payment_nature !== natureFilter) return false;
      if (sectionFilter !== 'all' && r.inspection_section_id !== sectionFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.title_snapshot} ${r.category_snapshot ?? ''} ${sectionTitle(r.inspection_section_id)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRepairs, payerFilter, natureFilter, sectionFilter, search, sections]);

  const filteredTotal = filtered.reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const hasContractor = !!selectedContractorId;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <div>
        <h2 className="text-h3 font-semibold tracking-tight">Reparaciones</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Vista consolidada de todas las reparaciones de la inspección. Filtra por responsable o sección para tomar decisiones cruzadas.
        </p>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KPI label="Propietario obligatorio" value={fmtCurrency(budgetBreakdown.ownerRequired)} />
        <KPI label="Propietario opcional" value={fmtCurrency(budgetBreakdown.ownerOptional)} muted />
        <KPI label="Inquilino obligatorio" value={fmtCurrency(budgetBreakdown.tenantRequired)} />
        <KPI label="Inquilino opcional" value={fmtCurrency(budgetBreakdown.tenantOptional)} muted />
      </div>

      {warrantyDeposit !== null && (
        <div className="rounded-lg border bg-card px-4 py-2.5 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Depósito de garantía vs propietario obligatorio</span>
          <span className="flex items-baseline gap-3">
            <span className="font-mono">{fmtCurrency(warrantyDeposit)}</span>
            {depositDiff !== null && budgetBreakdown.ownerRequired > 0 && (
              <span className={cn(
                'font-mono font-semibold',
                depositDiff >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]',
              )}>
                {depositDiff >= 0 ? '+' : ''}{fmtCurrency(depositDiff)}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Contractor picker */}
      <div className="rounded-lg border bg-card p-3">
        <ContractorPicker
          contractors={contractors}
          selectedContractorId={selectedContractorId}
          onContractorChange={onContractorChange}
          contractorTotal={contractorTotal}
          utility={utility}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="h-9 pl-7 w-48 text-sm"
          />
        </div>
        <ToggleGroup type="single" value={payerFilter} onValueChange={(v) => v && setPayerFilter(v as PayerFilter)}
          className="h-9 rounded-md border bg-muted/30 p-0.5">
          <ToggleGroupItem value="all" className="h-7 px-3 text-xs">Todos</ToggleGroupItem>
          <ToggleGroupItem value="owner" className="h-7 px-3 text-xs">Propietario</ToggleGroupItem>
          <ToggleGroupItem value="tenant" className="h-7 px-3 text-xs">Inquilino</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" value={natureFilter} onValueChange={(v) => v && setNatureFilter(v as NatureFilter)}
          className="h-9 rounded-md border bg-muted/30 p-0.5">
          <ToggleGroupItem value="all" className="h-7 px-3 text-xs">Todas</ToggleGroupItem>
          <ToggleGroupItem value="required" className="h-7 px-3 text-xs">Obligatorias</ToggleGroupItem>
          <ToggleGroupItem value="optional" className="h-7 px-3 text-xs">Opcionales</ToggleGroupItem>
        </ToggleGroup>
        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="all">Todas las secciones</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>{s.section_title}</option>
          ))}
        </select>

        <div className="flex-1" />

        <select
          value={addToSection}
          onChange={(e) => setAddToSection(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>+ a {s.section_title}</option>
          ))}
        </select>
        <Button size="sm" className="h-9" onClick={() => addToSection && onOpenCatalog(addToSection)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_120px_120px_90px_80px_40px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
          <span>Reparación</span>
          <span>Sección</span>
          <span>Responsable</span>
          <span>Tipo</span>
          <span className="text-right">Cant × Precio</span>
          <span className="text-right">Subtotal</span>
          <span />
        </div>
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Wrench className="h-6 w-6 mx-auto mb-2 opacity-50" />
            Sin reparaciones que coincidan con los filtros.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((r) => {
              const subtotal = r.quantity * r.unit_price;
              return (
                <li key={r.id} className="grid grid-cols-[1fr_120px_120px_120px_90px_80px_40px] gap-2 px-3 py-2 items-center text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.title_snapshot}</p>
                    {r.category_snapshot && (
                      <p className="text-[10px] text-muted-foreground truncate">{r.category_snapshot}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground truncate">
                    {sectionTitle(r.inspection_section_id)}
                  </span>
                  <select
                    value={r.payer_role}
                    onChange={(e) => onUpdateRepair(r.id, 'payer_role', e.target.value)}
                    className="h-7 rounded-md border bg-background px-2 text-xs hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="owner">Propietario</option>
                    <option value="tenant">Inquilino</option>
                  </select>
                  <select
                    value={r.payment_nature}
                    onChange={(e) => onUpdateRepair(r.id, 'payment_nature', e.target.value)}
                    className="h-7 rounded-md border bg-background px-2 text-xs hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="required">Obligatoria</option>
                    <option value="optional">Opcional</option>
                  </select>
                  <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {r.quantity} × {fmtCurrency(r.unit_price)}
                  </span>
                  <span className="text-right font-mono text-sm font-medium tabular-nums">
                    {fmtCurrency(subtotal)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteRepair(r.id)}
                    className="justify-self-center p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > 0 && (
          <div className="border-t px-3 py-2 flex items-center justify-between text-sm bg-muted/30">
            <span className="text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? 'reparación' : 'reparaciones'} · subtotal
            </span>
            <span className="font-mono font-semibold">{fmtCurrency(filteredTotal)}</span>
          </div>
        )}
      </div>

      <p className="text-tiny text-muted-foreground">
        Edita responsable y tipo directamente en la tabla. Para precios y notas detalladas, abre la sección desde la columna "Sección".
      </p>

    </div>
  );
}

function KPI({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-base font-mono font-semibold mt-0.5', muted && 'text-muted-foreground')}>{value}</p>
    </div>
  );
}
