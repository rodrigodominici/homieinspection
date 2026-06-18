
# Reporte de performance e infraestructura

Análisis read-only. No se realizaron cambios. Hallazgos ordenados por **ratio impacto/esfuerzo** (más rentables arriba).

---

## TIER 1 — Quick wins de alto impacto

### 1. AuthContext fuerza re-render global de toda la app
- **Archivo:** `src/contexts/AuthContext.tsx` (líneas 100–116)
- **Problema:** El `value` del provider se construye inline en cada render del `AuthProvider`. Como `App.tsx` envuelve TODO el árbol con `<AuthProvider>`, cualquier cambio (incluso `profileLoading` que cambia 2 veces en cada navegación) re-renderiza la app entera. Además, todos los componentes que sólo necesitan `role` o `user.id` se vuelven a renderizar cuando cambia `session` o `profileLoading`.
- **Impacto:** Alto — afecta cada interacción de Inspector/Executive.
- **Esfuerzo:** Bajo
- **Sugerencia:** envolver el `value` en `useMemo`; opcionalmente partir en dos contextos (`AuthSessionContext` y `AuthProfileContext`) o exponer selectors (`useAuthRole`, `useAuthUserId`) con `useSyncExternalStore`.

### 2. `select('*')` masivo en queries pesadas
- **Archivos:** `useReviewDetail.ts` (líneas 64, 86–88), `InspectorDashboard.tsx` (línea 41), `InspectorInspectionDetail.tsx` (líneas 66–67), `AdminInspections.tsx`, `AdminInspectionDetail.tsx`, `ExecutiveSchedule.tsx`, etc. (20 archivos en total).
- **Problema:** `inspections.*` incluye `property_snapshot_json`, `generated_structure_json`, `property_overrides_json` — JSON pesados (decenas–cientos de KB cada uno). Lo mismo `inspection_photos.*` (incluye metadata redundante por foto) y `inspection_repair_items.*` (23 columnas).
- **Impacto:** Alto — payload del review detail puede ser >1MB innecesarios; en `InspectorDashboard` se traen los JSON de TODAS las inspecciones.
- **Esfuerzo:** Medio (proyectar columnas en ~10 lugares).
- **Sugerencia:** crear helpers `INSPECTION_LIST_COLUMNS` y `INSPECTION_DETAIL_COLUMNS`. Excluir `generated_structure_json` y `property_snapshot_json` en listados; cargarlos lazy en el detalle.

