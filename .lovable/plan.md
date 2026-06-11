## Objetivo

Alinear `AdminInspectionDetail.tsx` con `ExecutiveReviewDetail.tsx`: incorporar a los tabs actuales la **data agregada** (owner feedback, contractor pricing, márgenes, breakdown por payer × nature, depósito, descuentos, impuestos, timeline de versiones con feedback) y permitir al admin **ejecutar las mismas acciones del ejecutivo** (publicar moderno, devolver para cambios, aplicar descuento, cerrar feedback manualmente), **manteniendo intactos los poderes admin** (asignar, forzar estado, eliminar, editar fecha llaves con resend HubSpot, ver payload crudo, audit log).

Se reutilizan los componentes de `src/modules/review/components` y `src/pages/executive/review-detail/` para evitar duplicación.

## Estructura final de la página admin

```text
[Header con back + status badge]
[Top Summary Bar] (sin cambios — incluye edición de fecha llaves)
[4-Stage Workflow Stepper] (sin cambios — mantiene "Completar X" admin)
[Acciones Administrativas] (sin cambios — asignar/forzar/eliminar)
[Property Briefing Card] (sin cambios)
[Signature Status] (sin cambios)

[Tabs ampliados]
 ├─ Payload         (sin cambios — Source event + snapshot crudo)
 ├─ Inspección      (sin cambios — edición de campos chips/text/obs)
 ├─ Revisión        (AMPLIADO ↓)
 ├─ Presupuesto     (AMPLIADO ↓)
 ├─ Cotización      (NUEVO)
 └─ Publicación     (NUEVO)

[Audit Log] (sin cambios)
```

## Cambios por sección

### Tab "Revisión" — agregar
- **`PendingDecisionsBanner`** (de `review-detail/`) arriba: secciones sin observación final.
- **Modo "Devolver para cambios"** con checkbox por sección + comentario por sección + botón "Devolver al inspector" (reutilizar `useReviewActions.handleReturnForChanges`).
- Cada tarjeta de sección suma: **subtotal de reparaciones** (ya hay datos), **conteo de owner feedback** decisiones (accepted/rejected/observed) cuando exista versión publicada.

### Tab "Presupuesto" — reemplazar contenido con
- **`RepairsTableView`** (de `review-detail/`) que ya incluye:
  - Selector de contratista
  - Totales: cliente, contratista, utilidad/margen
  - Breakdown por payer × nature (owner obligatoria/opcional, tenant obligatoria/opcional)
  - Comparación con depósito (`warranty_deposit` vs owner-obligatoria)
  - Tabla editable con catálogo, toggle visibilidad, payer/nature, contractor_unit_price
  - Indicador inline de owner feedback (✓/✗/💬 por reparación)
- Quitar el render manual actual (per-section repair cards) que ya está cubierto por `RepairsTableView`.
- Mantener `Sheet` del catálogo del admin (o reusar el de `RepairCatalogSheet`).

### Tab "Cotización" — nuevo
- **`QuotationView`** (de `review-detail/`) con:
  - Subtotales owner/tenant
  - Descuento activo (`useQuotationDiscount`) + botón "Aplicar/Editar descuento" → `QuotationDiscountSheet`
  - Cálculo de impuestos según `market_tax_settings` (`fetchTaxConfig`)
  - Botones "Cotización Propietario" / "Cotización Inquilino" (PDF/diálogo existente `QuotationDialog`)
  - Botón "Cotización Contratista" (`ContractorQuotationDialog`)
  - Botón "Work Order" (`WorkOrderDetailsDialog`)

### Tab "Publicación" — nuevo
- **`PublishView`** (de `review-detail/`) con:
  - Estado de firma + warnings de observaciones faltantes (`MissingObservationsDialog`)
  - Botón **Publicar v(N+1)** que usa el mismo path moderno (reemplaza el `handlePublish` admin actual o lo unifica; mantenemos el actual hasta confirmar que `useReviewActions.publish` cubre todo, incluyendo el sync HubSpot).
  - **`PublishedVersionsTimeline`** (versiones agrupadas owner+tenant con tokens, decisiones owner feedback por versión).
  - **`OwnerFeedbackPanel`** con resumen accepted/rejected/observed y comentarios.
  - **`ManualCloseOwnerFeedbackDialog`** (botón "Cerrar feedback manualmente" — solo ejecutivo/admin, llama RPC `executive_force_close_owner_feedback`).
  - `PublishedUrlsDialog` para copiar/abrir links owner/tenant.

## Cambios técnicos

### 1. Reutilizar hooks de datos
- Reemplazar el `fetchAll` artesanal del admin por **`useReviewDetail(id)`** (mismo hook que el ejecutivo). Agregar en paralelo las queries que el admin necesita y `useReviewDetail` no provee (audit log, source event, all profiles, report versions completas si faltan).
- Agregar **`useOwnerFeedbackByRepair(id)`**, **`useQuotationDiscount(id, profileId)`**, **`fetchTaxConfig(market)`**.
- Construir `actions = useReviewActions({...})` con los mismos parámetros que el ejecutivo (necesita `operationalSections`, `allRepairs`, `repairsBySection`, `photosBySection`, `finalObservations`, `missingSections`, `clientTotal`, `selectedContractorId`, `setSelectedContractorId`, `refetch`).

### 2. Computeds nuevos en el admin
- `allRepairs`, `clientTotal`, `contractorTotal`, `utility`, `budgetBreakdown` (idéntico al ejecutivo).
- `missingSections`, `operationalSections`, `metaSections`.
- `discountState`, `discountBreakdown` con `applyQuotationDiscount`.
- `depositDiff` vs `warranty_deposit`.

### 3. Publicación
- Decisión: **mantener `handlePublish` admin actual** (ya funciona y respeta sync HubSpot vía `syncCheckoutIfApplicable`) **y** además exponer la UI moderna de `PublishView`. El botón de `PublishView` puede delegar al mismo `handlePublish` admin para no duplicar la lógica de inserción de versiones. Validar antes que las shapes del payload coincidan.

### 4. Sin cambios en
- Schema, RPCs, edge functions, RLS.
- `ExecutiveReviewDetail.tsx`.
- Componentes de `review-detail/` (se consumen tal cual).

## Notas

- Vista mantiene `max-w-6xl`; las nuevas vistas (RepairsTableView, QuotationView, PublishView) están diseñadas para ancho completo del workspace ejecutivo. Habrá que **ampliar el contenedor admin a `max-w-7xl`** o quitar el max-width en esos tabs específicos.
- El tab "Inspección" del admin sigue siendo único en el sistema (edición directa de campos del inspector); no se toca.
- Los componentes `MobileReviewView` del ejecutivo no se incorporan al admin (admin es desktop-first).
- Tras el cambio el admin tendrá 6 tabs; si se vuelve denso, evaluar segmentar como dropdown en mobile.
