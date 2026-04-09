import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import type { Inspection } from '@/lib/types';
import {
  MapPin, Building, Home, Landmark, CalendarClock, Navigation,
  Hash, MessageCircle, User, Phone, FileText, Warehouse, Car,
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

export default function PropertyBriefingCard({ inspection }: Props) {
  const snapshot = getEffectiveSnapshot(inspection);
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

  // Collect property detail rows
  const detailRows: { icon: React.ElementType; label: string; value: string }[] = [];
  if (inspection.property_id) detailRows.push({ icon: Hash, label: 'ID Propiedad', value: inspection.property_id });
  if (unitNumber) detailRows.push({ icon: Home, label: 'Nº Dpto/Casa', value: unitNumber });
  if (propertyType) detailRows.push({ icon: Home, label: 'Tipo', value: propertyType });
  if (market) detailRows.push({ icon: Landmark, label: 'Mercado', value: market });
  if (tower) detailRows.push({ icon: Building, label: 'Torre', value: tower });
  if (parkingNumber) detailRows.push({ icon: Car, label: 'Estacionamiento', value: parkingNumber });
  if (storageNumber) detailRows.push({ icon: Warehouse, label: 'Bodega', value: storageNumber });

  const hasDates = !!(fechaLlaves || contractEndDate);
  const hasContact = !!(tenantName || tenantWhatsapp);

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

      {/* ── Block B — Key Dates ── */}
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

      {/* ── Block C — Property Details ── */}
      {detailRows.length > 0 && (
        <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
          <CardContent className="p-4 space-y-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Detalles de la propiedad</p>
            {detailRows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 py-1">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-caption text-muted-foreground w-28 shrink-0">{label}</span>
                <span className="text-body font-medium truncate">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Block D — Contact & Actions ── */}
      {(hasContact || address) && (
        <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
          <CardContent className="p-4 space-y-3">
            {tenantName && (
              <div className="flex items-center gap-3 py-1">
                <div className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Inquilino</p>
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
