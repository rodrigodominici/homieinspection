// Canonical app domain, verified via project URL metadata. Never derive the
// production app origin from the dispatch function's (Supabase) request URL.
const CANONICAL_APP_ORIGIN = 'https://app.inspection.homie.mx';

export function publicAppOrigin(configuredOrigin?: string, simulationOrigin?: string) {
  const url = new URL(simulationOrigin ?? configuredOrigin ?? CANONICAL_APP_ORIGIN);
  if (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]') {
    throw new Error('invalid_public_app_origin');
  }
  return url.origin;
}

export function reportLinks(origin: string, inspectionId: string, propertyId: string, tokens: Record<string, string | null>) {
  return {
    report_url: `${origin}/inspections/${encodeURIComponent(inspectionId)}`,
    owner_url: tokens.owner ? `${origin}/reportes/${encodeURIComponent(propertyId)}/${encodeURIComponent(tokens.owner)}` : null,
  };
}

export function publicPhotoUrl(signedUrl: string, simulation: boolean) {
  const url = new URL(signedUrl);
  if (!simulation && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('invalid_public_photo_url');
  }
  return signedUrl;
}