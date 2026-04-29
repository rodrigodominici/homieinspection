
# MVP Comunicaciones Transaccionales

Módulo desacoplado para disparar comunicaciones (WhatsApp / email) ante eventos del sistema, configurable desde UI sin tocar código.

---

## Arquitectura — 4 capas

```text
[Acción de negocio]
   │ emite
   ▼
[Evento del sistema] ──► [Reglas activas] ──► [Template] ──► [Provider Adapter] ──► [Delivery log]
```

- **Eventos**: catálogo fijo en código (no editable en UI en MVP).
- **Reglas**: configurables (activa, canal, proveedor, template, destinatario, mercado).
- **Templates**: mapeo interno → template real del proveedor.
- **Deliveries**: trazabilidad completa (1 fila por intento).

El core de inspecciones nunca llama a un SDK de proveedor. Solo emite eventos.

---

## 1. Modelo de datos

Migración nueva con 3 tablas:

### `communication_rules`
`id, name, event_name, is_active, channel, provider_key, template_key, recipient_type, market, conditions_json, created_at, updated_at`

### `communication_templates`
`id, template_key (unique), name, channel, provider_key, market, language, external_template_name, variables_json, preview_text, is_active, created_at, updated_at`

### `communication_deliveries`
`id, event_name, inspection_id (FK set null), rule_id (FK set null), channel, provider_key, recipient_type, recipient_value, template_key, request_payload_json, response_payload_json, status (pending|sent|error|skipped), error_message, provider_message_id, created_at, sent_at`

Índices: `(inspection_id)`, `(event_name)`, `(status)`, `(created_at desc)`.

**RLS**: solo admin gestiona reglas/templates; ejecutivos pueden leer deliveries de inspecciones asignadas; service role escribe deliveries desde la edge function.

---

## 2. Catálogo de eventos (código)

`src/lib/communications/events.ts`:

```ts
export const COMMUNICATION_EVENTS = {
  INSPECTION_ASSIGNED_INSPECTOR: 'inspection.assigned.inspector',
  INSPECTION_PUBLISHED_OWNER:    'inspection.published.owner',
  INSPECTION_PUBLISHED_TENANT:   'inspection.published.tenant',
} as const;
```

Cada evento documenta: payload esperado, recipient_types soportados, variables disponibles para template.

---

## 3. Emisión

Helper cliente `src/lib/communications/emit.ts`:

```ts
emitCommunicationEvent({ eventName, inspectionId, payload })
  → supabase.functions.invoke('process-communication-event', { body })
```

Llamadas a insertar:

- `AdminInspections.tsx` línea 216 (asignar inspector) → emite `inspection.assigned.inspector`.
- `AdminInspectionDetail.tsx` línea 438 (insert versions) → emite `inspection.published.owner` y `inspection.published.tenant`.
- `ExecutiveReviewDetail.tsx` línea 396 (insert versions) → idem.

Emisión es **fire-and-forget** (no bloquea flujo). Errores van a console + delivery con status `error`.

---

## 4. Edge function `process-communication-event`

`supabase/functions/process-communication-event/index.ts` (verify_jwt = false, autenticada por service role internamente).

Flujo:

1. Valida payload con Zod (`event_name`, `inspection_id`, `payload`).
2. Carga inspección + snapshot + tenant/owner data.
3. Busca `communication_rules` activas para `event_name` (filtrado por `market` si aplica).
4. Para cada regla:
   - Resuelve destinatario según `recipient_type`:
     - `inspector` → `profiles` vía `inspector_id` (phone/email).
     - `owner` → `property_snapshot_json.recipient_email` u owner data.
     - `tenant` → `tenant_whatsapp` / `tenant_email` del snapshot.
   - Carga `communication_templates` por `template_key`.
   - Renderiza variables (substitución simple `{{var}}`).
   - Llama provider adapter.
   - Inserta `communication_deliveries` con status final.
5. Si no hay reglas o falta destinatario → registra `skipped` con `error_message` explicativo.

---

## 5. Provider adapters

`supabase/functions/_shared/communication-providers/`:

- `index.ts` — interface `Provider { send(payload): Promise<{ id?, raw }> }` + registry por `provider_key`.
- `mock.ts` — provider de pruebas que solo loguea y devuelve id ficticio.
- `whatsapp-darwin.ts` — stub que devuelve "not_configured" hasta tener credenciales.
- `email-resend.ts` — stub idem.

MVP usa `mock` por defecto. Agregar providers reales después sin tocar el core.

---

## 6. UI Admin

Nueva sección en sidebar admin: **Comunicaciones**.

### `/admin/comunicaciones/reglas`
- Lista de reglas con toggle activa/inactiva.
- Crear/editar regla: nombre, evento (select del catálogo), canal, proveedor, template (select de templates compatibles), recipient_type, market.
- `conditions_json` queda como textarea JSON crudo (preparado para builder futuro).

### `/admin/comunicaciones/templates`
- Lista + crear/editar: template_key, nombre, canal, proveedor, external_template_name, variables (lista chips), preview_text, idioma, mercado.

### `/admin/comunicaciones/historial`
- Tabla de `communication_deliveries` con filtros: evento, status, canal, fechas, búsqueda por inspection_id.
- Drawer de detalle con request/response JSON.

Rutas registradas en `App.tsx` y enlace en `AdminLayout.tsx`.

---

## 7. Files a crear/modificar

**Nuevos**
- `supabase/migrations/<ts>_communications_module.sql`
- `supabase/functions/process-communication-event/index.ts`
- `supabase/functions/_shared/communication-providers/{index,mock,whatsapp-darwin,email-resend}.ts`
- `src/lib/communications/{events,emit,types}.ts`
- `src/pages/admin/AdminCommunicationRules.tsx`
- `src/pages/admin/AdminCommunicationTemplates.tsx`
- `src/pages/admin/AdminCommunicationHistory.tsx`
- `supabase/config.toml` → `[functions.process-communication-event] verify_jwt = false`

**Modificados**
- `src/pages/admin/AdminInspections.tsx` (emitir al asignar)
- `src/pages/admin/AdminInspectionDetail.tsx` (emitir al publicar)
- `src/pages/executive/ExecutiveReviewDetail.tsx` (emitir al publicar)
- `src/App.tsx` (rutas)
- `src/components/AdminLayout.tsx` (nav)

---

## 8. Fuera de alcance MVP

- Cola/retry sofisticado (deliveries falladas se reintentan manualmente desde UI en V2).
- Builder visual de condiciones.
- Templates aprobados Meta (se referencian por nombre, no se crean).
- Eventos creables desde UI.
- Webhooks de status del proveedor (delivered/read).

---

## Resumen final tras implementar

- Modelo de 3 tablas + catálogo de eventos en código.
- Helper `emitCommunicationEvent` invocado en 3 puntos del flujo.
- Edge function evalúa reglas, resuelve destinatario, llama adapter, registra delivery.
- 3 pantallas admin: reglas, templates, historial.
- Provider adapters intercambiables; MVP usa mock hasta enchufar Darwin/Resend.
