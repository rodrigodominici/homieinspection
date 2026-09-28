# Marcar "checkin_hi_completo = Sí" en HubSpot al finalizar un check-in

## Qué cambia
Cuando un Property Advisor, un Ejecutivo o un Admin finaliza una inspección de **check-in**, la app avisa a HubSpot y marca el campo **checkin_hi_completo** con el valor **"Sí"** en el contrato de arriendo vinculado. Esto no aplica a captación ni a check-out.

- El envío no frena la finalización: si HubSpot falla, la inspección queda finalizada igual, el error queda en el registro de sincronización y se puede reintentar desde el panel actual.
- Cada envío queda registrado igual que los de hoy (fecha de recolección de llaves y recepción del checkout).

## Por confirmar
- El valor interno del campo en HubSpot: asumo que es **"Sí"** tal cual (si es una casilla o un desplegable con valor interno `true`/`si`, lo ajusto).
- El objeto: asumo que es el **Contrato de Locación** (el mismo al que ya se vincula el check-in al llegar desde HubSpot).

## Detalles técnicos
- `supabase/functions/hubspot-update-inspection/index.ts`: nueva acción `checkin_completed`, que envía `{ properties: { checkin_hi_completo: 'Sí' } }` y no usa fecha. Solo se acepta si `inspection_type = 'check_in'` y el estado es `sent`. Usa el objeto de contrato `2-47492934` con el id `hs_contrato_<id>` que ya viene en `inspection_external_references`.
- `retry-hubspot-sync`: aceptar la nueva acción para poder reintentar.
- `src/lib/hubspot-sync.ts`: nueva función `triggerCheckinCompletedSync(inspectionId)`, que no bloquea.
- `FinalizeInspectionButton.tsx` (y cualquier otro camino que finalice un check-in): llamarla cuando el RPC `finalize_inspection` responde bien en un check-in.
- Desplegar las funciones y probar con la inspección DEMO de check-in: revisar la fila en `hubspot_sync_log`.
