## Problema

Cuando una inspección queda en `status = 'approved'` + `owner_feedback_status = 'accepted'` (cierre manual del loop de feedback sin publicación, o aceptación post-cierre), el sistema la sigue tratando como "aprobada lista para publicar":

- **Bandeja ejecutiva** la mete en el bucket `action` ("Requieren tu acción").
- **Botón contextual** de la tarjeta dice "Publicar".
- **Cabecera de Review (ejecutivo)** muestra el CTA "Publicar".
- **Detalle de Admin** muestra "Publicar y Generar URL" porque la stage es `share` y no hay `published_at`.

El status combinado ya la marca correctamente como "Aceptada por propietario" (estado terminal), pero los buckets y CTAs no consultan `owner_feedback_status`, por lo que aparece como pendiente de acción en ambas vistas.

## Cambios

### 1. `src/pages/executive/ExecutiveReviewQueue.tsx`

- `getExecutiveBucket`: tratar `status === 'approved' && owner_feedback_status === 'accepted'` como `follow_up` (cerrada), no como `action`.
- `getContextualCTA`: cuando una inspección está aceptada por propietario, devolver `"Ver detalle"` (variant `outline`) en vez de "Publicar"/"Abrir reporte".
- Reusar los helpers existentes `isAcceptedByOwner` / `getCombinedInspectionStatus` de `src/lib/inspection-combined-status.ts` para no duplicar lógica.

### 2. `src/pages/executive/review-detail/ReviewHeaderBar.tsx`

- Ocultar el botón "Publicar" cuando `isAcceptedByOwner(inspection)` sea verdadero (status `approved` + feedback `accepted`). El ciclo ya está cerrado: no debe haber CTA de publicación.
- Si además no hay `published_at`, mostrar únicamente el badge combinado "Aceptada por propietario" sin acciones de publicación/republicación.

### 3. `src/pages/admin/AdminInspectionDetail.tsx` (líneas ~1090-1094)

- En la barra de acciones por stage, ocultar "Publicar y Generar URL" cuando `owner_feedback_status === 'accepted'`. Mostrar en su lugar un texto/badge informativo: "Ciclo cerrado por el propietario" (sin acción), consistente con la vista ejecutiva.
- Mantener "Republicar" disponible solo si `isPublished === true` (no se introduce cambio aquí, solo se evita el botón de primera publicación cuando ya fue aceptada).

### 4. (Opcional, consistencia) `src/pages/admin/AdminInspections.tsx`

- Verificar que el KPI "Para publicar" ya excluye `owner_feedback_status === 'accepted'` (línea 365: ya lo hace). No requiere cambio.
- En la tabla, si hay un CTA inline tipo "Publicar", aplicar la misma regla que en el ejecutivo.

## Fuera de alcance

- No se cambia el modelo de datos ni los enums.
- No se modifican los KPIs ni los tooltips (ya están alineados).
- No se toca la lógica de `ManualCloseOwnerFeedbackDialog` ni cómo se llega al estado aceptado.

## Resultado esperado

Una inspección aceptada por el propietario:
- Aparece en **Seguimiento** (ejecutivo), no en "Requieren tu acción".
- Su tarjeta muestra "Ver detalle" en lugar de "Publicar".
- En el detalle (ejecutivo y admin) no se ofrece "Publicar"; solo lectura/republicación si ya estaba publicada.
- El badge combinado "Aceptada por propietario" es el único estado visible.
