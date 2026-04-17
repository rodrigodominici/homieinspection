import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Building, Calendar, FileText, DollarSign } from 'lucide-react';

interface ReportPayload {
  property: {
    property_id: string;
    property_name: string | null;
    address: string | null;
    market: string;
    // Legacy snapshot field — kept ONLY to render older reports whose
    // normalized_payload still contains this JSON key. Never written by
    // current code and never read from the inspections table column.
    typology?: string | null;
    property_type: string | null;
    inspection_type: string;
  };
  sections: {
    id: string;
    title: string;
    type: string;
    final_observation: string | null;
    photos: { id: string; url: string | null; caption: string | null }[];
    repairs: {
      name: string;
      description: string | null;
      category: string | null;
      unit: string;
      quantity: number;
      unit_price: number;
      subtotal: number;
    }[];
  }[];
  budget_total: number;
  published_at: string;
}

/* Lightweight CSS shimmer — avoids importing Skeleton component */
function Shimmer({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-muted ${className ?? ''}`} />
  );
}

export default function OwnerReport() {
  const { propertyId, token } = useParams<{ propertyId: string; token: string }>();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data, error: err } = await supabase.rpc('get_published_report', {
        p_property_id: propertyId!,
        p_token: token!,
      });
      if (err || !data) {
        setError(true);
      } else {
        setReport(data as unknown as ReportPayload);
      }
      setLoading(false);
    };
    fetch();
  }, [propertyId, token]);

  // Memoized derived data
  const sectionsWithObservations = useMemo(
    () => report?.sections.filter((s) => s.final_observation || s.photos.length > 0) ?? [],
    [report]
  );
  const sectionsWithRepairs = useMemo(
    () => report?.sections.filter((s) => s.repairs.length > 0) ?? [],
    [report]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto p-6 space-y-4">
          <Shimmer className="h-12 w-48" />
          <Shimmer className="h-32" />
          <Shimmer className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
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

  const { property, budget_total, published_at } = report;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <span className="text-sm font-bold text-primary-foreground">H</span>
            </div>
            <span className="text-body-lg font-semibold text-foreground">Homie Inspection</span>
          </div>
          <h1 className="text-h2 mb-2">{property.property_name ?? property.property_id}</h1>
          <div className="flex flex-wrap gap-4 text-caption text-muted-foreground">
            {property.address && (
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {property.address}</span>
            )}
            {(property.property_type || property.typology) && (
              <span className="flex items-center gap-1">
                <Building className="h-3.5 w-3.5" /> {property.property_type ?? property.typology}
                {property.typology && property.property_type && property.typology !== property.property_type && (
                  <span className="text-muted-foreground">({property.typology})</span>
                )}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(published_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-6">
        <Tabs defaultValue="report" className="space-y-6">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="report" className="gap-1.5">
              <FileText className="h-4 w-4" /> Reporte
            </TabsTrigger>
            <TabsTrigger value="budget" className="gap-1.5">
              <DollarSign className="h-4 w-4" /> Presupuesto
            </TabsTrigger>
          </TabsList>

          {/* Report Tab */}
          <TabsContent value="report" className="space-y-4">
            {sectionsWithObservations.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No hay observaciones disponibles.</p>
            ) : (
              sectionsWithObservations.map((section) => (
                <Card key={section.id} className="border-0 ring-1 ring-border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-body-lg">{section.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {section.final_observation && (
                      <p className="text-body text-foreground leading-relaxed">{section.final_observation}</p>
                    )}
                    {section.photos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {section.photos.map((photo) => (
                          <div key={photo.id} className="space-y-1">
                            <img
                              src={photo.url ?? ''}
                              alt={photo.caption ?? ''}
                              className="aspect-square rounded-xl object-cover w-full"
                              loading="lazy"
                              decoding="async"
                              width={400}
                              height={400}
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

          {/* Budget Tab */}
          <TabsContent value="budget" className="space-y-4">
            {sectionsWithRepairs.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No hay reparaciones presupuestadas.</p>
            ) : (
              <>
                {sectionsWithRepairs.map((section) => {
                  const sectionTotal = section.repairs.reduce((s, r) => s + Number(r.subtotal), 0);
                  return (
                    <Card key={section.id} className="border-0 ring-1 ring-border shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-body-lg">{section.title}</CardTitle>
                          <span className="text-caption font-mono font-medium">
                            ${sectionTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="divide-y">
                          {section.repairs.map((repair, idx) => (
                            <div key={idx} className="py-3 first:pt-0 last:pb-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-body font-medium">{repair.name}</p>
                                  {repair.description && <p className="text-caption text-muted-foreground mt-0.5">{repair.description}</p>}
                                  {repair.category && <Badge variant="secondary" className="text-tiny mt-1">{repair.category}</Badge>}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-body font-mono font-medium">
                                    ${Number(repair.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  </p>
                                  <p className="text-tiny text-muted-foreground">
                                    {repair.quantity} × ${Number(repair.unit_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })} / {repair.unit}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Grand total */}
                <Card className="border-0 ring-1 ring-primary/30 shadow-sm bg-primary-soft">
                  <CardContent className="py-5">
                    <div className="flex items-center justify-between">
                      <p className="text-body-lg font-semibold">Total Presupuesto</p>
                      <p className="text-h3 font-bold font-mono">
                        ${budget_total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12">
        <div className="max-w-3xl mx-auto px-6 py-6 text-center text-tiny text-muted-foreground">
          <p>Generado por Homie Inspection · {new Date(published_at).toLocaleDateString('es-MX')}</p>
        </div>
      </footer>
    </div>
  );
}
