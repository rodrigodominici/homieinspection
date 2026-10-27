import { Camera } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const TIPS = [
  'Celular en horizontal, a la altura del pecho y sin zoom.',
  'Abre cortinas y enciende todas las luces. Evita el contraluz.',
  'Ambientes ordenados: sin objetos personales, camas hechas y tapa del inodoro abajo.',
  'Dispara desde una esquina para mostrar el ambiente completo.',
  'Limpia el lente y no te muevas al disparar para que salgan nítidas.',
];

const ORDER = 'Fachada / acceso → living → comedor → cocina → cada dormitorio → cada baño → terraza / vista → áreas comunes → estacionamiento / bodega.';

export function MarketingPhotoTips() {
  return (
    <Card className="border-0 ring-1 ring-primary/30 bg-primary/5 shadow-sm rounded-2xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" />
          <p className="text-body font-semibold">Fotos para publicar el inmueble</p>
        </div>
        <p className="text-caption text-muted-foreground">
          Estas fotos se usarán en los portales. Sube mínimo 10.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-caption">
          {TIPS.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <p className="text-caption"><span className="font-medium">Orden sugerido:</span> {ORDER}</p>
      </CardContent>
    </Card>
  );
}
