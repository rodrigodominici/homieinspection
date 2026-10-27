import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/** MX captaciones whose property is not yet in Legado: link to the HubSpot deal. */
export function HubSpotDealLink({ inspectionId }: { inspectionId?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!inspectionId) return;
    let alive = true;
    supabase.rpc('get_inspection_hubspot_deal_url', { p_inspection_id: inspectionId })
      .then(({ data }) => {
        if (alive && typeof data === 'string' && data.startsWith('https://app.hubspot.com/')) setUrl(data);
      });
    return () => { alive = false; };
  }, [inspectionId]);
  if (!url) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver negocio en HubSpot
        </a>
      </Button>
      <Badge variant="secondary" className="font-normal text-muted-foreground">Inmueble pendiente en Legado</Badge>
    </div>
  );
}
