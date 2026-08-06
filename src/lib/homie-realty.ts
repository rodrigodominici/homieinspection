/**
 * Cliente del lookup de inmuebles de Homie (vía edge function `homie-realty-lookup`).
 * El token de la API vive en el backend; el frontend sólo envía el reference-id.
 */
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';

export interface HomieRealty {
  property_id: string;
  property_name: string | null;
  address: string | null;
  property_type: string | null;
  bedrooms_count: number | null;
  bathrooms_count: number | null;
  unit_number: string | null;
  comuna: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  apartment_floor: number | null;
  has_parking: boolean | null;
  parking_number: string | null;
  has_storage: boolean | null;
  storage_number: string | null;
  total_area: number | null;
  price: number | null;
  currency: string | null;
  status: string | null;
}

export async function lookupRealty(referenceId: string): Promise<HomieRealty> {
  const { data, error } = await supabase.functions.invoke('homie-realty-lookup', {
    body: { reference_id: referenceId.trim().toUpperCase() },
  });

  if (error) {
    let details = error.message;
    if (error instanceof FunctionsHttpError) {
      details = await error.context.text();
      try {
        const parsed = JSON.parse(details);
        if (parsed?.error === 'upstream_error' && parsed?.status === 404) {
          throw new Error(`No se encontró el inmueble ${referenceId} en la API de Homie.`);
        }
        if (parsed?.error === 'invalid_reference_id') {
          throw new Error('El ID de inmueble no tiene un formato válido (ej. RE0003927).');
        }
        details = parsed?.details ?? parsed?.error ?? details;
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('No se encontró')) throw e;
        if (e instanceof Error && e.message.startsWith('El ID')) throw e;
      }
    }
    throw new Error(`No se pudo consultar el inmueble: ${details}`);
  }

  const property = (data as { property?: HomieRealty })?.property;
  if (!property) throw new Error('La API no devolvió datos del inmueble.');
  return property;
}