### 3. Falta de índices compuestos clave
- **Tablas afectadas:** `inspection_sections`, `inspection_field_values`, `inspection_photos`, `inspection_repair_items`, `inspection_reviews`, `inspections`.
- **Problema:** índices existentes son sólo por una columna. Patrones reales filtran simultáneamente por dos.
- **Impacto:** Alto (escala con # de inspecciones y fotos).
- **Esfuerzo:** Bajo (migración SQL única).
- **Índices recomendados:**
  - `inspection_sections (inspection_id, is_visible, sort_order)` — usado en cada detalle (review/inspector/admin).
  - `inspection_field_values (inspection_section_id, sort_order)` y `(inspection_id, field_key)` (usado en `InspectorInspectionDetail` línea 69).
  - `inspection_photos (inspection_section_id, sort_order)` y `(inspection_id, inspection_section_id)`.
  - `inspection_repair_items (inspection_section_id, sort_order)` y `(inspection_id, status)`.
  - `inspection_reviews (inspection_section_id, created_at)` y `(inspection_id, comment_type)`.
  - `inspections (inspector_id, status, updated_at desc)` y `(executive_id, status, updated_at desc)` (queries de dashboards).
  - `inspection_signatures (inspection_id, created_at desc)`.

### 4. `InspectorDashboard` corre N+1 escritas para "status consistency"
- **Archivo:** `src/pages/inspector/InspectorDashboard.tsx` (líneas 60–79).
- **Problema:** Dentro de `Promise.all(.map(async insp => …))` se llama `ensureInspectionStatusConsistency(insp.id)` por cada inspección. Eso emite 1–2 queries por inspección en cada montaje del dashboard (que se monta múltiples veces por sesión). Para 50 inspecciones son ~100 round-trips.
- **Impacto:** Alto en red móvil.
- **Esfuerzo:** Medio.
- **Sugerencia:** mover la consolidación a un **trigger Postgres** o a un **edge function periódico**, y/o limitar la verificación a las inspecciones realmente "en riesgo" (estado `pending|assigned` con `completed > 0`).

### 5. Listados sin paginación
- **Archivos:** `InspectorDashboard.tsx` (`.select('*').order(...)` sin `range`), `AdminInspections.tsx`, `ExecutiveReviewQueue` (via `useInspections`), `AdminUsers.tsx`.
- **Problema:** Se trae la tabla `inspections` completa cada vez. Hoy con 7 publicadas no se nota; con 200+ generará timeouts/payloads enormes en mobile.
- **Impacto:** Medio hoy, **Alto** a 3–6 meses.
- **Esfuerzo:** Medio.
- **Sugerencia:** `.range(0, 49)` + scroll infinito o paginación; o filtros server-side por `status IN (...)` que excluyan terminales.

---

## TIER 2 — Mejoras estructurales medianas

### 6. Páginas Inspector/Admin sin React Query
- **Archivos:** `InspectorDashboard.tsx`, `InspectorInspectionDetail.tsx`, `InspectorSectionComplete.tsx`, `InspectorCalendar.tsx`, `InspectorAllInspections.tsx`, `InspectorPastInspections.tsx`, `AdminInspectionDetail.tsx`, `AdminUsers.tsx`, varias del admin (hits `useState|useEffect|supabase` ≥ 5).
- **Problema:** `useEffect` + `useState` + `supabase.from(...)`. No hay caché entre vistas; cada navegación re-fetch completo. Volver de `/inspector/inspection/:id` al dashboard vuelve a pedir TODO.
- **Impacto:** Medio (UX en campo).
- **Esfuerzo:** Medio.
- **Sugerencia:** migrar progresivamente a hooks tipo `useInspections`, `useInspectionDetail` con `useQuery` (mismo patrón que `useReviewDetail`).

### 7. Chunking de `vite.config.ts` deja `recharts` activo aunque casi no se usa
- **Archivo:** `vite.config.ts` (líneas 78–80).
- **Problema:** se crea chunk `vendor-recharts` pero no encuentro consumidores de recharts en `src` (verificable con `rg "from 'recharts'"`). Si nadie lo importa, no se bundlea. Si se importa en algún punto, ocupa ~120 KB gz. Verificar.
- **Impacto:** Medio si se importa, nulo si no.
- **Esfuerzo:** Bajo.
- **Sugerencia:** quitar recharts si no se usa (también de `package.json`) o mantenerlo con import dinámico sólo en la página que lo necesite.

### 8. `vendor-misc` agrupa librerías heterogéneas pesadas
- **Archivo:** `vite.config.ts` (líneas 98–106).
- **Problema:** `date-fns + lucide-react + zod + react-hook-form + @hookform` en un solo chunk. Mezclar `lucide-react` (icons tree-shakeables) con `react-hook-form` (sólo en formularios complejos) impide cache parcial; un cambio en un icono invalida el bundle de validaciones.
- **Impacto:** Medio (caché HTTP).
- **Esfuerzo:** Bajo.
- **Sugerencia:** separar `vendor-icons` (lucide), `vendor-forms` (rhf+zod+hookform), `vendor-dates` (date-fns). Confirmar que los imports de `lucide-react` son named (lo son en el código revisado, ✅) — tree-shake funciona.

### 9. `componentTagger` corre en dev — verificar que no entra a producción
- **Archivo:** `vite.config.ts` (línea 64).
- **Estado:** correcto (`mode === "development"`), sin acción.

### 10. PWA: pre-cache muy agresivo
- **Archivo:** `vite.config.ts` (línea 40).
- **Problema:** `globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"]` pre-cachea TODO. Con chunks grandes y muchos iconos PNG (`pwa-*.png`, `maskable`), el install del SW puede superar varios MB en 3G.
- **Impacto:** Medio en primera visita móvil.
- **Esfuerzo:** Bajo.
- **Sugerencia:** acotar a `["**/*.{js,css,html,woff2}", "favicon.ico", "pwa-192x192.png"]` y dejar el resto runtime-cache.

### 11. Cache de Supabase API a 5 min puede servir datos "viejos" en flujos críticos
- **Archivo:** `vite.config.ts` (líneas 44–50).
- **Problema:** `NetworkFirst` con `maxAgeSeconds: 300` está OK para offline, pero combinado con `staleTime: 5min` de React Query y `gcTime: 10min`, una decisión escrita por un Ejecutivo puede no verse en otro tab hasta 5 min después.
- **Impacto:** Medio (consistencia colaborativa).
- **Esfuerzo:** Bajo.
- **Sugerencia:** dejar SW solo para GETs idempotentes de assets/`get_published_report`; excluir endpoints PostgREST que ya cachea React Query (`urlPattern` más restrictivo).

### 12. `useReviewDetail` no invalida granularmente
- **Archivo:** `src/modules/review/api/useReviewDetail.ts` (línea 131).
- **Problema:** `refetch` invalida toda la key `review-detail/:id`, lo que dispara las 6+ queries internas aunque sólo cambió, por ej., una decisión de owner feedback.
- **Impacto:** Medio (latencia percibida en el workstation ejecutivo).
- **Esfuerzo:** Medio.
- **Sugerencia:** dividir en sub-keys (`['review-detail', id, 'photos']`, `['review-detail', id, 'repairs']`, …) o un RPC `get_review_bundle` que devuelva todo en 1 round-trip.

---

## TIER 3 — Optimizaciones puntuales

### 13. Memoización en review-detail
- **Archivos:** `src/pages/executive/review-detail/*` — sólo 1–3 usos de `useMemo/useCallback` por archivo (`SectionSidebar`, `SectionWorkspace`, `PhotoPanel`, `RepairsTableView`, etc.).
- **Problema:** Componentes grandes (e.g. `RepairsTableView` con 7 hits) no están memoizados con `React.memo` y reciben handlers inline desde `ExecutiveReviewDetail.tsx`. Cada keystroke en un input o cambio de filtro re-renderiza tabla completa.
- **Impacto:** Medio (notable en inspecciones con 30+ repairs).
- **Esfuerzo:** Medio.
- **Sugerencia:** envolver tablas/listas grandes con `memo`, estabilizar handlers con `useCallback`, y mover edición a estado local del row.

### 14. `useSignedPhotoUrls` no refresca por cambio de TTL
- **Archivo:** `src/lib/photo-urls.ts` (líneas 85–100).
- **Problema:** El `useEffect` depende sólo del set de ids; si una vista permanece abierta >55 min, los URLs caducan sin re-firmarse. El cache pasivo sí refresca al pedir uno nuevo, pero `<img src>` ya está pintado.
- **Impacto:** Bajo en sesiones cortas; Medio para Inspector en campo (sesiones largas).
- **Esfuerzo:** Bajo.
- **Sugerencia:** agregar `setInterval` o `setTimeout(refresh, ttl - buffer)` por hook.

### 15. `uploadInspectionPhotos` sube en serie
- **Archivo:** `src/shared/lib/inspection-photos.ts` (línea 52, `for (const file ...)`).
- **Problema:** subida secuencial. Comprimir + subir 5 fotos = 5x latencia.
- **Impacto:** Medio (UX inspector en campo).
- **Esfuerzo:** Bajo.
- **Sugerencia:** `Promise.all` con límite de concurrencia (3) — y comprimir en paralelo.

### 16. Compresión de imágenes única (1920px @0.8)
- **Archivo:** `src/shared/lib/inspection-photos.ts` (líneas 13–34).
- **Problema:** 1920×1920 JPEG@0.8 son ~400–700 KB en cámaras modernas. En 3G es alto.
- **Impacto:** Medio.
- **Esfuerzo:** Bajo.
- **Sugerencia:** bajar a 1600px @0.75 para evidencia (suficiente para visualización web), o reusar `vite-imagetools`/WebP en el cliente vía canvas.toBlob('image/webp').

### 17. `AdminInspectionDetail` borrado en cascada manual (12 DELETE secuenciales)
- **Archivo:** `src/pages/admin/AdminInspectionDetail.tsx` (líneas 384–409).
- **Problema:** 12 deletes secuenciales contra la DB, sin transacción.
- **Impacto:** Medio (riesgo de inconsistencia si falla a la mitad).
- **Esfuerzo:** Medio.
- **Sugerencia:** RPC `admin_delete_inspection(p_id)` en Postgres dentro de una transacción; o aprovechar `ON DELETE CASCADE` definiéndolo en las FKs faltantes.

### 18. `AuthContext.fetchProfile` con `select('*')` y 3 reintentos de 1s
- **Archivo:** `src/contexts/AuthContext.tsx` (líneas 32–46).
- **Problema:** Hasta 3 segundos para usuarios cuyo trigger ya creó la fila. Bloquea protected routes.
- **Impacto:** Bajo (sólo signup).
- **Esfuerzo:** Bajo.
- **Sugerencia:** primer intento sin delay; backoff sólo si falla por "row not found".

### 19. RLS — verificar filtrado server-side
- **Acción pendiente (no destructivo):** auditar que las 5 policies de `inspections` filtren por `inspector_id = auth.uid()` y `executive_id = auth.uid()` en `SELECT`. Actualmente `InspectorDashboard` y `ExecutiveReviewQueue` llaman `.select('*')` SIN `.eq(...)`, confiando 100% en RLS. Si RLS está bien hecho ✅; si una policy es `USING (true)` se devuelve TODO. Recomendado: revisar con `supabase--read_query` sobre `pg_policies`.
- **Impacto:** Alto si la policy está mal (privacy + payload).
- **Esfuerzo:** Bajo (auditoría).

### 20. Edge functions vs cliente
- **Hoy:** lógica de "ensure status consistency", agregaciones del dashboard ejecutivo y bundle del review viven en cliente.
- **Sugerencia:** RPCs Postgres `get_inspector_dashboard(uid)`, `get_executive_queue(uid)`, `get_review_bundle(id)` — un round-trip vs 4–6, y aprovechan índices del servidor.
- **Impacto:** Alto a futuro; **Esfuerzo:** Alto.

---

## Resumen ejecutivo (ordenado por ratio)

| # | Hallazgo | Impacto | Esfuerzo |
|---|----------|---------|----------|
| 1 | `useMemo` en `AuthContext.value` | Alto | Bajo |
| 3 | Índices compuestos faltantes | Alto | Bajo |
| 19 | Auditoría de RLS en `inspections` | Alto | Bajo |
| 2 | Eliminar `select('*')` en listados pesados | Alto | Medio |
| 4 | Quitar N+1 de status consistency | Alto | Medio |
| 5 | Paginación de listados | Medio→Alto | Medio |
| 8 / 10 | Re-chunking + recortar pre-cache PWA | Medio | Bajo |
| 7 | Verificar/quitar recharts | Medio | Bajo |
| 15 / 16 | Subida paralela + compresión más agresiva | Medio | Bajo |
| 14 | Auto-refresh de URLs firmadas | Medio | Bajo |
| 18 | `fetchProfile` retry policy | Bajo | Bajo |
| 11 | Excluir PostgREST del SW cache | Medio | Bajo |
| 6 | Migrar Inspector/Admin a React Query | Medio | Medio |
| 13 | `React.memo` en tablas de review-detail | Medio | Medio |
| 12 | Sub-keys en `useReviewDetail` | Medio | Medio |
| 17 | RPC + transacción para delete cascade | Medio | Medio |
| 20 | Mover agregaciones a RPC/Edge Functions | Alto | Alto |

## Próximo paso sugerido

Si lo apruebas, podemos abordar Tier 1 en este orden: (1) `useMemo` en AuthContext, (3) migración SQL con índices compuestos, (19) auditoría de RLS, y luego (2)+(4) proyección de columnas y consolidación del status guard. ¿Lo planeo como implementación?
