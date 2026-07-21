## Problema

En `ExecutiveReviewQueue`, los KPIs "Para revisar", "En revisión" y "Para publicar" son clicables (filtran por `status`), pero los otros tres — "Esperando propietario", "Feedback propietario" y "Aceptadas" — sólo muestran el contador. No tienen `onClick` ni prop `active`, por eso no se pueden seleccionar aunque el contador indique registros.

Estos tres KPIs no dependen únicamente de `status`; combinan `status` con `owner_feedback_status`, por lo que el `statusFilter` actual no alcanza.

## Solución

1. **Nuevo filtro `ownerFeedbackFilter`** en `ExecutiveReviewQueue.tsx` con valores: `all | waiting | pending_review | accepted`.
2. Aplicarlo dentro del `useMemo` de `filtered`:
   - `waiting`: `status ∈ {published, sent}` y `owner_feedback_status ∈ {null, 'none'}`.
   - `pending_review`: `status ∈ {published, sent}` y `owner_feedback_status = 'pending_executive_review'`.
   - `accepted`: `owner_feedback_status = 'accepted'`.
3. Agregar `onClick` y `active` a los tres `KpiCard` correspondientes, con lógica toggle idéntica a los otros (click de nuevo = volver a `'all'`). Al activar uno de ellos, resetear `statusFilter` a `'all'` para evitar filtros contradictorios (y viceversa cuando se activa un KPI de status).
4. Sin cambios de datos ni de backend; sólo presentación/filtrado en cliente.

## Aceptación

- Click en cada uno de los tres KPIs filtra la lista a las inspecciones que cuenta.
- Segundo click desactiva el filtro.
- Los conteros y la lista quedan consistentes.
