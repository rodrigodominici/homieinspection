import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Plug, ArrowRight } from 'lucide-react';

export default function AdminIntegrations() {
  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Integraciones</h1>
          <p className="text-muted-foreground text-sm">
            Conexiones entrantes con sistemas externos.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Plug className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">HubSpot — Inspections (v1)</CardTitle>
                <CardDescription>
                  Recibe propiedades desde HubSpot y crea inspecciones automáticamente.
                </CardDescription>
              </div>
            </div>
            <Badge variant="default">Activa</Badge>
          </CardHeader>
          <CardContent className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/integrations/hubspot">
                Configurar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
