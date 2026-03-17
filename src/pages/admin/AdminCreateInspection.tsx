import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createInspectionFromPayload } from '@/lib/inspection-service';
import { EXAMPLE_PAYLOADS } from '@/lib/inspection-generator';
import type { Profile } from '@/lib/types';
import { ArrowLeft, Zap, AlertCircle, UserCheck } from 'lucide-react';

const payloadOptions = [
  { key: 'studio', label: 'Estudio — 0D 1B, terraza + logia' },
  { key: 'twoBedTwoBath', label: '2D 2B — con bodega y estacionamiento' },
  { key: 'houseWithYard', label: 'Casa 3D 2B — con antejardín' },
  { key: 'fullFeatures', label: '4D 4B — todas las características' },
];

/**
 * Admin manual inspection creation screen.
 *
 * Workflow:
 * 1. Admin selects/edits a JSON payload (simulating future HubSpot webhook)
 * 2. Admin explicitly selects an inspector and executive from real users
 * 3. On "Generate", the payload is stored as a source event, the parent
 *    inspection is created with inspector_id + executive_id, and dynamic
 *    sections are generated.
 *
 * The inspector and executive emails in the payload are shown for reference
 * (they represent what HubSpot will send), but the actual DB assignment
 * uses the profile IDs selected by the admin.
 */
export default function AdminCreateInspection() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedExample, setSelectedExample] = useState('studio');
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(EXAMPLE_PAYLOADS.studio, null, 2)
  );
  const [generating, setGenerating] = useState(false);

  // User selectors
  const [inspectors, setInspectors] = useState<Profile[]>([]);
  const [executives, setExecutives] = useState<Profile[]>([]);
  const [selectedInspectorId, setSelectedInspectorId] = useState<string>('');
  const [selectedExecutiveId, setSelectedExecutiveId] = useState<string>('');

  // Detected emails from payload (informational)
  const [detectedInspectorEmail, setDetectedInspectorEmail] = useState<string | null>(null);
  const [detectedExecutiveEmail, setDetectedExecutiveEmail] = useState<string | null>(null);

  // Load available users
  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name');
      if (data) {
        setInspectors((data as unknown as Profile[]).filter((p) => p.role === 'inspector'));
        setExecutives((data as unknown as Profile[]).filter((p) => p.role === 'executive'));
      }
    };
    fetchUsers();
  }, []);

  // Parse payload to detect emails
  useEffect(() => {
    try {
      const parsed = JSON.parse(payloadText);
      setDetectedInspectorEmail(parsed?.inspector?.email ?? null);
      setDetectedExecutiveEmail(parsed?.executive?.email ?? null);
    } catch {
      setDetectedInspectorEmail(null);
      setDetectedExecutiveEmail(null);
    }
  }, [payloadText]);

  const handleExampleChange = (key: string) => {
    setSelectedExample(key);
    const payload = EXAMPLE_PAYLOADS[key as keyof typeof EXAMPLE_PAYLOADS];
    setPayloadText(JSON.stringify(payload, null, 2));
  };

  const handleGenerate = async () => {
    if (!profile) return;

    // Validate assignment
    if (!selectedInspectorId || !selectedExecutiveId) {
      toast({
        title: 'Asignación requerida',
        description: 'Debes seleccionar un inspector y un ejecutivo antes de generar.',
        variant: 'destructive',
      });
      return;
    }

    setGenerating(true);
    try {
      const payload = JSON.parse(payloadText);

      /*
       * ASSIGNMENT LOGIC:
       * The admin-selected profile IDs override whatever is in the payload.
       * This is the canonical place where inspector_id and executive_id
       * are injected into the inspection creation flow.
       *
       * In the future, the HubSpot webhook handler will resolve emails
       * via external_user_mappings and inject IDs similarly.
       */
      payload.inspector = {
        ...(payload.inspector ?? {}),
        id: selectedInspectorId,
      };
      payload.executive = {
        ...(payload.executive ?? {}),
        id: selectedExecutiveId,
      };

      const inspection = await createInspectionFromPayload(payload, profile.id);
      toast({ title: 'Inspección creada', description: `ID: ${inspection.property_id} — Estado: ${inspection.status}` });
      navigate('/admin');
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error generando inspección',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Crear Inspección</h1>
            <p className="text-xs text-muted-foreground">Ingesta manual de payload + asignación</p>
          </div>
        </div>
      </header>

      <main className="container max-w-3xl py-6 space-y-6">
        {/* Step 1: Payload */}
        <Card className="border-0 ring-1 ring-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Paso 1 — Payload de Propiedad</CardTitle>
            <CardDescription>Selecciona un ejemplo o pega un JSON personalizado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedExample} onValueChange={handleExampleChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {payloadOptions.map((opt) => (
                  <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              className="font-mono text-xs min-h-[300px]"
            />

            {/* Detected emails from payload */}
            {(detectedInspectorEmail || detectedExecutiveEmail) && (
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Emails detectados en payload (referencia HubSpot)
                </p>
                {detectedInspectorEmail && (
                  <p>Inspector: <span className="font-medium">{detectedInspectorEmail}</span></p>
                )}
                {detectedExecutiveEmail && (
                  <p>Ejecutivo: <span className="font-medium">{detectedExecutiveEmail}</span></p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Assignment */}
        <Card className="border-0 ring-1 ring-border/50 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Paso 2 — Asignación</CardTitle>
            </div>
            <CardDescription>
              Selecciona el inspector y ejecutivo que serán asignados a esta inspección
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Inspector</Label>
              {inspectors.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-status-regular">
                  <AlertCircle className="h-4 w-4" />
                  No hay inspectores registrados. Crea una cuenta con rol inspector primero.
                </div>
              ) : (
                <Select value={selectedInspectorId} onValueChange={setSelectedInspectorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar inspector..." />
                  </SelectTrigger>
                  <SelectContent>
                    {inspectors.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name} ({p.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Ejecutivo</Label>
              {executives.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-status-regular">
                  <AlertCircle className="h-4 w-4" />
                  No hay ejecutivos registrados. Crea una cuenta con rol executive primero.
                </div>
              ) : (
                <Select value={selectedExecutiveId} onValueChange={setSelectedExecutiveId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar ejecutivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {executives.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name} ({p.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Generate */}
        <Button
          onClick={handleGenerate}
          disabled={generating || !selectedInspectorId || !selectedExecutiveId}
          className="w-full h-12 text-base"
          size="lg"
        >
          <Zap className="mr-2 h-5 w-5" />
          {generating ? 'Generando...' : 'Generar Inspección'}
        </Button>
      </main>
    </div>
  );
}
