/**
 * Audience-aware public report renderer.
 *
 * Despite the historical filename (`OwnerReport.tsx`), this component now
 * renders BOTH the owner and tenant published views from the same shared
 * payload base. Audience selection is resolved server-side by
 * `get_published_report` from the `public_token` and returned in the
 * response as `audience` ('owner' | 'tenant').
 *
 * Owner feedback loop:
 * - When `audience === 'owner'` and the version has not been locked yet
 *   (`owner_feedback_locked === false`), each repair shows three controls:
 *   accept / observe / reject. Observed/Rejected require a comment.
 * - Submission goes through the `submit_owner_feedback` RPC, which is a
 *   SECURITY DEFINER function callable by anon — clients never write to
 *   the feedback tables directly.
 * - After a successful submission the version is locked: opening the link
 *   again shows the decisions in read-only mode and a status message.
 *   When the executive re-publishes, a new version row replaces the
 *   `is_latest` pointer (reusing the same public token), so the same link
 *   shows the new version in a fresh editable state.
 *
 * Filtering contract:
 * - `audience` is the ONLY public-rendering filter applied here.
 *   - owner   → renders both payer groups (propietario + inquilino) with totals.
 *   - tenant  → renders only `payer_role === 'tenant'` items + tenant total.
 * - `visible_to_owner` is an editorial visibility gate applied earlier when
 *   the publish payload was built; it is NOT a payer gate. Both audience
 *   rows share the same already-filtered visible set.
 *
 * Route: `/reportes/:propertyId/:token` (shared between audiences).
 * Responsive: mobile-first; sticky tabs; vertical-on-mobile budget rows.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  MapPin, Building, Calendar, FileText, DollarSign, User, Users, ImageOff, Key, Download,
  Check, MessageSquare, X, CheckCircle2, AlertCircle, Send,
} from 'lucide-react';

type Audience = 'owner' | 'tenant';
type PayerRole = 'owner' | 'tenant';
type PaymentNature = 'required' | 'optional';
type Decision = 'accepted' | 'observed' | 'rejected';

interface PayloadRepair {
  id?: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  payer_role?: PayerRole;
  payment_nature?: PaymentNature;
}

interface PayloadSection {
  id: string;
  title: string;
  type: string;
  final_observation: string | null;
  photos: { id: string; url: string | null; caption: string | null }[];
  repairs: PayloadRepair[];
}

interface PayloadTaxConfig {
  enabled: boolean;
  percentage: number;
  label: string;
  currency?: string | null;
}

interface OwnerDecision {
  repair_item_id: string;
  decision: Decision;
  comment: string | null;
}

interface ReportPayload {
  property: {
    property_id: string;
    property_name: string | null;
    address: string | null;
    market: string;
    typology?: string | null;
    property_type: string | null;
    inspection_type: string;
  };
  sections: PayloadSection[];
  budget_total: number;
  tax_config?: PayloadTaxConfig | null;
  published_at: string;
  fecha_recoleccion_llaves?: string | null;
  /** Set by `get_published_report` based on which token resolved the row. */
  audience?: Audience;
  /** Feedback loop fields injected by `get_published_report`. */
  version_id?: string;
  owner_feedback_locked?: boolean;
  owner_decisions?: OwnerDecision[];
  inspection_status?: string;
  owner_feedback_status?: 'none' | 'pending_executive_review' | 'accepted';
}

const fmt = (n: number) =>
  `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className ?? ''}`} />;
}

/**
 * Lazy public photo signing.
 *
 * Public reports run as anon, so storage RLS forbids direct `createSignedUrl`.
 * The `sign-public-photo` edge function checks the (token, property_id, photo_id)
 * triple with the service role and returns a 1h signed URL.
 */
