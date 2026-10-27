import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/** HubSpot sprocket logo (brand color kept intentionally). */
function HubSpotLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#FF7A59"
        d="M18.16 7.58V4.73a2.2 2.2 0 0 0 1.27-1.98V2.7A2.2 2.2 0 0 0 17.24.5h-.07a2.2 2.2 0 0 0-2.19 2.2v.06a2.2 2.2 0 0 0 1.27 1.98v2.84a6.23 6.23 0 0 0-2.96 1.3L5.47 2.95a2.47 2.47 0 1 0-1.16 1.5l7.68 5.97a6.25 6.25 0 0 0 .1 7.04l-2.34 2.34a2 2 0 0 0-.58-.1 2.03 2.03 0 1 0 2.03 2.03 2 2 0 0 0-.1-.58l2.31-2.31a6.26 6.26 0 1 0 4.75-11.26m-.96 9.4a3.21 3.21 0 1 1 0-6.42 3.21 3.21 0 0 1 0 6.42"
      />
    </svg>
  );
}

/** MX captaciones whose property is not yet in Legado: link to the HubSpot deal (admins/executives). */
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
          <HubSpotLogo className="h-4 w-4 mr-1.5" /> Ver negocio en HubSpot
        </a>
      </Button>
      <Badge variant="secondary" className="font-normal text-muted-foreground">Inmueble pendiente en Legado</Badge>
    </div>
  );
}
