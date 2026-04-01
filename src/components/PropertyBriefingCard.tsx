import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import type { Inspection } from '@/lib/types';
import { MapPin, Building, Home, Landmark, CalendarClock, Navigation, Hash, MessageCircle, User, Phone, FileText } from 'lucide-react';

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

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl overflow-hidden">
      {/* Header with name + status */}
      <div className="bg-primary/5 px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-h4 truncate">{inspection.property_name ?? inspection.property_id}</h2>
            {address && (
              <div className="flex items-center gap-1.5 mt-1 text-caption text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{address}</span>
              </div>
            )}
          </div>
          <InspectionStatusBadge status={inspection.status} />
        </div>
      </div>

      <CardContent className="p-4 space-y-4">
        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3">
          {inspection.property_id && (
            <InfoBlock icon={Hash} label="ID Propiedad" value={inspection.property_id} />
          )}
          {unitNumber && (
            <InfoBlock icon={Home} label="Nº Dpto/Casa" value={unitNumber} />
          )}
          {propertyType && (
            <InfoBlock icon={Home} label="Tipo" value={propertyType} />
          )}
          {market && (
            <InfoBlock icon={Landmark} label="Mercado" value={market} />
          )}
          {tower && (
            <InfoBlock icon={Building} label="Torre" value={tower} />
          )}
          {contractEndDate && (
            <InfoBlock icon={FileText} label="Término contrato (ref.)" value={contractEndDate} />
          )}
          {fechaLlaves && (
            <InfoBlock
              icon={CalendarClock}
              label="Fecha inspección"
              value={`${fechaLlaves}${horaLlaves ? ` · ${horaLlaves}` : ''}`}
            />
          )}
        </div>

        {/* Tenant contact */}
        {tenantName && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/40">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
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

        {/* Action buttons */}
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
  );
}

function InfoBlock({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-muted/40">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-body font-medium truncate">{value}</p>
      </div>
    </div>
  );
}