function PublicPhoto({
  photoId, propertyId, token, alt, caption,
}: { photoId: string; propertyId: string; token: string; alt: string; caption: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setUrl(null);
    supabase.functions
      .invoke('sign-public-photo', { body: { property_id: propertyId, token, photo_id: photoId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.url) setFailed(true);
        else setUrl(data.url as string);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [photoId, propertyId, token]);

  if (failed) {
    return (
      <div className="aspect-square rounded-xl bg-muted flex flex-col items-center justify-center gap-1 text-muted-foreground">
        <ImageOff className="h-5 w-5" />
        <span className="text-tiny">Foto no disponible</span>
      </div>
    );
  }
  if (!url) return <Shimmer className="aspect-square w-full" />;
  return (
    <img
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      className="aspect-square rounded-xl object-cover w-full"
      loading="lazy" decoding="async" width={400} height={400}
    />
  );
}

/** Flatten section repairs into payer/nature buckets. Defaults legacy items to owner/required. */
function bucketRepairs(sections: PayloadSection[]) {
  const buckets = {
    owner:  { required: [] as PayloadRepair[], optional: [] as PayloadRepair[] },
    tenant: { required: [] as PayloadRepair[], optional: [] as PayloadRepair[] },
  };
  for (const s of sections) {
    for (const r of s.repairs) {
      const payer: PayerRole = r.payer_role === 'tenant' ? 'tenant' : 'owner';
      const nature: PaymentNature = r.payment_nature === 'optional' ? 'optional' : 'required';
      buckets[payer][nature].push(r);
    }
  }
  return buckets;
}

const repairAmount = (r: PayloadRepair) =>
  Number(r.subtotal ?? r.quantity * r.unit_price);

const sumRepairs = (rs: PayloadRepair[]) =>
  rs.reduce((s, r) => s + repairAmount(r), 0);

type DecisionState = Record<string, { decision: Decision | null; comment: string }>;

/**
 * Projected sum considering owner decisions:
 *  - rejected items are excluded
 *  - accepted / observed / pending are included
 * Falls back to full sum when not interactive or when item has no id.
 */
function projectedSum(
  rs: PayloadRepair[],
  decisions: DecisionState | undefined,
  interactive: boolean,
): { projected: number; rejected: number } {
  let projected = 0;
  let rejected = 0;
  for (const r of rs) {
    const amount = repairAmount(r);
    const d = interactive && r.id ? decisions?.[r.id]?.decision : null;
    if (d === 'rejected') rejected += amount;
    else projected += amount;
  }
  return { projected, rejected };
}

/** Decision controls for a single repair (interactive mode) — segmented toggle. */
function RepairDecisionControl({
  state, onChange,
}: { state: { decision: Decision | null; comment: string }; onChange: (next: { decision: Decision | null; comment: string }) => void }) {
  const set = (d: Decision) => onChange({ ...state, decision: d });
  const needsComment = state.decision === 'observed' || state.decision === 'rejected';
  const base = "flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-tiny font-medium transition-all";
  const inactive = "text-muted-foreground hover:text-foreground";
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-muted/70">
        <button
          type="button"
          onClick={() => set('accepted')}
          aria-pressed={state.decision === 'accepted'}
          className={`${base} ${
            state.decision === 'accepted'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : inactive
          }`}
        >
          <Check className="h-3.5 w-3.5" /> Aceptar
        </button>
        <button
          type="button"
          onClick={() => set('observed')}
          aria-pressed={state.decision === 'observed'}
          className={`${base} ${
            state.decision === 'observed'
              ? 'bg-background border border-amber-300 text-amber-700 shadow-sm'
              : inactive
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Observar
        </button>
        <button
          type="button"
          onClick={() => set('rejected')}
          aria-pressed={state.decision === 'rejected'}
          className={`${base} ${
            state.decision === 'rejected'
              ? 'bg-destructive text-destructive-foreground shadow-sm'
              : inactive
          }`}
        >
          <X className="h-3.5 w-3.5" /> Rechazar
        </button>
      </div>
      {needsComment && (
        <Textarea
          value={state.comment}
          onChange={(e) => onChange({ ...state, comment: e.target.value })}
          placeholder={state.decision === 'observed' ? 'Tu observación (requerida)' : 'Motivo del rechazo (requerido)'}
          className="min-h-[60px] text-caption"
        />
      )}
    </div>
  );
}

/** Read-only decision badge for the locked state. */
function DecisionBadge({ decision }: { decision: Decision }) {
  const map = {
    accepted: { label: 'Aceptada', cls: 'border-emerald-500/40 bg-emerald-50 text-emerald-700', Icon: Check },
    observed: { label: 'Observada', cls: 'border-amber-500/40 bg-amber-50 text-amber-700', Icon: MessageSquare },
    rejected: { label: 'Rechazada', cls: 'border-red-500/40 bg-red-50 text-red-700', Icon: X },
  } as const;
  const { label, cls, Icon } = map[decision];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-tiny font-medium ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

/** Single repair row — vertical on mobile, two-column on sm+. Tinted per decision. */
function RepairRow({
  r,
  interactive,
  state,
  onChange,
  lockedDecision,
}: {
  r: PayloadRepair;
  interactive: boolean;
  state?: { decision: Decision | null; comment: string };
  onChange?: (next: { decision: Decision | null; comment: string }) => void;
  lockedDecision?: OwnerDecision;
}) {
  const subtotal = Number(r.subtotal ?? r.quantity * r.unit_price);
  const decision = interactive ? state?.decision ?? null : lockedDecision?.decision ?? null;

  const wrapperByDecision: Record<string, string> = {
    accepted: 'border-primary/30 bg-primary/[0.04]',
    observed: 'border-amber-300/70 bg-amber-50/40',
    rejected: 'border-border bg-muted/40 opacity-70',
  };
  const wrapperCls = decision
    ? wrapperByDecision[decision]
    : 'border-border/60 bg-background/40';

  const isRejected = decision === 'rejected';

  return (
    <div className={`rounded-lg border p-3 sm:p-4 transition-colors ${wrapperCls}`}>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className={`text-body font-medium leading-snug ${isRejected ? 'line-through text-muted-foreground' : ''}`}>{r.name}</p>
          {r.description && (
            <p className="text-caption text-muted-foreground mt-0.5 leading-snug">{r.description}</p>
          )}
        </div>
        <div className="sm:text-right shrink-0">
          <p className={`text-body font-mono tabular-nums font-medium whitespace-nowrap ${isRejected ? 'line-through text-muted-foreground' : ''}`}>{fmt(subtotal)}</p>
        </div>
      </div>

      {interactive && state && onChange && r.id && (
        <RepairDecisionControl state={state} onChange={onChange} />
      )}

      {!interactive && lockedDecision && (
        <div className="mt-2 space-y-1.5">
          <DecisionBadge decision={lockedDecision.decision} />
          {lockedDecision.comment && (
            <p className="text-caption text-muted-foreground italic leading-snug border-l-2 border-border pl-2">
              "{lockedDecision.comment}"
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** A payer/nature group block. */
function RepairGroup({
  title,
  items,
  variant = 'default',
  interactive,
  decisionState,
  onDecisionChange,
  lockedDecisions,
}: {
  title: string;
  items: PayloadRepair[];
  variant?: 'default' | 'subtle';
  interactive?: boolean;
  decisionState?: DecisionState;
  onDecisionChange?: (id: string, next: { decision: Decision | null; comment: string }) => void;
  lockedDecisions?: Map<string, OwnerDecision>;
}) {
  if (items.length === 0) return null;
  const fullSubtotal = sumRepairs(items);
  const { projected, rejected } = projectedSum(items, decisionState, !!interactive);
  const showProjected = !!interactive && rejected > 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className={
          variant === 'subtle'
            ? 'text-tiny font-semibold uppercase tracking-wide text-muted-foreground'
            : 'text-caption font-semibold uppercase tracking-wide text-foreground'
        }>{title}</h3>
        <div className="flex items-baseline gap-2 whitespace-nowrap">
          {showProjected && (
            <span className="text-tiny font-mono tabular-nums text-muted-foreground line-through">{fmt(fullSubtotal)}</span>
          )}
          <span className="text-caption font-mono tabular-nums font-medium text-foreground">{fmt(projected)}</span>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((r, i) => (
          <RepairRow
            key={r.id ?? i}
            r={r}
            interactive={!!interactive && !!r.id}
            state={interactive && r.id ? decisionState?.[r.id] ?? { decision: null, comment: '' } : undefined}
            onChange={interactive && r.id && onDecisionChange ? (next) => onDecisionChange(r.id!, next) : undefined}
            lockedDecision={!interactive && r.id ? lockedDecisions?.get(r.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export default function OwnerReport() {
  const { propertyId, token } = useParams<{ propertyId: string; token: string }>();
  const { toast } = useToast();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Feedback form state
  const [decisions, setDecisions] = useState<DecisionState>({});
  const [submitterName, setSubmitterName] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.rpc('get_published_report', {
      p_property_id: propertyId!,
      p_token: token!,
    });
    if (err || !data) setError(true);
    else setReport(data as unknown as ReportPayload);
    setLoading(false);
  }, [propertyId, token]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const audience: Audience = (report?.audience === 'tenant' ? 'tenant' : 'owner');
  const locked = !!report?.owner_feedback_locked;
  const isOwnerAudience = audience === 'owner';

  // Flat list of owner-decidable repairs (only owner audience).
  const decidableRepairs = useMemo(() => {
    if (!report || !isOwnerAudience) return [] as PayloadRepair[];
    return report.sections.flatMap((s) => s.repairs).filter((r) => !!r.id);
  }, [report, isOwnerAudience]);

  const lockedMap = useMemo(() => {
    const m = new Map<string, OwnerDecision>();
    for (const d of report?.owner_decisions ?? []) m.set(d.repair_item_id, d);
    return m;
  }, [report]);

  const decidedCount = useMemo(
    () => decidableRepairs.filter((r) => !!decisions[r.id!]?.decision).length,
    [decidableRepairs, decisions]
  );

  const allDecidedValid = useMemo(() => {
    if (decidableRepairs.length === 0) return false;
    return decidableRepairs.every((r) => {
      const s = decisions[r.id!];
      if (!s?.decision) return false;
      if ((s.decision === 'observed' || s.decision === 'rejected') && !s.comment.trim()) return false;
      return true;
    });
  }, [decidableRepairs, decisions]);

  const counts = useMemo(() => {
    let accepted = 0, observed = 0, rejected = 0;
    for (const r of decidableRepairs) {
      const d = decisions[r.id!]?.decision;
      if (d === 'accepted') accepted++;
      else if (d === 'observed') observed++;
      else if (d === 'rejected') rejected++;
    }
    return { accepted, observed, rejected };
  }, [decidableRepairs, decisions]);

  const sectionsWithObservations = useMemo(
    () => report?.sections.filter(s => s.final_observation || s.photos.length > 0) ?? [],
    [report]
  );

  const buckets = useMemo(
    () => report ? bucketRepairs(report.sections) : null,
    [report]
  );

  const handleDecisionChange = useCallback(
    (id: string, next: { decision: Decision | null; comment: string }) => {
      setDecisions((prev) => ({ ...prev, [id]: next }));
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    const payload = decidableRepairs.map((r) => ({
      repair_item_id: r.id!,
      decision: decisions[r.id!]!.decision,
      comment: decisions[r.id!]!.comment.trim() || null,
    }));
    const { data, error: err } = await supabase.rpc('submit_owner_feedback', {
      p_property_id: propertyId!,
      p_token: token!,
      p_submitter_name: submitterName.trim() || null,
      p_decisions: payload as any,
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (err) {
      toast({
        title: 'No pudimos enviar tu respuesta',
        description: err.message ?? 'Intenta de nuevo en unos momentos.',
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: (data as any)?.all_accepted ? '¡Reporte aceptado!' : 'Recibimos tu respuesta',
      description: (data as any)?.all_accepted
        ? 'El equipo recibió la confirmación de todas las reparaciones.'
        : 'El equipo revisará tus comentarios y te enviará una versión actualizada.',
    });
    await loadReport();
  }, [decidableRepairs, decisions, propertyId, token, submitterName, toast, loadReport]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
          <Shimmer className="h-12 w-48" />
          <Shimmer className="h-32" />
          <Shimmer className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mx-auto">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-h3">Reporte no encontrado</h1>
          <p className="text-caption text-muted-foreground">El link puede haber expirado o ser inválido.</p>
        </div>
      </div>
    );
  }

  const { property, published_at, fecha_recoleccion_llaves } = report;

  // Decide if the owner can interact with the form (computed early so totals can use it).
  const interactive = isOwnerAudience && !locked && decidableRepairs.length > 0;
  const showLockedBanner = isOwnerAudience && locked;
  const acceptedFinal = report.owner_feedback_status === 'accepted';

  const ownerItems  = buckets ? [...buckets.owner.required,  ...buckets.owner.optional]  : [];
  const tenantItems = buckets ? [...buckets.tenant.required, ...buckets.tenant.optional] : [];
  const ownerSums  = projectedSum(ownerItems,  decisions, interactive);
  const tenantSums = projectedSum(tenantItems, decisions, interactive);
  // "Total" = projected (excluding rejected when interactive). Pending items still count.
  const ownerTotal  = ownerSums.projected;
  const tenantTotal = tenantSums.projected;
  const grandTotal  = ownerTotal + tenantTotal;
  const ownerRejected  = ownerSums.rejected;
  const tenantRejected = tenantSums.rejected;
  const grandRejected  = ownerRejected + tenantRejected;

  const tax = report.tax_config;
  const vatEnabled = !!tax?.enabled && Number(tax?.percentage) > 0;
  const vatPct = Number(tax?.percentage ?? 0);
  const vatLabel = tax?.label || 'IVA';
  const calcVat = (n: number) => (vatEnabled ? Math.round((n * vatPct) / 100) : 0);
  const ownerVat = calcVat(ownerTotal);
  const tenantVat = calcVat(tenantTotal);
  const ownerTotalWithVat = ownerTotal + ownerVat;
  const tenantTotalWithVat = tenantTotal + tenantVat;
  const grandTotalWithVat = ownerTotalWithVat + tenantTotalWithVat;

  const audienceLabel = audience === 'owner' ? 'Vista Propietario' : 'Vista Inquilino';
  const AudienceIcon = audience === 'owner' ? User : Users;

  const handleDownloadPdf = () => window.print();


  return (
    <div className="min-h-screen bg-background">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          [role="tablist"] { display: none !important; }
          [role="tabpanel"] { display: block !important; }
          header { position: static !important; }
          footer { margin-top: 24px !important; }
        }
      `}</style>

      {/* ── Header ─────────────────────────────── */}
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
                <span className="text-sm font-bold text-primary-foreground">H</span>
              </div>
              <span className="text-body-lg font-semibold text-foreground">Homie Inspection</span>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={handleDownloadPdf}
                className="no-print inline-flex items-center gap-1.5 text-tiny text-muted-foreground hover:text-foreground border border-border/60 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-muted/50"
              >
                <Download className="h-3.5 w-3.5" /> Descargar PDF
              </button>
              <Badge variant="secondary" className="gap-1.5 text-tiny">
                <AudienceIcon className="h-3 w-3" /> {audienceLabel}
              </Badge>
            </div>
          </div>

          <h1 className="text-h2 mb-2 leading-tight">{property.property_name ?? property.property_id}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-muted-foreground">
            {property.address && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {property.address}</span>
            )}
            {(property.property_type || property.typology) && (
              <span className="inline-flex items-center gap-1">
                <Building className="h-3.5 w-3.5" /> {property.property_type ?? property.typology}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(published_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            {fecha_recoleccion_llaves && (
              <span className="inline-flex items-center gap-1">
                <Key className="h-3.5 w-3.5" />
                Recolección de llaves: {new Date(`${fecha_recoleccion_llaves}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            )}
          </div>

          {/* Locked / status banner (owner only) */}
          {showLockedBanner && (
            <div
              className={`no-print mt-4 rounded-xl border px-3.5 py-3 flex items-start gap-2.5 ${
                acceptedFinal
                  ? 'border-emerald-500/40 bg-emerald-50 text-emerald-800'
                  : 'border-amber-500/40 bg-amber-50 text-amber-800'
              }`}
            >
              {acceptedFinal
                ? <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                : <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />}
              <div className="text-caption leading-snug">
                <p className="font-semibold">
                  {acceptedFinal
                    ? 'Aceptaste todas las reparaciones de este reporte.'
                    : 'Recibimos tu respuesta.'}
                </p>
                <p className="opacity-90">
                  {acceptedFinal
                    ? 'El equipo coordinará los siguientes pasos contigo.'
                    : 'El equipo revisará tus observaciones y rechazos y te enviará una versión actualizada del reporte cuando esté lista.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Content ──────────────────────────── */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-6 pb-32">
        <Tabs defaultValue="report" className="space-y-5">
          <TabsList className="w-full grid grid-cols-2 sticky top-0 z-10">
            <TabsTrigger value="report" className="gap-1.5">
              <FileText className="h-4 w-4" /> Reporte
            </TabsTrigger>
            <TabsTrigger value="budget" className="gap-1.5">
              <DollarSign className="h-4 w-4" /> Presupuesto
            </TabsTrigger>
          </TabsList>

          {/* ── Report Tab ── */}
          <TabsContent value="report" className="space-y-4">
            {sectionsWithObservations.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No hay observaciones disponibles.</p>
            ) : (
              sectionsWithObservations.map(section => (
                <Card key={section.id} className="border-0 ring-1 ring-border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-body-lg">{section.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {section.final_observation && (
                      <p className="text-body text-foreground leading-relaxed whitespace-pre-line">
                        {section.final_observation}
                      </p>
                    )}
                    {section.photos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                        {section.photos.map(photo => (
                          <div key={photo.id} className="space-y-1">
                            <PublicPhoto
                              photoId={photo.id}
                              propertyId={propertyId!}
                              token={token!}
                              alt={photo.caption ?? ''}
                              caption={photo.caption}
                            />
                            {photo.caption && <p className="text-tiny text-muted-foreground">{photo.caption}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── Budget Tab ── */}
          <TabsContent value="budget" className="space-y-5">
            {/* Interactive instructions */}
            {interactive && (
              <div className="rounded-xl border border-primary/30 bg-primary-soft px-3.5 py-3">
                <p className="text-caption text-foreground font-medium">
                  Revisa cada reparación
                </p>
                <p className="text-tiny text-muted-foreground mt-0.5">
                  Por cada reparación marca <strong>Aceptar</strong>, <strong>Observar</strong> o <strong>Rechazar</strong>.
                  Cuando termines, envía tu respuesta. Si aceptas todas, el reporte queda confirmado.
                </p>
              </div>
            )}

            {!buckets || (audience === 'owner' && grandTotal === 0) ||
             (audience === 'tenant' && tenantTotal === 0) ? (
              <p className="text-center text-muted-foreground py-12">No hay reparaciones presupuestadas.</p>
            ) : audience === 'owner' ? (
              <>
                <Card className="border-0 ring-1 ring-border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-body-lg flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" /> Reparaciones a cargo del propietario
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RepairGroup title="Obligatorias" items={buckets.owner.required}
                      interactive={interactive} decisionState={decisions} onDecisionChange={handleDecisionChange} lockedDecisions={lockedMap} />
                    <RepairGroup title="Opcionales" items={buckets.owner.optional} variant="subtle"
                      interactive={interactive} decisionState={decisions} onDecisionChange={handleDecisionChange} lockedDecisions={lockedMap} />
                    {ownerTotal === 0 && (
                      <p className="text-caption text-muted-foreground">Sin reparaciones asignadas.</p>
                    )}
                    {ownerTotal > 0 && (
                      <div className="space-y-1 border-t pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-body font-semibold">Subtotal propietario</span>
                          <span className="text-body font-mono tabular-nums font-semibold">{fmt(ownerTotal)}</span>
                        </div>
                        {interactive && ownerRejected > 0 && (
                          <div className="flex items-center justify-between text-caption text-muted-foreground">
                            <span>− Rechazado</span>
                            <span className="font-mono tabular-nums">−{fmt(ownerRejected)}</span>
                          </div>
                        )}
                        {vatEnabled && (
                          <>
                            <div className="flex items-center justify-between text-caption text-muted-foreground">
                              <span>{vatLabel} {vatPct}%</span>
                              <span className="font-mono tabular-nums">{fmt(ownerVat)}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-body font-semibold">Total propietario</span>
                              <span className="text-body font-mono tabular-nums font-semibold">{fmt(ownerTotalWithVat)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-0 ring-1 ring-border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-body-lg flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" /> Reparaciones a cargo del inquilino
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RepairGroup title="Obligatorias" items={buckets.tenant.required}
                      interactive={interactive} decisionState={decisions} onDecisionChange={handleDecisionChange} lockedDecisions={lockedMap} />
                    <RepairGroup title="Opcionales" items={buckets.tenant.optional} variant="subtle"
                      interactive={interactive} decisionState={decisions} onDecisionChange={handleDecisionChange} lockedDecisions={lockedMap} />
                    {tenantTotal === 0 && (
                      <p className="text-caption text-muted-foreground">Sin reparaciones asignadas.</p>
                    )}
                    {tenantTotal > 0 && (
                      <div className="space-y-1 border-t pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-body font-semibold">Subtotal inquilino</span>
                          <span className="text-body font-mono tabular-nums font-semibold">{fmt(tenantTotal)}</span>
                        </div>
                        {interactive && tenantRejected > 0 && (
                          <div className="flex items-center justify-between text-caption text-muted-foreground">
                            <span>− Rechazado</span>
                            <span className="font-mono tabular-nums">−{fmt(tenantRejected)}</span>
                          </div>
                        )}
                        {vatEnabled && (
                          <>
                            <div className="flex items-center justify-between text-caption text-muted-foreground">
                              <span>{vatLabel} {vatPct}%</span>
                              <span className="font-mono tabular-nums">{fmt(tenantVat)}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-body font-semibold">Total inquilino</span>
                              <span className="text-body font-mono tabular-nums font-semibold">{fmt(tenantTotalWithVat)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-0 ring-1 ring-primary/30 shadow-sm bg-primary-soft">
                  <CardContent className="py-4 sm:py-5 space-y-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-caption text-muted-foreground">Subtotal propietario</span>
                      <span className="text-body font-mono tabular-nums">{fmt(ownerTotal)}</span>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-caption text-muted-foreground">Subtotal inquilino</span>
                      <span className="text-body font-mono tabular-nums">{fmt(tenantTotal)}</span>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-t pt-2">
                      <span className="text-caption font-medium">Subtotal</span>
                      <span className="text-body font-mono tabular-nums font-medium">{fmt(grandTotal)}</span>
                    </div>
                    {vatEnabled && (
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-caption text-muted-foreground">{vatLabel} {vatPct}%</span>
                        <span className="text-body font-mono tabular-nums">{fmt(ownerVat + tenantVat)}</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-t pt-2">
                      <span className="text-body-lg font-semibold">Total general</span>
                      <span className="text-h3 font-bold font-mono tabular-nums">{fmt(grandTotalWithVat)}</span>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Card className="border-0 ring-1 ring-border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-body-lg flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" /> Reparaciones a cargo del inquilino
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RepairGroup title="Obligatorias" items={buckets.tenant.required} />
                    <RepairGroup title="Opcionales"   items={buckets.tenant.optional} variant="subtle" />
                  </CardContent>
                </Card>

                <Card className="border-0 ring-1 ring-primary/30 shadow-sm bg-primary-soft">
                  <CardContent className="py-4 sm:py-5 space-y-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-caption font-medium">Subtotal</span>
                      <span className="text-body font-mono tabular-nums">{fmt(tenantTotal)}</span>
                    </div>
                    {vatEnabled && (
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-caption text-muted-foreground">{vatLabel} {vatPct}%</span>
                        <span className="text-body font-mono tabular-nums">{fmt(tenantVat)}</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-t pt-2">
                      <span className="text-body-lg font-semibold">Total inquilino</span>
                      <span className="text-h3 font-bold font-mono tabular-nums">{fmt(tenantTotalWithVat)}</span>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* ── Sticky submit bar (owner, interactive only) ── */}
      {interactive && (
        <div className="no-print fixed bottom-0 inset-x-0 z-20 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-caption">
              <span className="font-semibold">{decidedCount}</span>
              <span className="text-muted-foreground"> de {decidableRepairs.length} reparaciones decididas</span>
            </div>
            <Button
              size="sm"
              disabled={!allDecidedValid}
              onClick={() => setConfirmOpen(true)}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" /> Enviar respuesta
            </Button>
          </div>
        </div>
      )}

      {/* ── Confirm dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirma tu respuesta</DialogTitle>
            <DialogDescription>
              Revisa el resumen y, opcionalmente, ingresa tu nombre antes de enviar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-h3 font-bold text-emerald-700">{counts.accepted}</div>
                <div className="text-tiny text-muted-foreground">Aceptadas</div>
              </div>
              <div>
                <div className="text-h3 font-bold text-amber-700">{counts.observed}</div>
                <div className="text-tiny text-muted-foreground">Observadas</div>
              </div>
              <div>
                <div className="text-h3 font-bold text-red-700">{counts.rejected}</div>
                <div className="text-tiny text-muted-foreground">Rechazadas</div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-caption font-medium">Tu nombre (opcional)</label>
              <Input
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
                placeholder="Ej. María González"
              />
            </div>
            {counts.accepted === decidableRepairs.length && (
              <p className="text-caption text-emerald-700">
                Aceptaste todas las reparaciones. Al enviar, el reporte queda confirmado.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={submitting} onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button disabled={submitting} onClick={handleSubmit} className="gap-1.5">
              <Send className="h-3.5 w-3.5" /> {submitting ? 'Enviando…' : 'Confirmar envío'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="border-t mt-10 sm:mt-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-6 text-center text-tiny text-muted-foreground">
          <p>Generado por Homie Inspection · {new Date(published_at).toLocaleDateString('es-MX')}</p>
        </div>
      </footer>
    </div>
  );
}
