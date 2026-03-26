import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import type { Inspection } from '@/lib/types';
import { MapPin, Building, Home, Landmark, CalendarClock, Navigation, Hash } from 'lucide-react';

interface Props {
  inspection: Inspection;
}

function getGoogleMapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default function PropertyBriefingCard({ inspection }: Props) {
  const snapshot = getEffectiveSnapshot(inspection);
  const address = inspection.address ?? (snapshot?.address as string) ?? null;
  const propertyType = inspection.property_type ?? (snapshot?.property_type as string) ?? null;
  const tower = (snapshot?.tower as string) ?? null;
  const market = inspection.market;
  const fechaLlaves = (snapshot?.fecha_recoleccion_llaves as string) ?? null;
  const horaLlaves = (snapshot?.hora_recoleccion_llaves as string) ?? null;
  const scheduledAt = inspection.scheduled_at;

  const scheduleDate = fechaLlaves || (scheduledAt ? scheduledAt.split('T')[0] : null);
  const scheduleTime = horaLlaves || (scheduledAt ? new Date(scheduledAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : null);

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
          {propertyType && (
            <InfoBlock icon={Home} label="Tipo" value={propertyType} />
          )}
          {market && (
            <InfoBlock icon={Landmark} label="Mercado" value={market} />
          )}
          {tower && (
            <InfoBlock icon={Building} label="Torre" value={tower} />
          )}
          {scheduleDate && (
            <InfoBlock
              icon={CalendarClock}
              label="Recolección Llaves"
              value={`${scheduleDate}${scheduleTime ? ` · ${scheduleTime}` : ''}`}
            />
          )}
        </div>

        {/* Cómo llegar */}
        {address ? (
          <Button
            variant="outline"
            className="w-full h-11 rounded-xl gap-2"
            onClick={() => window.open(getGoogleMapsUrl(address), '_blank')}
          >
            <Navigation className="h-4 w-4" />
            Cómo llegar
          </Button>
        ) : (
          <Button variant="outline" className="w-full h-11 rounded-xl gap-2" disabled>
            <Navigation className="h-4 w-4" />
            Dirección no disponible
          </Button>
        )}
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
