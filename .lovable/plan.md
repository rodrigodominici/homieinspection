## Objetivo

Eliminar completamente el flujo y estado `needs_changes` del producto. El ejecutivo solo podrá **aprobar** o seguir revisando — no podrá devolver al inspector. Una vez que el inspector envía (`submitted`), la inspección avanza linealmente hasta `published`.

## Flujo resultante

```text
assigned → in_progress → submitted → in_review → approved → published
```

Sin ramas hacia atrás. Sin botón "Devolver". Sin tarjetas KPI de "En corrección".

---

## Cambios por capa

### 1. Backend / Lógica de acciones
- `src/modules/review/api/inspection-actions.service.ts`: eliminar `requestChanges()` y la interfaz `RequestChangesArgs`.
- `src/modules/review/api/useReviewActions.ts`: remover el handler `requestChanges` y cualquier estado asociado (selección de secciones, comentarios por sección, modo "request changes").

### 2. UI Ejecutivo (devolver secciones)
- Borrar `src/pages/executive/review-detail/RequestChangesPanel.tsx`.
- `ReviewHeaderBar.tsx`: quitar botón/acción "Solicitar cambios" / "Devolver".
- `PublishView.tsx`: quitar entry point a request changes.
- `SectionSidebar.tsx` / `SectionWorkspace.tsx`: quitar checkboxes de selección para devolución y textareas de comentarios de revisión, si existen.
- `MobileReviewView.tsx`: quitar acción equivalente en mobile.

### 3. UI Inspector (recibir correcciones)
- `InspectorDashboard.tsx`: eliminar el cómputo `needsAttention` y la sección/badge "Requiere correcciones".
- `InspectorSectionComplete.tsx`: quitar el bloque que muestra comentarios de `revision_request` cuando `status = needs_changes`.
- `InspectorInspectionDetail.tsx`: quitar lógica de reenvío específica para `needs_changes` (el reenvío normal `submitted` se mantiene si aplica desde otros estados, si no se elimina).
- `InspectorStatusBadge.tsx` / `InspectorAllInspections.tsx`: remover handling visual de `needs_changes`.

### 4. KPIs y filtros
- `src/lib/inspection-buckets.ts`: remover `needsChanges` del KPI y del cálculo.
- `src/pages/admin/AdminDashboard.tsx`: eliminar tarjeta "En corrección".
- `src/pages/executive/ExecutiveReviewQueue.tsx`: eliminar KPI "En corrección" y filtro asociado.
- `src/pages/admin/AdminInspections.tsx`: remover `needs_changes` de filtros de estado.

### 5. Tipos y registro de estados
- `src/lib/types.ts`: remover `'needs_changes'` de `InspectionStatus` y de `SectionStatus`.
- `src/shared/ui/status-registry.ts`: borrar entradas `needs_changes` de `INSPECTION_STATUS` y `SECTION_STATUS`. Considerar conservar un fallback silencioso (vía el `?? { label: s, tone: "neutral" }` ya existente) para no romper si quedan datos legacy.
- `src/lib/inspection-status-guard.ts`: revisar y limpiar referencias.

### 6. Datos existentes
- **Estado en DB**: hoy hay **0 inspecciones** con `status = 'needs_changes'`, así que no se requiere migración de datos para `inspections`.
- Verificar `inspection_sections.status = 'needs_changes'` (puede haber filas históricas de pruebas). Si existen, normalizarlas a `in_progress` o `completed` según corresponda mediante una operación de datos puntual.
- `inspection_reviews` con `comment_type = 'revision_request'`: mantener como histórico (no se borran), pero ya no se generarán nuevos.
- No se modificará el enum/columna a nivel SQL en esta iteración para evitar romper datos históricos; el valor simplemente deja de ser escrito y deja de aparecer en la UI.

### 7. Documentación
- `docs/PRODUCT_LOGIC.md`: actualizar la sección del workflow de revisión para reflejar el flujo lineal sin devolución.
- Actualizar memoria `mem://features/review-workflow` removiendo cualquier referencia a "needs_changes" / "Solicitar cambios".

---

## Detalles técnicos clave

- **Decisión: no se hace `ALTER TYPE` para quitar el valor del enum** en esta iteración. Postgres no permite eliminar valores de enum sin recrearlo, y mantenerlo no causa daño dado que ya no se escribirá. Si más adelante se quiere limpiar el enum, se hará en una migración dedicada.
- El tipo TS de `InspectionStatus` sí se reduce, lo que dará error de compilación en cualquier lugar que aún referencie el literal — útil como red de seguridad para encontrar restos.
- `SectionStatus` se reduce análogamente.

## Fuera de alcance

- No se tocan reportes públicos ni feedback del propietario.
- No se modifica la lógica de `approved → published`.
- No se borran comentarios históricos de `inspection_reviews`.

## Verificación

1. Build TS pasa sin errores tras la poda de tipos.
2. `rg "needs_changes"` solo devuelve coincidencias en `docs/`, comentarios o migraciones históricas — nada en código activo.
3. Dashboard Admin y Executive Queue ya no muestran tarjeta "En corrección".
4. Detalle ejecutivo no muestra botón "Devolver" ni panel de selección de secciones.
5. Inspector no ve sección "Requiere correcciones" ni comentarios de revisión.
