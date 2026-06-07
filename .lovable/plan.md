# Mejorar visibilidad del feedback del propietario al editar reparaciones

## Problema

Hoy el feedback del propietario (aceptada / observada / rechazada + comentario) sólo se ve en `OwnerFeedbackPanel` dentro del tab **Compartir**. Apenas el ejecutivo hace clic en "Editar y republicar" y va a **Cotización** o **Reparaciones**, pierde de vista qué ítem fue observado/rechazado y qué dijo el propietario — tiene que volver atrás para recordarlo.

## Objetivo

Que el feedback del propietario "viaje" con cada reparación dentro de las vistas de edición, marcando claramente qué ítems requieren acción y mostrando el comentario al lado del ítem que se está editando.

## Cambios propuestos

### 1. Hook compartido `useOwnerFeedbackByRepair`

Nuevo archivo: `src/modules/review/api/useOwnerFeedbackByRepair.ts`

- Carga `inspection_report_versions` (audience=owner, is_latest=true) + filas de `inspection_owner_feedback` para esa versión.
- Devuelve `{ feedbackByRepairId: Map<string, { decision, comment, submitterName, submittedAt }>, version, hasPendingFeedback }`.
- Usa React Query con key `['owner-feedback', inspectionId]` para compartir caché entre tabs y refetch al republicar.

### 2. Badge reutilizable `OwnerFeedbackBadge`

Nuevo archivo: `src/pages/executive/review-detail/OwnerFeedbackBadge.tsx`

- Recibe `decision` + opcionalmente `comment`.
- Renderiza un badge compacto (Observada amber / Rechazada red / Aceptada emerald) consistente con `OwnerFeedbackPanel`.
- Variante con tooltip que muestra el comentario completo al hover.

### 3. `SectionRepairsPanel.tsx` — inline en el item expandido

- Aceptar prop `feedbackByRepairId` opcional.
- En la **fila compacta** del repair: si hay feedback no-aceptado, mostrar el `OwnerFeedbackBadge` junto al título (antes del subtotal).
- En el **editor expandido**: agregar un callout arriba (border-l amber/red) con la decisión y la cita textual del comentario del propietario.
- El borde de la tarjeta del repair pasa a `border-amber-500/40` u `border-red-500/40` cuando hay feedback pendiente, para que el ejecutivo identifique de un vistazo qué tocar.

### 4. `RepairsTableView.tsx` — columna y filtro

- Aceptar `feedbackByRepairId`.
- En cada fila de la tabla agregar el badge de feedback junto al nombre.
- Agregar nuevo `ToggleGroup` (visible sólo cuando hay feedback): **Todas / Con feedback pendiente**, que filtra a las filas con `decision !== 'accepted'`.
- Aplicar fondo `bg-amber-50/40` o `bg-red-50/40` sutil a las filas con feedback.

### 5. `QuotationView.tsx` — banner contextual + marcado por sección

- Si `hasPendingFeedback`, mostrar un banner sticky/condensado arriba con: "El propietario pidió ajustes en N reparaciones" + botón "Filtrar pendientes" (que pone foco en las secciones afectadas).
- Para cada repair listado, marcar visualmente los ítems con feedback (badge + borde).

### 6. Cableado en `ExecutiveReviewDetail.tsx`

- Llamar `useOwnerFeedbackByRepair(id)` una vez.
- Pasar `feedbackByRepairId` a `QuotationView`, `RepairsTableView`, `SectionRepairsPanel` (inline y vía `SectionRepairsDrawer`).
- `OwnerFeedbackPanel` puede consumir el mismo hook para evitar la query duplicada (refactor menor).

### 7. Indicador en la navegación

- En `WorkflowStepper` / tab "Cotización" del review: si `hasPendingFeedback`, mostrar un punto ámbar (•) en el tab para recordar al ejecutivo que hay pendientes — sin cambiar la lógica del flujo.

## Lo que NO cambia

- Estructura de tablas, RPC `get_published_report`, lógica de publicación/versionado.
- `OwnerFeedbackPanel` sigue existiendo en Compartir como vista resumen.
- No se modifica el reporte público del propietario/inquilino.

## Archivos afectados

- **Nuevo**: `src/modules/review/api/useOwnerFeedbackByRepair.ts`
- **Nuevo**: `src/pages/executive/review-detail/OwnerFeedbackBadge.tsx`
- **Editado**: `SectionRepairsPanel.tsx`, `SectionRepairsDrawer.tsx`, `RepairsTableView.tsx`, `QuotationView.tsx`, `ExecutiveReviewDetail.tsx`, `WorkflowStepper.tsx`, `OwnerFeedbackPanel.tsx` (refactor a hook compartido).

¿Apruebas el plan o quieres ajustar algún punto antes de implementar?
