# Diagnóstico

La inspección de captación de `RE0005225` no se está creando por el mismo motivo que vimos antes con el check_out: existe un `inspection_source_events` huérfano que el intake considera duplicado.

**Registro encontrado:**

- `inspection_source_events.id`: `f993e892-79a4-4a7b-881b-c21cde02c865`
- `source`: `hubspot`
- `external_event_id`: `hs_evt_publicacion_61113487799` (Deal de Publicaciones CL — captación)
- `processing_status`: `completed`
- `inspection_id`: `469dc041-0e4e-4177-af0b-ce72d8ba90aa` → **no existe** en `inspections`
- `processed_at`: 2026-06-17 02:48

Cuando HubSpot reenvía el payload, el intake dedupea por `(source, external_event_id)`, ve `completed`, y devuelve `duplicate` sin recrear. Mismo patrón que con `hs_evt_contrato_…`.

El `handleDelete` que actualizamos en `AdminInspectionDetail.tsx` ya limpia el `source_event` al borrar la inspección, pero **esta inspección (`469dc041…`) se eliminó antes de esa mejora**, por lo que quedó huérfana.

# Acción

1. **Borrar el source_event huérfano** vía `supabase--insert`:
   ```sql
   DELETE FROM public.inspection_source_events
   WHERE id = 'f993e892-79a4-4a7b-881b-c21cde02c865';
   ```
2. Pedirte que reenvíes el webhook de HubSpot del Deal `61113487799`. El intake lo tratará como evento nuevo y creará la inspección de captación con los labels y mapeo de objeto Deal (`0-3`) que ya implementamos.

# Verificación posterior

- Confirmar que aparece una nueva fila en `inspection_source_events` con `processing_status='completed'` e `inspection_id` válido apuntando a una `inspections` con `property_id='RE0005225'` e `inspection_type='captacion'`.
- Confirmar en logs de `hubspot-inspection-intake` que no se devolvió `duplicate`.

# No incluido

- No se toca el código de `handleDelete` (ya cubre este escenario para futuras eliminaciones).
- No se modifica esquema ni lógica del intake.
