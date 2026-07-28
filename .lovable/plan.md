## Diagnóstico

El renderer del reporte público (`src/pages/public/OwnerReport.tsx`, líneas 901-920) ya muestra la firma si `report.signature.signature_data` existe. El publish (`publishInspection`) también ya adjunta la firma al `normalized_payload` desde el fix anterior.

El problema: los reportes que el usuario está viendo fueron **publicados antes** de ese fix, por lo que su `normalized_payload` no tiene `signature`. La RPC `get_published_report` devuelve el payload tal cual, así que la firma nunca aparece salvo que se re-publique cada inspección.

Mismo patrón que ya resolvimos para `fecha_recoleccion_llaves`: la RPC hace fallback a la tabla origen cuando el payload no la trae.

## Cambios

1. **Migración SQL** — actualizar `public.get_published_report(p_property_id, p_token)`:
   - Si `result->'signature'` es `NULL`, hacer `SELECT signer_name, signature_data, signed_at FROM inspection_signatures WHERE inspection_id = v_inspection_id AND signature_status = 'signed' AND signature_data IS NOT NULL`.
   - Si hay fila, mergear al retorno: `|| jsonb_build_object('signature', jsonb_build_object('signer_name', ..., 'signature_data', ..., 'signed_at', ...))`.
   - Si no hay firma en payload ni en tabla, dejar `signature = null` (el renderer ya tolera).
   - Mantener el resto de la lógica intacta (audience, fecha, locked, decisions, status).

No se toca el frontend: ya renderiza correctamente. No se toca `publishInspection`: los nuevos publish ya llevan la firma; el fallback cubre los históricos.

## Verificación

- Consultar en dev: `SELECT public.get_published_report('<property_id>', '<token>') -> 'signature'` para un reporte antiguo con firma en `inspection_signatures` → debe retornar el objeto con `signature_data`.
- Abrir uno de los 7 reportes publicados en el preview y confirmar que la tarjeta "Firma del inquilino" aparece bajo el tab "Reporte".
