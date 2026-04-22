import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import type { Inspection } from '@/lib/types';
import { User, Phone, Mail } from 'lucide-react';

interface Props {
  inspection: Inspection;
}

export default function AdminTenantContactCard({ inspection }: Props) {
  const snapshot = getEffectiveSnapshot(inspection);
  const tenantName = (snapshot?.tenant_name as string) ?? null;
  const tenantWhatsapp = (snapshot?.tenant_whatsapp as string) ?? null;
  const recipientEmail = (snapshot?.recipient_email as string) ?? null;

  const allMissing = !tenantName && !tenantWhatsapp && !recipientEmail;

  const cleanedPhone = tenantWhatsapp ? tenantWhatsapp.replace(/[^+\d]/g, '') : null;

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4 text-primary" /> Datos del arrendatario
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sincronizado desde REM. Solo lectura.
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-2.5">
        <Row icon={User} label="Inquilino">
          {tenantName ? (
            <span className="text-body font-medium truncate">{tenantName}</span>
          ) : (
            <span className="text-body text-muted-foreground italic">No disponible</span>
          )}
        </Row>

        <Row icon={Phone} label="WhatsApp">
          {cleanedPhone ? (
            <a
              href={`tel:${cleanedPhone}`}
              className="text-body font-medium text-primary hover:underline truncate"
            >
              {tenantWhatsapp}
            </a>
          ) : (
            <span className="text-body text-muted-foreground italic">No disponible</span>
          )}
        </Row>

        <Row icon={Mail} label="Correo receptor">
          {recipientEmail ? (
            <a
              href={`mailto:${recipientEmail}`}
              className="text-body font-medium text-primary hover:underline truncate"
            >
              {recipientEmail}
            </a>
          ) : (
            <span className="text-body text-muted-foreground italic">No disponible</span>
          )}
        </Row>

        {allMissing && (
          <p className="text-caption text-muted-foreground pt-2 border-t border-border/60">
            El inquilino no se ha sincronizado desde REM/HubSpot todavía.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-caption text-muted-foreground w-32 shrink-0">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
