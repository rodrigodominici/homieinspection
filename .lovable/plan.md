# Historial de cotizaciones + aprobación final del propietario

## Contexto

La base de datos ya persiste todo lo necesario:

- **Cotizaciones**: `inspection_report_versions` guarda un snapshot completo (`normalized_payload`) por cada publicación/republicación, con `version_number`, `audience`, `published_at`, `published_by`, `public_token` e `is_latest`.
- **Aprobación final**: `inspections.owner_feedback_status='accepted'` + `approved_at` + `approved_by`, complementado con `inspection_owner_feedback_submissions` (incluye cierre manual con motivo) e `inspection_audit_log`.

Falta exponerlo en la UI del ejecutivo. No hay cambios de esquema ni de RPC de escritura. Tampoco se tocan los links públicos: solo `is_latest=true` sigue siendo accesible externamente.

## Alcance

### 1. Timeline de cotizaciones publicadas
Nuevo componente `PublishedVersionsTimeline` dentro de `PublishView.tsx`, ubicado bajo el card "Compartir reporte" (visible solo cuando `isPublished`).

Por cada versión (audiencia `owner`, orden desc):
- Etiqueta `v{n}` + chip "Vigente" si `is_latest`.
- Fecha de publicación y nombre del ejecutivo (`published_by` → `profiles.full_name`).
- Acciones:
  - **Ver snapshot interno**: abre un `Sheet` lateral con el `normalized_payload` renderizado en modo solo lectura (reusa la vista de `OwnerReport` pero forzando los datos del payload de esa versión, sin pasar por `get_published_report`).
  - **Copiar resumen** (totales: # reparaciones, total cliente) — opcional, secundario.
- Los links públicos siguen apuntando solo a la vigente; versiones anteriores **no** exponen `public_token` en UI.

### 2. Resumen de aprobación final
Reforzar `OwnerFeedbackPanel.tsx`: cuando `owner_feedback_status='accepted'`, mostrar un bloque consolidado siempre visible con:
- **Quién aprobó**: nombre tomado del último `inspection_owner_feedback_submissions` (propietario directo) o del `closed_by_name` dentro de `summary_json` si `manual_closure=true` (cierre por ejecutivo).
- **Cuándo**: `submitted_at` de esa fila / `inspections.approved_at`.
- **Tipo**: badge "Aprobada por propietario" o "Cierre manual · {motivo}".

Esta info ya se carga en el panel; solo es un refactor de presentación para que siempre quede como tarjeta resumen arriba del historial de submissions actual.

### 3. Acceso interno a snapshots antiguos
Las versiones anteriores se leen directo de la tabla (RLS ya permite a ejecutivo/admin). No se crea RPC nueva — el cliente hace `select` filtrado por `inspection_id` y `audience='owner'`.

## Detalles técnicos

**Nuevo hook** `useReportVersionsHistory(inspectionId)` en `src/modules/review/api/`:
- `select id, version_number, published_at, published_by, is_latest, normalized_payload, owner_decision_summary_json from inspection_report_versions where inspection_id = ? and audience = 'owner' order by version_number desc`
- Join lateral con `profiles` para `published_by_name` (separado en 2 queries para evitar embed complicado).
- React Query key: `['report-versions', inspectionId]`, `staleTime: 60s`.

**Nuevo componente** `PublishedVersionsTimeline.tsx` en `src/pages/executive/review-detail/`:
- Lista vertical con dot indicator.
- `Sheet` (shadcn) para mostrar snapshot: monta un componente `OwnerReportPreview` que recibe el `normalized_payload` como prop y renderiza el mismo layout que `OwnerReport.tsx` pero sin lógica de feedback (read-only). Para no duplicar mucho, se extrae el renderer puro de `OwnerReport` a `OwnerReportContent` y se reusa.

**Refactor en `OwnerFeedbackPanel.tsx`**:
- Nuevo subcomponente local `FinalApprovalSummary` que recibe `submissions` + `inspection.approved_at/by` y resuelve quién/cuándo/tipo.
- Se renderiza cuando `owner_feedback_status === 'accepted'`, encima del listado actual.

**Sin cambios** en: `submit_owner_feedback`, `executive_force_close_owner_feedback`, `get_published_report`, esquema de tablas, RLS, links públicos.

## Validación

- Inspección con 3 publicaciones → timeline muestra v3 (vigente), v2, v1 con fechas/autores correctos; abrir v1 muestra el snapshot histórico.
- Aprobación por propietario → tarjeta resumen muestra nombre del submitter y fecha.
- Cierre manual del ejecutivo → tarjeta muestra "Cierre manual · {motivo}" + nombre del ejecutivo.
- Links públicos: copiar link sigue funcionando solo para la versión vigente; abrir un `public_token` de versión anterior sigue dando el reporte vigente (comportamiento actual no cambia).
