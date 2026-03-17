import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Database, Users, Layers } from 'lucide-react';
import type { Profile } from '@/lib/types';

/**
 * Admin Configuration area.
 *
 * Currently read-only — provides visibility into:
 * - Registered users by role
 * - Template generation rules (documentation)
 * - External user mappings (HubSpot → internal)
 *
 * Future: full CRUD for templates, visibility rules, repeatable sections.
 */
export default function AdminConfig() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('*').eq('is_active', true).order('role'),
      supabase.from('external_user_mappings').select('*').order('created_at', { ascending: false }),
    ]).then(([pRes, mRes]) => {
      setProfiles((pRes.data ?? []) as unknown as Profile[]);
      setMappings(mRes.data ?? []);
    });
  }, []);

  const byRole = (role: string) => profiles.filter((p) => p.role === role);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Configuración</h1>
            <p className="text-xs text-muted-foreground">Usuarios, templates y mappings</p>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl py-6 space-y-6">
        {/* Users */}
        <Card className="border-0 ring-1 ring-border/50 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Usuarios Internos</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {['admin', 'inspector', 'executive'].map((role) => (
              <div key={role}>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{role}s</h4>
                {byRole(role).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ninguno registrado</p>
                ) : (
                  <div className="space-y-1">
                    {byRole(role).map((p) => (
                      <div key={p.id} className="text-sm flex items-center justify-between">
                        <span>{p.full_name}</span>
                        <span className="text-muted-foreground">{p.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* External Mappings */}
        <Card className="border-0 ring-1 ring-border/50 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Mappings Externos (HubSpot)</CardTitle>
            </div>
            <CardDescription>
              Vinculación entre emails/IDs de HubSpot y usuarios internos de Homie Inspection.
              Estos mappings se usarán para auto-asignar inspecciones cuando lleguen payloads desde HubSpot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mappings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay mappings configurados aún. Se crearán cuando se integre con HubSpot.
              </p>
            ) : (
              <div className="space-y-2">
                {mappings.map((m: any) => (
                  <div key={m.id} className="text-sm flex items-center justify-between border-b pb-2">
                    <span>{m.hubspot_email ?? m.hubspot_user_id}</span>
                    <span className="text-muted-foreground">{m.role_hint} → {m.profile_id ?? 'sin vincular'}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Generation Rules Documentation */}
        <Card className="border-0 ring-1 ring-border/50 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Reglas de Generación Dinámica</CardTitle>
            </div>
            <CardDescription>
              Cómo el sistema genera secciones a partir de los datos de la propiedad
            </CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none text-sm space-y-3">
            <p>Las secciones se generan dinámicamente basándose en el payload de la propiedad:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Secciones fijas:</strong> Datos de propiedad, Persona que entrega, Acceso, Cocina, Electrodomésticos, Aseo, Llaves, Medidores, Info Adicional</li>
              <li><strong>Living:</strong> Si typology=Estudio → "Living/Dormitorio", sino → "Living/Comedor"</li>
              <li><strong>Dormitorios:</strong> Se repiten N veces según <code>bedrooms_count</code></li>
              <li><strong>Baños:</strong> Se repiten N veces según <code>bathrooms_count</code></li>
              <li><strong>Terraza Living:</strong> Solo si <code>has_terrace_living = true</code></li>
              <li><strong>Terraza Dormitorio:</strong> Solo si <code>has_terrace_bedroom = true</code></li>
              <li><strong>Walking Closet:</strong> Solo si <code>has_walking_closet = true</code></li>
              <li><strong>Logia:</strong> Solo si <code>has_logia = true</code></li>
              <li><strong>Bodega y Estacionamiento:</strong> Si <code>has_storage</code> o <code>has_parking = true</code></li>
              <li><strong>Antejardín:</strong> Solo si <code>has_front_yard = true</code> Y <code>property_type = casa</code></li>
            </ul>
            <p className="text-muted-foreground italic">
              Futuro: estas reglas se cargarán desde la tabla <code>inspection_templates</code> / <code>inspection_template_sections</code> para permitir configuración desde admin.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
