
## 1. Rediseño de KPIs del Admin Dashboard

Reemplazar las 5 tarjetas actuales (`Total / Sin Asignar / En Curso / En Revisión / Aprobadas`) de `src/pages/admin/AdminDashboard.tsx` por el mismo set de 6 `KpiCard` que ya usa `AdminInspections.tsx` (y que es consistente con `ExecutiveReviewQueue`):

```text
Sin asignar | En progreso | Para revisar | En corrección | Para publicar | Publicadas
```

Detalles:
- Importar `KpiCard` desde `@/shared/ui` y los iconos equivalentes (`UserCheck`, `Clock`, `FileSearch`, `AlertCircle`, `Send`, `CheckCircle2`).
- Calcular los conteos reutilizando `priorityBucket`/`sharedPriorityBucket` y la misma derivación de buckets que ya existe en `AdminInspections` (extraerla a `src/lib/inspection-buckets.ts` para no duplicar lógica).
- Cada card enlaza a `/admin/inspections?...` con el mismo `bucketFilter` / `statusFilter` que activa en `AdminInspections` para que el flujo sea consistente.
- Mantener las tarjetas inferiores (`Pendientes por Inspector`, `Por Revisar por Ejecutivo`, `Sin Asignar`, `Próximas Programadas`, `Recientes`) sin cambios visuales.

## 2. Análisis integral de performance — hallazgos

Síntomas medidos (top de `pg_stat_statements`):

| Consulta | Calls | Mean | Total |
|---|---|---|---|
| `inspection_sections WHERE inspection_id=$1` | 6,531 | 5 ms | 32.9 s |
| `inspections ORDER BY updated_at LIMIT/OFFSET` | 810 | 37 ms | 30 s |
| `inspection_report_versions WHERE public_token` | 14,982 | 1.75 ms | 26 s |
| `inspection_field_values WHERE inspection_id AND field_key=ANY` | 418 | 62 ms | 26 s |
| `UPDATE inspection_field_values` | 6,005 | 4.3 ms | 25.7 s |

Causas en el código:

1. **N+1 de `inspection_sections`** — `useSectionsBulk` (usado por `useExecutiveQueue` y otras listas) hace una llamada por inspección. Confirmado por las 6,531 llamadas individuales con `WHERE inspection_id = $1`.
2. **Dashboard sin límites** — `AdminDashboard` hace `select('*').order('created_at')` sin `limit`, trayendo `property_snapshot_json`, `generated_structure_json` y `property_overrides_json` enteros (las columnas más pesadas), únicamente para mostrar 10 filas y conteos agregados.
3. **`getEffectiveSnapshot` recorre todas las inspecciones** para calcular "Próximas Programadas" en cada render del Dashboard (deep merge JSON × N).
4. **Rutas admin/ejecutivo importadas eager** en `App.tsx` — no se usa `React.lazy`, el bundle inicial carga `RepairsTableView`, `QuotationView`, `PublishView`, etc.
5. **Detalle de inspección carga todo en paralelo** sin lazy por tab: repairs, photos, signatures, audit, feedback, versions.
6. **`UPDATE inspection_field_values` (6,005 calls)** sugiere que el autosave del Inspector dispara escrituras por cada cambio — falta debounce o coalescing por sección.
7. **`inspection_report_versions WHERE public_token`** se invoca casi 15k veces: cada vista pública dispara la query sin caché HTTP/in-memory.

## 3. Acciones de performance (en este loop)

### Frontend — quick wins
- **`AdminDashboard.tsx`**:
  - Cambiar el select a columnas mínimas: `id, property_id, property_name, address, status, inspector_id, executive_id, created_at, updated_at, market, property_overrides_json` (omitir `property_snapshot_json` y `generated_structure_json`).
  - Añadir `.limit(200)`.
  - Memoizar `stats`, `pendingByInspector`, `pendingByExecutive`, `upcoming`, `unassigned` con `useMemo` y precomputar `priorityBucket` una vez.
  - Usar `React Query` (`useQuery`) en vez de `useEffect+setState` para compartir caché con `AdminInspections` (mismo `queryKey` `['admin','inspections','list']`, `staleTime: 30s`).
- **`useExecutiveQueue.ts`**: pasar al `useSectionsBulk` solo los IDs de la página visible (después de paginación) — evita 500× queries al cargar.
- **`App.tsx`**: convertir todas las rutas `/admin/*` y `/executive/*` a `React.lazy` + `Suspense` con un fallback global.
- **`AdminInspectionDetail.tsx`**: lazy fetch por tab — `repairs` solo cuando la tab "Presupuesto" abre, `quotation` en "Cotización", `versions` en "Publicación". Usar `enabled: activeTab === 'budget'` en cada `useQuery`.
- **Inspector autosave**: aplicar `debounce(500ms)` por `field_key` en las mutaciones a `inspection_field_values` y coalescer escrituras consecutivas al mismo campo.

### Backend — sin migraciones destructivas
- Crear una RPC ligera `get_admin_inspection_summary(limit)` que devuelva una sola fila por inspección con: id, status, inspector_id, executive_id, snapshot_meta (subset), section_counts (jsonb agregado). Reemplaza el N+1 de `useSectionsBulk` en la pantalla de listado. (Se deja para un follow-up explícito si el usuario lo aprueba.)
- Añadir índices verificados (`CREATE INDEX IF NOT EXISTS`):
  - `inspection_sections (inspection_id, is_visible, sort_order)`
  - `inspection_field_values (inspection_id, field_key)`
  - `inspection_report_versions (public_token, status, is_latest)`
- Cachear `get_published_report` a nivel cliente (React Query `staleTime: 5min`) en el visor público.

### Métricas de éxito
- Reducir llamadas a `/inspections` en Dashboard de 1×(payload completo) → 1×(payload reducido, ≈10× más pequeño).
- Eliminar el bucle de `inspection_sections` en el listado admin (de N llamadas a 1 RPC).
- TTI del Dashboard < 1s con caché caliente.

## 4. Alcance de este loop

1. Refactor de KPIs en `AdminDashboard.tsx` + extracción a `src/lib/inspection-buckets.ts`.
2. Optimizaciones frontend: select reducido + `limit` + `useMemo` + `useQuery` compartida en Dashboard.
3. Lazy routes en `App.tsx`.
4. Lazy fetch por tab en `AdminInspectionDetail.tsx`.
5. Limitar `useSectionsBulk` a la página visible en `useExecutiveQueue.ts`.

**Fuera de alcance (follow-up):** debounce del autosave del Inspector, creación de RPC `get_admin_inspection_summary`, creación de índices (requiere migración explícita), caché del reporte público.

## 5. Archivos a tocar

- `src/pages/admin/AdminDashboard.tsx`
- `src/lib/inspection-buckets.ts` (nuevo)
- `src/pages/admin/AdminInspections.tsx` (importar el helper compartido)
- `src/App.tsx` (React.lazy)
- `src/pages/admin/AdminInspectionDetail.tsx` (enabled por tab)
- `src/shared/hooks/useExecutiveQueue.ts` (sections solo visibles)
