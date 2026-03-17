import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createInspectionFromPayload } from '@/lib/inspection-service';
import { EXAMPLE_PAYLOADS } from '@/lib/inspection-generator';
import { ArrowLeft, Zap } from 'lucide-react';

const payloadOptions = [
  { key: 'studio', label: 'Estudio — 0D 1B, terraza + logia' },
  { key: 'twoBedTwoBath', label: '2D 2B — con bodega y estacionamiento' },
  { key: 'houseWithYard', label: 'Casa 3D 2B — con antejardín' },
  { key: 'fullFeatures', label: '4D 4B — todas las características' },
];

export default function AdminCreateInspection() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedExample, setSelectedExample] = useState('studio');
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(EXAMPLE_PAYLOADS.studio, null, 2)
  );
  const [generating, setGenerating] = useState(false);

  const handleExampleChange = (key: string) => {
    setSelectedExample(key);
    const payload = EXAMPLE_PAYLOADS[key as keyof typeof EXAMPLE_PAYLOADS];
    setPayloadText(JSON.stringify(payload, null, 2));
  };

  const handleGenerate = async () => {
    if (!profile) return;
    setGenerating(true);
    try {
      const payload = JSON.parse(payloadText);
      const inspection = await createInspectionFromPayload(payload, profile.id);
      toast({ title: 'Inspección creada', description: `ID: ${inspection.property_id}` });
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
            <p className="text-xs text-muted-foreground">Generación manual desde payload</p>
          </div>
        </div>
      </header>

      <main className="container max-w-3xl py-6 space-y-6">
        <Card className="border-0 ring-1 ring-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Payload de Ejemplo</CardTitle>
            <CardDescription>Selecciona un ejemplo o edita el JSON directamente</CardDescription>
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
              className="font-mono text-xs min-h-[400px]"
            />
          </CardContent>
        </Card>

        <Button
          onClick={handleGenerate}
          disabled={generating}
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
