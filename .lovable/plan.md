# Sincronizar cambios de "fecha de término real" desde HubSpot

Objetivo: cuando en HubSpot cambia la fecha de término real de contrato (o la fecha tentativa de recepción en captación) de un objeto ya vinculado, la inspección en Homie Inspection se actualiza automáticamente, sin duplicar la inspección.

## Cómo funciona

```text
HubSpot workflow (trigger: cambio de propiedad fecha_de_termino_real)
        ↓  webhook POST (con secreto compartido)
Función de backend  hubspot-inspection-date-update
        ↓  busca la inspección por ID de objeto de HubSpot
        ↓  (activo en referencias externas; fallback por property_id)
Actualiza la fecha en la inspección  →  registra en bitácora + log de eventos
        ↓
Se ve al instante en calendarios, listados admin/ejecutivo y ficha del receptor
```

- El webhook es distinto al de creación: no genera inspecciones nuevas, solo actualiza fechas de una existente.
- Si no encuentra inspección para ese objeto, no falla: queda registrado como "sin coincidencia" para revisión en el panel de integración.
- Si la inspección ya está publicada o cerrada, la fecha se actualiza igual pero se marca en la bitácora como cambio posterior al cierre (así el ejecutivo lo ve).
- Idempotente: si llega el mismo valor que ya está guardado, se registra como "sin cambios" y no se toca nada.

## Qué se actualiza

- Check-out: fecha de término real de contrato.
- Captación: la misma propiedad se muestra como "Fecha tentativa de recepción" (ya existe ese mapeo de labels).
- Opcional en el mismo webhook: fecha de recolección de llaves, para no armar otro flujo después.

## Visibilidad para el equipo

- Entrada en la bitácora de la inspección: valor anterior → valor nuevo, origen HubSpot, fecha/hora.
- Registro en el log de eventos de integración, visible en el panel de HubSpot del admin.
- Aviso a Slack al canal de inspecciones cuando la fecha cambia y la inspección aún no está publicada (para que el receptor/ejecutivo reagenden). Se puede dejar apagado si prefieren.

## Detalle técnico

- Nueva función `supabase/functions/hubspot-inspection-date-update/index.ts`:
  - `verify_jwt = false` en `supabase/config.toml`, autenticación por header `x-webhook-secret` comparado con `HUBSPOT_INTAKE_SECRET` (mismo secreto ya existente, comparación timing-safe).
  - Body esperado: `{ source: "hubspot", event_type: "contract_date_updated", payload_version, external_object_id, data: { property_id?, inspection_type?, fecha_de_termino_real_de_contrato?, fecha_recoleccion_llaves? } }`. Validación manual del envelope, igual estilo que el intake.
  - Resolución de la inspección: `inspection_external_references` con `provider='hubspot'`, `is_active=true` y `external_object_id` coincidente (acepta `37395005360` o `hs_contrato_/hs_deal_` con prefijo); fallback por `inspections.property_id` con inspección más reciente no cancelada.
  - Escritura: merge en `property_overrides_json` (que ya tiene precedencia sobre `property_snapshot_json` en `resolvePropertyData`), más `updated_at`.
  - Trazabilidad: fila en `inspection_source_events` (`event_type='contract_date_updated'`, `processing_status='processed'|'skipped'|'failed'`, `failure_reason='no_matching_inspection'` cuando aplique) y fila en `inspection_audit_log` con `action='hubspot_date_update'`, `note` con valor anterior y nuevo, `performed_by = null`.
  - Slack: reutiliza el patrón de `notify-executive-slack` con un `event_type` nuevo; detrás de un flag constante para poder pausarlo.
- Sin cambios de esquema: `property_overrides_json`, `inspection_audit_log` e `inspection_source_events` ya soportan todo esto.
- Frontend: sin cambios funcionales; solo agregar el nuevo `event_type` a la etiqueta de eventos en el panel de logs de HubSpot para que se lea claro.
- Del lado HubSpot (lo configura el equipo): workflow con trigger "fecha_de_termino_real ha cambiado" → acción webhook POST a la URL de la función, con el header del secreto y el `external_object_id` del registro.

## Fuera de alcance

- No se reprocesa la estructura de secciones de la inspección.
- No se cambian estados ni etapas del flujo por un cambio de fecha.
