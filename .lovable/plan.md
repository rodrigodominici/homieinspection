# Fix filtros/KPIs en Admin Inspecciones

## Diagnóstico verificado

`AdminInspections.tsx` mantiene **dos ejes de filtrado independientes** que se combinan con AND:

- **`statusFilter`** — dropdown "Estado" y las KPI cards *En progreso / Para revisar / Para publicar* (línea 507, 514, 521).
- **`bucketFilter`** — chip row inferior y las KPI cards *Sin asignar / Esperando propietario / Feedback propietario / Aceptadas* (líneas 500, 528, 535, 542).

El screenshot muestra `statusFilter='in_progress'` (dropdown "En progreso") y luego el chip **Programadas** activado (`bucketFilter='programadas'` ⇒ bucket 2 = "asignada + con schedule"). Como ambos filtros conviven con AND y son mutuamente excluyentes (bucket 2 nunca es status `in_progress`), el resultado es 0 aunque el contador del chip (calculado sin considerar `statusFilter`) marque 15.

El mismo problema explica que **Esperando propietario / Feedback propietario / Aceptadas** no muestren resultados cuando hay un `statusFilter` distinto de `all`, y que **Programadas / Por coordinar** desaparezcan cuando el chip se combina con cualquier estado.

Además:
- La fila de chips no tiene "Para revisar" ni "Para publicar" (existen como KPI cards) — inconsistencia visual admin.
- Los 7 KPI cards actuales son casi idénticos a los del ejecutivo (`ExecutiveReviewQueue.tsx` líneas 222‑227), sin reflejar los estados operativos propios del admin (Por coordinar, Programadas).

## Plan

1. **Un solo eje de selección para KPI cards + chips.**
   Introducir un helper `applyQuickFilter(target: Bucket | StatusShortcut)` que:
   - Reinicie `statusFilter='all'` y `bucketFilter='all'` antes de aplicar la nueva selección (comportamiento "exclusivo", igual que ya usa el ejecutivo con `setStatusExclusive`).
   - Mapee cada card/chip a un único filtro coherente:
     - `Sin asignar` → `bucketFilter='unassigned'`
     - `Por coordinar` → `bucketFilter='por_coordinar'`
     - `Programadas` → `bucketFilter='programadas'`
     - `En progreso` → `statusFilter='in_progress'`
     - `Para revisar` → `statusFilter='submitted'` (KPI ya incluye `in_review` en el conteo, cambio el conteo a solo `submitted` para que coincida con el filtro, o el filtro pasa a matchear ambos vía un nuevo bucket).
     - `Para publicar` → `statusFilter='approved'` + excluir `owner_feedback='accepted'`.
     - `Esperando propietario` → `bucketFilter='waiting_owner'`
     - `Feedback propietario` → `bucketFilter='owner_feedback'`
     - `Aceptadas` → `bucketFilter='accepted'`
   - Un segundo click en la misma card/chip vuelve a `'all'`.

2. **Alinear conteos con el filtro real.**
   - Actualizar `bucketCounts` para incluir `for_review` (submitted OR in_review) y `to_publish` (approved AND owner_feedback≠accepted), o simplificar KPIs para que cada uno corresponda a un único predicado ya soportado por el filtro. Elegir la vía "predicado único" para evitar el desfase actual entre KPI y resultados.

3. **Igualar la fila de chips a los KPI cards.**
   Reemplazar `BUCKET_FILTERS` por la misma lista de 7 accesos rápidos que muestran las KPI cards, con el contador y `active` compartidos. Así el chip "Para revisar" existe y `Programadas` respeta la exclusividad.

4. **Diferenciar KPIs admin vs ejecutivo.**
   El admin tiene visibilidad operativa completa; añadir **Por coordinar** y **Programadas** como KPI cards propias del admin (pasan a ser 9 cards en `lg:grid-cols-9` o se agrupan en dos filas). El ejecutivo no las tiene porque su foco es la revisión/entrega, no la coordinación previa. Con esto los indicadores dejan de ser un espejo del rol ejecutivo.

5. **Preservar dropdowns avanzados.**
   El `Select` de "Estado" (dropdown detallado con todos los estados enum) se mantiene para consultas finas; cuando el usuario elige un estado desde el dropdown, `bucketFilter` se resetea a `'all'` (misma regla de exclusividad).

6. **Sincronizar querystring.**
   `useEffect` que hoy escribe `bucket` y `status` en la URL se ajusta al nuevo modelo (un solo shortcut activo a la vez); links compartidos se mantienen retrocompatibles leyendo ambos parámetros si están.

## Detalles técnicos

- Archivo único a modificar: `src/pages/admin/AdminInspections.tsx`.
- `src/lib/inspector-operational.ts` **no** cambia: la lógica de bucket sigue siendo la fuente de verdad.
- No hay migraciones ni cambios de backend.
- Verificación:
  - `tsgo` typecheck.
  - Playwright con sesión admin de Rodrigo: click en cada uno de los 9 accesos rápidos y confirmar que `resultados > 0` cuando el contador > 0, y que el badge activo cambia de card/chip al hacer click.
  - Confirmar que abrir con un `statusFilter` en URL y luego clickear un chip **no** vacía la lista.
