## Objetivo

Unificar la experiencia de filtros/búsqueda del listado admin con la del ejecutivo, reemplazar el scroll infinito por paginación, y aplicar optimizaciones de performance transversales.

---

## 1. Filtros y búsqueda en `AdminInspections.tsx`

Reemplazar el bloque actual (search + chips de buckets + collapsible de filtros avanzados) por el mismo patrón visual del ejecutivo (`FiltersBar` de `@/shared/ui`), preservando lo que el admin tiene de más (buckets operativos, vista cards/tabla).

**KPIs clicables (arriba)** — mismo `KpiCard` que ejecutivo, pero adaptados al rol admin:
- Sin asignar · Por coordinar · Programadas · En progreso · Para revisión (`submitted`+`in_review`) · Publicadas (`published`+`sent`)
- Click sobre KPI = atajo al bucket/estado equivalente.

**FiltersBar (debajo de KPIs)** — alineada con ejecutivo:
- Search (dirección / ID / nombre).
- Select **Estado** completo, incluyendo los faltantes hoy: agregar `accepted` (existe en el enum pero no está en `STATUS_OPTIONS`).
- Select **Mercado** (derivado de las inspecciones, igual que ejecutivo — hoy no existe en admin).
- Select **Inspector** y **Ejecutivo** (admin ya los tiene, moverlos a la barra principal).
- Select **Publicación** (`all` / `published` / `not_published`) — hoy no existe.
- Dropdown **Ordenar** con las opciones actuales de admin (priority, latest, created, contract, schedule).
- Mantener el `ToggleGroup` cards/tabla del admin alineado a la derecha.

**Chips de buckets** se conservan (son la jerarquía operativa propia del admin), pero ahora viven inmediatamente debajo de la `FiltersBar` como sub-filtro contextual, no dentro de un Card aparte.

Eliminar el `Collapsible` "Filtros avanzados" — todo queda visible en la `FiltersBar`.

---

## 2. Paginación

Reemplazar el render completo de `filteredInspections` por paginación cliente (los datos ya están en memoria).

- `pageSize = 25` (configurable vía select 25/50/100).
- Estado `page` persistido en URL (`?page=2`), se resetea cuando cambian filtros/búsqueda/orden.
- Componente `<Pagination>` de shadcn al pie de la lista/tabla: Anterior · 1 … N · Siguiente, más texto "Mostrando X–Y de Z".
- Aplica a ambas vistas (cards y tabla).

---

## 3. Análisis y optimizaciones de performance

### Hallazgos principales

1. **Fetch sin límite en el listado admin** — `supabase.from('inspections').select('*, inspector(...), executive(...)')` trae todas las inspecciones con dos joins en cada carga del page; sin paginación server-side, esto crece linealmente con el negocio.
2. **`useExecutiveQueue` agrava el problema** — además de inspecciones, dispara `useSectionsBulk(inspectionIds)` que pide secciones de **todas** las inspecciones a la vez (potencialmente miles de filas) solo para calcular progress en tarjetas.
3. **`getEffectiveSnapshot` se ejecuta por fila en cada render** — hace merge profundo de `property_snapshot_json` + `property_overrides_json`. En el `useMemo` de filtrado del admin, se llama una vez al cargar, pero en KPIs y chips de conteo se itera repetidamente sobre todo el array.
4. **`AdminInspectionDetail`** ya identificado: carga repairs/photos/signatures/audit/feedback en paralelo al montar, sin lazy por tab.
5. **Bundle**: las páginas admin/ejecutivo se importan eager en el router (no `React.lazy`), incluyendo `RepairsTableView`, `QuotationView`, `PublishView`.

### Acciones

**Datos / red**
- Listado admin: agregar `limit(500)` al query inicial y un banner "+N inspecciones antiguas — ver archivo" si se llega al tope; mediano plazo, mover a paginación server-side con `range()` por página.
- Listado admin: reemplazar `select('*')` por columnas explícitas (omitir `property_snapshot_json`, `generated_structure_json`, `property_overrides_json` salvo los campos que usa `getEffectiveSnapshot` para fecha llaves / contrato — proyectar a `snapshot_meta` reducido vía RPC en una iteración posterior).
- `useExecutiveQueue`: limitar `useSectionsBulk` a los IDs visibles tras filtrar/paginar, no a todos. Alternativa: derivar el progreso desde un nuevo campo materializado o pedir solo `status` por sección.
- `AdminInspectionDetail`: lazy load por tab (cargar repairs solo al abrir "Presupuesto", quotation solo al abrir "Cotización", etc.).

**Render**
- Memoizar `priorityBucket(insp)` por inspection (calcular una sola vez en el `enriched` map, no en cada conteo de chip).
- Pre-calcular conteos de buckets en un solo `useMemo` sobre `inspections`, en lugar de 5 `filter` separados dentro del JSX.
- Tabla admin: aplicar `react-window` o paginación (cubierto arriba) para no montar >100 `TableRow` a la vez.

**Bundle**
- Convertir las rutas admin/ejecutivo a `React.lazy` + `Suspense` en el router.
- Code-split `QuotationView`, `PublishView`, `RepairsTableView` dentro del detalle admin (dynamic import al activar el tab).

**Cache**
- Subir `staleTime` de `useInspections` a 30 s (hoy default) para evitar refetch al volver de detalle.

---

## 4. Alcance fuera del plan

- No se cambian RPCs, RLS ni schema.
- No se altera `ExecutiveReviewQueue.tsx` (es la referencia).
- La paginación server-side queda como follow-up; este plan deja la base (límite + paginación cliente + columnas reducidas).

---

## Archivos a tocar

- `src/pages/admin/AdminInspections.tsx` — refactor de filtros + paginación + memoización + limit/columnas.
- `src/pages/admin/AdminInspectionDetail.tsx` — lazy por tab.
- `src/modules/review/api/useExecutiveQueue.ts` — limitar `useSectionsBulk` a IDs visibles (requiere pasar filtros desde la página, o exponer un setter).
- `src/App.tsx` / router — `React.lazy` para rutas pesadas.
- (Opcional) nuevo `src/components/admin/AdminInspectionsFilters.tsx` para encapsular la `FiltersBar` admin si crece.
