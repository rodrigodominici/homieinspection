# Vista de seguimiento por ejecutivo

Nueva sección en el Dashboard del Admin (`/admin`) que muestra, en un gráfico de barras apiladas, la carga de cada ejecutivo desglosada por etapa del proceso, separando **Captación** y **Check-out (Recolocaciones)**. Al hacer clic en un segmento se abre un panel lateral con las propiedades de ese ejecutivo en esa etapa.

## Ubicación
- Solo visible para rol `admin` (ya lo garantiza `AdminLayout` + `ProtectedRoute`).
- Nueva tarjeta debajo de los KPIs actuales en `src/pages/admin/AdminDashboard.tsx`, antes del bloque "Pendientes por Inspector / Ejecutivo / Sin asignar".

## Diseño visual
- Card con título "Carga por ejecutivo" y un toggle de tipo: **Todas · Captación · Check-out** (segmented control usando `Tabs`).
- Gráfico de **barras horizontales apiladas**, una fila por ejecutivo, ordenadas por total descendente.
- Segmentos = etapas del proceso, con los mismos colores/tokens que los KPIs actuales:
  - Sin asignar (rojo)
  - En progreso (azul)
  - Para revisar (azul)
  - Para publicar (azul)
  - Esperando propietario (azul suave)
  - Feedback propietario (rojo)
  - Aceptadas (verde)
- Total numérico al final de cada barra.
- Leyenda clickeable arriba (filtra segmentos on/off).
- Empty state si no hay ejecutivos activos con inspecciones.

## Interacción (drill-down)
- Click en un segmento → abre `DetailSheet` (side="right", size="lg") con:
  - Header: nombre del ejecutivo + etapa + tipo activo.
  - Lista de propiedades (property_name, address, StatusBadge, tipo chip).
  - Cada item enlaza a `/admin/inspections/{id}`.
- Click en el nombre del ejecutivo (label de la barra) → navega a `/admin/inspections?executive={id}` (ya funciona).

## Datos
Reutiliza `inspQuery` y `profilesQuery` que ya carga `AdminDashboard`. No requiere nuevas queries ni migraciones.

Cálculo en cliente con `useMemo`:
1. Filtrar `inspections` por `inspection_type` según el toggle (`captacion` / `check_out` / ambos).
2. Agrupar por `executive_id` (ignorar null o mostrarlo como grupo "Sin ejecutivo" solo si hay inspecciones asignadas a inspector pero no a ejecutivo).
3. Para cada ejecutivo, contar por etapa usando la misma lógica de `computeInspectionKpis` / `bucketOf` (fuente única de verdad — no duplicar reglas).

## Cambios técnicos
- **Nuevo componente** `src/pages/admin/dashboard/ExecutiveLoadChart.tsx`:
  - Props: `inspections`, `profileMap`.
  - Estado interno: `typeFilter`, `hiddenStages`, `drilldown {execId, stage} | null`.
  - Extiende `inspection-buckets.ts` con un helper `stageOf(insp): StageKey` que devuelve la etapa canónica (misma lógica que `computeInspectionKpis`, pero por inspección) para poder agrupar.
- **`src/lib/inspection-buckets.ts`**: exponer `stageOf` y un `STAGE_META` (label, color token, orden) para que el gráfico y el drilldown compartan definición.
- **`src/pages/admin/AdminDashboard.tsx`**: montar `<ExecutiveLoadChart />` después del grid de KPIs.
- Sin librería de charts nueva — se dibuja con divs + Tailwind (barras apiladas horizontales), consistente con el resto del admin. Recharts ya está en el bundle si se prefiere, pero mantener CSS puro es más liviano y estiliza mejor con los tokens semánticos.

## Notas
- No modifica lógica de negocio ni backend.
- No duplica el filtrado: usa exactamente la misma clasificación por etapa que ya alimenta los KPIs, para que los totales cuadren pixel a pixel con las tarjetas de arriba.
- Respeta memoria `mem://ui/executive-desktop-patterns` (sticky, side-by-side) y tokens de `mem://style/visual-identity`.
