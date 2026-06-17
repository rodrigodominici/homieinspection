import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import type { Inspection } from '@/lib/types';
import { getContractDateShortLabel, getPrimaryContactLabel } from '@/lib/inspection-type-labels';
import {
  MapPin, Building, Home, Landmark, CalendarClock, Navigation,
  Hash, MessageCircle, User, Phone, FileText, Warehouse, Car,
  Mail, BedDouble, Bath, Wallet,
} from 'lucide-react';

interface Props {
  inspection: Inspection;
}

function getGoogleMapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function getWhatsAppUrl(phone: string, propertyName?: string | null) {
  const cleaned = phone.replace(/[^+\d]/g, '');
  const msg = encodeURIComponent(`Hola, soy de Homie. Te contacto para coordinar el checkout de la propiedad${propertyName ? ` ${propertyName}` : ''}.`);
  return `https://wa.me/${cleaned}?text=${msg}`;
}

function formatMoney(value: number, market?: string | null): string {
  const currency = market === 'MX' ? 'MXN' : 'CLP';
  try {
    return new Intl.NumberFormat(market === 'MX' ? 'es-MX' : 'es-CL', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

export default function PropertyBriefingCard({ inspection }: Props) {
  const snapshot = getEffectiveSnapshot(inspection);
  const contactPersonLabel = getPrimaryContactLabel(inspection.inspection_type);
  const address = inspection.address ?? (snapshot?.address as string) ?? null;
  const propertyType = inspection.property_type ?? (snapshot?.property_type as string) ?? null;
  const tower = (snapshot?.tower as string) ?? null;
  const market = inspection.market;
  const fechaLlaves = (snapshot?.fecha_recoleccion_llaves as string) ?? null;
  const horaLlaves = (snapshot?.hora_recoleccion_llaves as string) ?? null;
  const unitNumber = (snapshot?.unit_number as string) ?? null;
  const tenantName = (snapshot?.tenant_name as string) ?? null;
  const tenantWhatsapp = (snapshot?.tenant_whatsapp as string) ?? null;
  const contractEndDate = (snapshot?.fecha_de_termino_real_de_contrato as string) ?? null;
  const parkingNumber = (snapshot?.parking_number as string) ?? null;
  const storageNumber = (snapshot?.storage_number as string) ?? null;
  const recipientEmail = (snapshot?.recipient_email as string) ?? null;

  const bedroomsRaw = snapshot?.bedrooms_count;
  const bedroomsCount = typeof bedroomsRaw === 'number' ? bedroomsRaw : null;
  const bathroomsRaw = snapshot?.bathrooms_count;
  const bathroomsCount = typeof bathroomsRaw === 'number' ? bathroomsRaw : null;
  const hasStorage = snapshot?.has_storage as boolean | undefined;
  const hasParking = snapshot?.has_parking as boolean | undefined;
  const warrantyDeposit = typeof snapshot?.warranty_deposit === 'number'
    ? (snapshot.warranty_deposit as number) : null;

  // Bedrooms label (estudio = 0)
  const bedroomsLabel = bedroomsCount !== null
    ? (bedroomsCount === 0 && propertyType === 'estudio' ? 'Estudio (0)' : String(bedroomsCount))
    : null;

  // Bodega/Estacionamiento composite labels
  const storageLabel = hasStorage === true
    ? (storageNumber ? `Sí · ${storageNumber}` : 'Sí')
    : hasStorage === false ? 'No' : (storageNumber || null);
  const parkingLabel = hasParking === true
    ? (parkingNumber ? `Sí · ${parkingNumber}` : 'Sí')
    : hasParking === false ? 'No' : (parkingNumber || null);

  // Block C — Property details rows
  const detailRows: { icon: React.ElementType; label: string; value: string }[] = [];
  if (inspection.property_id) detailRows.push({ icon: Hash, label: 'ID Propiedad', value: inspection.property_id });
  if (unitNumber) detailRows.push({ icon: Home, label: 'Nº Dpto/Casa', value: unitNumber });
  if (propertyType) detailRows.push({ icon: Home, label: 'Tipo', value: propertyType });
  if (market) detailRows.push({ icon: Landmark, label: 'Mercado', value: market });
  if (tower) detailRows.push({ icon: Building, label: 'Torre', value: tower });
  if (bedroomsLabel) detailRows.push({ icon: BedDouble, label: 'Dormitorios', value: bedroomsLabel });
  if (bathroomsCount !== null) detailRows.push({ icon: Bath, label: 'Baños', value: String(bathroomsCount) });
  if (storageLabel) detailRows.push({ icon: Warehouse, label: 'Bodega', value: storageLabel });
  if (parkingLabel) detailRows.push({ icon: Car, label: 'Estacionamiento', value: parkingLabel });
  if (warrantyDeposit !== null) detailRows.push({ icon: Wallet, label: 'Garantía', value: formatMoney(warrantyDeposit, market) });

  const hasDates = !!(fechaLlaves || contractEndDate);
  const hasContact = !!(tenantName || tenantWhatsapp || recipientEmail);

  return (
    <div className="space-y-3">
      {/* ── Block A — Header ── */}
      <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl overflow-hidden">
        <div className="bg-primary/5 px-4 pt-4 pb-3">
          <h2 className="text-h4 truncate">{inspection.property_name ?? inspection.property_id}</h2>
          {address && (
            <div className="flex items-center gap-1.5 mt-1 text-caption text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{address}</span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Block B — Fechas clave ── */}
      {hasDates && (
        <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
          <CardContent className="p-4 space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Fechas clave</p>
            {fechaLlaves && (
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarClock className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recolección de llaves</p>
                  <p className="text-body font-semibold">{fechaLlaves}{horaLlaves ? ` · ${horaLlaves}` : ''}</p>
                </div>
              </div>
            )}
            {contractEndDate && (
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Término de contrato</p>
                  <p className="text-body font-medium">{contractEndDate}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Block C — Detalles de la propiedad ── */}
      {detailRows.length > 0 && (
        <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
          <CardContent className="p-4 space-y-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Detalles de la propiedad</p>
            {detailRows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 py-1">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-caption text-muted-foreground w-32 shrink-0">{label}</span>
                <span className="text-body font-medium truncate">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Block D — Datos de contacto/contexto ── */}
      {(hasContact || address) && (
        <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
          <CardContent className="p-4 space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Datos de contacto</p>

            {tenantName && (
              <div className="flex items-center gap-3 py-1">
                <div className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{contactPersonLabel}</p>
                  <p className="text-body font-medium truncate">{tenantName}</p>
                </div>
                {tenantWhatsapp && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl text-[hsl(var(--status-good))]"
                    onClick={() => window.open(getWhatsAppUrl(tenantWhatsapp, inspection.property_name), '_blank')}
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            {recipientEmail && (
              <div className="flex items-center gap-3 py-1">
                <div className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Correo receptor</p>
                  <p className="text-body font-medium truncate">{recipientEmail}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {address ? (
                <Button
                  variant="outline"
                  className="flex-1 h-11 rounded-xl gap-2"
                  onClick={() => window.open(getGoogleMapsUrl(address), '_blank')}
                >
                  <Navigation className="h-4 w-4" />
                  Cómo llegar
                </Button>
              ) : (
                <Button variant="outline" className="flex-1 h-11 rounded-xl gap-2" disabled>
                  <Navigation className="h-4 w-4" />
                  Dirección no disponible
                </Button>
              )}

              {tenantWhatsapp && (
                <Button
                  variant="outline"
                  className="flex-1 h-11 rounded-xl gap-2 text-[hsl(var(--status-good))] border-[hsl(var(--status-good))]/30"
                  onClick={() => window.open(getWhatsAppUrl(tenantWhatsapp, inspection.property_name), '_blank')}
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
