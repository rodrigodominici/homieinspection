# Soporte para inspecciones tipo `captacion`

## Contexto y reglas

- El campo en BD `fecha_de_termino_real_de_contrato` **no cambia** — sólo cambia el label visible según `inspection_type`.
- No se toca la creación de inspecciones ni el formulario del inspector — sólo labels y la sincronización saliente a HubSpot.
- Mapeo por tipo:
  - `check_out` → Contrato Arriendo (custom `2-47492934`), prefijo `hs_contrato_`, contacto = Inquilino, label fecha = "Fecha de término de contrato".
  - `captacion` → Deal estándar (pipeline Publicaciones CL `648473866`), prefijo `hs_deal_`, contacto = Propietario, label fecha = "Fecha Tentativa de Recepción".

> **Deuda técnica registrada:** el key `fecha_de_termino_real_de_contrato` (dentro de `property_snapshot_json` / `property_overrides_json` y en el payload del intake de HubSpot) queda con nombre semánticamente sesgado a `check_out`. Renombrarlo a algo neutro (`fecha_operacion_principal` o similar) implica coordinar el contrato del webhook entrante, migrar datos JSONB existentes y actualizar ~15 sitios. Se difiere a un refactor aislado posterior con doble escritura + migración + deprecación del key viejo.

---

## CAMBIO 1 — Helpers compartidos para labels dinámicos

Crear `src/lib/inspection-type-labels.ts`:

```ts
export type InspectionType = 'check_out' | 'captacion' | string | null | undefined;

export const getContractDateLabel = (t: InspectionType) =>
  t === 'captacion' ? 'Fecha Tentativa de Recepción' : 'Fecha de término de contrato';

export const getContractDateShortLabel = (t: InspectionType) =>
  t === 'captacion' ? 'Recepción tentativa' : 'Término de contrato';

export const getPrimaryContactLabel = (t: InspectionType) =>
  t === 'captacion' ? 'Propietario' : 'Inquilino';

export const getInspectionTypeLabel = (t: InspectionType) =>
  t === 'captacion' ? 'Captación' : 'Check-out';
```

Aplicar en todos los sitios donde aparece el label hardcodeado de fecha de término o "Inquilino" **como contacto principal de la inspección** (NO en labels de roles de pago `payer_role='tenant'`, ni en "Cotización Inquilino", ni en "Firma del Inquilino" — son conceptos distintos).

**Sitios de fecha (cambio "Término de contrato" → label dinámico):**
- `src/components/PropertyBriefingCard.tsx` (línea ~128)
- `src/pages/inspector/InspectorAllInspections.tsx` (línea ~194)
- `src/pages/inspector/InspectorDashboard.tsx` (línea ~216)
- `src/pages/inspector/InspectorCalendar.tsx` (línea ~351)
- `src/pages/inspector/InspectorInspectionDetail.tsx` (~línea 530)
- `src/pages/admin/AdminInspections.tsx` (línea ~782)
- `src/pages/admin/AdminSchedule.tsx` (líneas ~236, ~305)
- `src/pages/executive/ExecutiveSchedule.tsx` (líneas ~274, ~345)
- `src/pages/executive/ExecutiveReviewQueue.tsx` (~línea 426-434)
- `src/pages/executive/review-detail/PropertyContextBar.tsx`
- `src/pages/admin/AdminInspectionDetail.tsx` (~línea 998)

**Sitios de contacto principal (cambio "Inquilino" → label dinámico):**
- `src/components/PropertyBriefingCard.tsx` ya lo hace (línea 38) — migrar al helper.
- `src/pages/executive/review-detail/PropertyContextBar.tsx` (líneas 65, 80).
- `src/pages/inspector/InspectorInspectionDetail.tsx` (líneas 616, 620: "Inquilino se negó a firmar", "Inquilino no disponible").

**Sitios que NO se tocan** (roles de pago / conceptos distintos):
- `RepairsTableView`, `BudgetSummaryBar`, `SectionRepairsPanel`, `QuotationView`, `QuotationDialog`, `PublishedUrlsDialog`, `OwnerReport.tsx` (audienceLabel), firma del inquilino como sección del formulario, `AdminSettings.tsx` tabla descriptiva del template.

---

## CAMBIO 2 — Sincronización saliente HubSpot por tipo

**`supabase/functions/hubspot-update-inspection/index.ts`:**

1. Incluir `inspection_type` en el SELECT de inspecciones (línea 177).
2. `deriveNumericId(raw, inspectionType)`:
   ```ts
   const prefix = inspectionType === 'captacion' ? /^hs_deal_/i : /^hs_contrato_/i;
   ```
3. Resolver tipo de objeto externo y URL según tipo:
   ```ts
   const isCaptacion = inspection.inspection_type === 'captacion';
   const externalObjectType = isCaptacion ? 'deal' : 'lease_contract';
   const objectTypeForUrl = isCaptacion ? 'deals' : encodeURIComponent(objectTypeId);
   const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${objectTypeForUrl}/${numericId}`;
   ```
4. Ajustar el filtro `.eq('external_object_type', externalObjectType)` en la query a `inspection_external_references`.
5. Mantener los HubSpot property names actuales (`fecha_de_recoleccion_de_llaves`, `fecha_de_recepcion_del_checkout`) — **pendiente confirmar** que los Deals de Publicaciones CL exponen esos mismos internal names; si no, agregar mapeo por tipo.

**`supabase/functions/hubspot-inspection-intake/index.ts` (líneas 360-420):**

Al persistir `inspection_external_references`, detectar tipo:

```ts
const isCaptacion = body.inspection_type === 'captacion';
const externalObjectType = isCaptacion ? 'deal' : 'lease_contract';
const externalObjectTypeId = isCaptacion ? '0-3' : '2-47492934';
```

Redeploy: `hubspot-update-inspection`, `hubspot-inspection-intake`.

---

## CAMBIO 3 — Documentación en pantalla Configuración

Reemplazar la sección "Sincronización HubSpot saliente" en `src/pages/admin/AdminIntegrationHubSpot.tsx` (líneas 226-273) por una tabla con 4 filas (check_out × 2 eventos + captacion × 2 eventos) con Tipo / Evento / Campo HubSpot / Objeto destino / Estado.

---

## Verificación

1. Build limpio.
2. Inspección visual de vistas clave con una `check_out` y una `captacion`.
3. Disparar `hubspot-update-inspection` con una captación de prueba y revisar `hubspot_sync_log` (status `success`, `hubspot_object_type_id='0-3'`).

---

## Preguntas abiertas

1. ¿Los campos del Deal Publicaciones CL se llaman exactamente `fecha_de_recoleccion_de_llaves` y `fecha_de_recepcion_del_checkout`? Si difieren, necesito los internal names.
2. ¿Hay captaciones ya cargadas en BD con `inspection_external_references.external_object_type='lease_contract'` por error? Si sí, agregar `UPDATE` puntual al rollout.
