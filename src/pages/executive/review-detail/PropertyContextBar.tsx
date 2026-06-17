import { MapPin, User, Calendar, KeyRound, Phone, Mail, PenLine, XCircle, AlertTriangle, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import { fmtCurrency } from './helpers';
import { getPrimaryContactLabel } from '@/lib/inspection-type-labels';
import type { Inspection } from '@/lib/types';

interface PropertyContextBarProps {
  inspection: Inspection;
  signatureRecord: any | null;
}

function Item({
  icon: Icon, label, value,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
        <p className="text-xs text-foreground leading-tight truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

/**
 * Permanent context surface for the Executive review. Displays all
 * contextual / metadata information (property, tenant, owner, dates,
 * signature) so it is always visible and never requires navigation.
 *
 * This replaces the previous "Contexto" popover that treated metadata
 * sections as navigable destinations.
 */
export function PropertyContextBar({ inspection, signatureRecord }: PropertyContextBarProps) {
  const snap = getEffectiveSnapshot(inspection) as Record<string, any>;

  const address = inspection.address ?? snap.address ?? null;
  const inspector = inspection.inspector?.full_name ?? null;
  const scheduled = inspection.scheduled_at
    ? format(new Date(inspection.scheduled_at), "d MMM yyyy · HH:mm", { locale: es })
    : null;

  const keyDate = snap.fecha_recoleccion_llaves
    ? format(new Date(snap.fecha_recoleccion_llaves), 'd MMM yyyy', { locale: es })
    : null;
  const keyTime = snap.hora_recoleccion_llaves ?? null;
  const keyLine = keyDate ? `${keyDate}${keyTime ? ` · ${keyTime}` : ''}` : null;

  const tenant = snap.tenant_name ?? null;
  const tenantPhone = snap.tenant_whatsapp ?? null;
  const ownerEmail = snap.recipient_email ?? null;
  const deposit = typeof snap.warranty_deposit === 'number' ? fmtCurrency(snap.warranty_deposit) : null;

  const sigStatus = signatureRecord?.signature_status as 'signed' | 'refused' | 'unavailable' | undefined;
  const contactLabel = getPrimaryContactLabel(inspection.inspection_type);
  const SigIcon = sigStatus === 'signed' ? PenLine : sigStatus === 'refused' ? XCircle : AlertTriangle;
  const sigColor =
    sigStatus === 'signed' ? 'text-[hsl(var(--status-good))]'
    : sigStatus === 'refused' ? 'text-[hsl(var(--status-bad))]'
    : 'text-[hsl(var(--status-regular))]';
  const sigLabel =
    sigStatus === 'signed'
      ? `Firmado${signatureRecord?.signer_name ? ` · ${signatureRecord.signer_name}` : ''}`
      : sigStatus === 'refused' ? `Rechazada por ${contactLabel.toLowerCase()}`
      : sigStatus === 'unavailable' ? `${contactLabel} no disponible`
      : 'Sin registro';

  return (
    <section
      aria-label="Contexto de la inspección"
      className="border-b bg-card/60 px-4 lg:px-6 py-3"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-3">
        <Item icon={MapPin} label="Dirección" value={address} />
        <Item icon={User} label="Inspector" value={inspector} />
        <Item icon={Calendar} label="Fecha inspección" value={scheduled} />
        <Item icon={KeyRound} label="Entrega de llaves" value={keyLine} />
        <Item
          icon={Phone}
          label="Inquilino"
          value={
            tenant ? (
              <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                <span>{tenant}</span>
                {tenantPhone && <span className="text-muted-foreground">{tenantPhone}</span>}
              </span>
            ) : tenantPhone
          }
        />
        <Item icon={Mail} label="Propietario" value={ownerEmail} />
        {deposit && (
          <Item icon={Wallet} label="Garantía" value={deposit} />
        )}
        <div className="flex items-start gap-2 min-w-0">
          <SigIcon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${sigColor}`} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">Firma inquilino</p>
            <p className={`text-xs leading-tight truncate ${sigColor}`}>{sigLabel}</p>
            {signatureRecord?.skip_reason && (
              <p className="text-[10px] text-muted-foreground italic truncate">{signatureRecord.skip_reason}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
