# Performance + Monitoreo (PostHog)

Antes de ejecutar, hay que corregir el diagnóstico: varias de las correcciones pedidas ya están aplicadas en el código actual. Este plan implementa lo que realmente falta y omite lo redundante.

## Estado verificado hoy

Ya hecho (no requiere trabajo):
- `AuthContext`: el `value` ya está en `useMemo`; `signIn`, `signUp`, `signOut` y `fetchProfile` ya usan `useCallback`; el perfil ya se lee con columnas explícitas (no `select('*')`).
- Listas de inspector (Dashboard, All, Past, Calendar) ya usan React Query compartido (`useInspectorInspections`) con proyección de columnas (`INSPECTION_LIST_COLUMNS`).
- `AdminInspections` y `ExecutiveReviewQueue` ya usan proyección de columnas, no `select('*')` sobre inspecciones.
- `loading="lazy"` + `decoding="async"` ya están en las grillas de fotos de `AdminInspectionDetail`, `MobileReviewView` y `PhotoPanel` (que además pagina de 24 en 24).
- QueryClient ya tiene `staleTime` 5 min, `gcTime` 10 min y refetch on focus/reconnect desactivados.

Pendiente real:
- No existe `ErrorBoundary` global ni monitoreo/telemetría en producción.
- `select('*')` sobre tablas completas sin límite en: `AdminUsers` (profiles), `AdminInspections` (profiles activos), `AdminSchedule` (profiles), `AdminRepairCatalog` (categorías, contratistas, matriz de precios completa), `ExecutiveRepairCatalog`, y `inspections.service.ts`.
- Sin virtualización en las listas largas de admin/ejecutivo.

No pude confirmar los volúmenes actuales de filas (la base respondió con timeout al consultarla), así que el plan trata paginación y virtualización como mejoras defensivas, no como respuesta a un número medido.

## Parte 1 — Correcciones de performance

1. Proyección de columnas donde falta
   - `profiles`: reemplazar `select('*')` por `id, full_name, email, role, is_active, approval_status, market, country_code, phone, created_at` en `AdminUsers`, `AdminInspections`, `AdminSchedule`.
   - `inspections.service.ts`: usar `INSPECTION_LIST_COLUMNS` y columnas explícitas en secciones/perfiles.
   - Catálogo de reparaciones: seleccionar solo las columnas usadas por la UI en categorías, ítems, contratistas y matriz de precios.

2. Paginación server-side donde tiene sentido
   - `AdminInspections`: paginación con `.range()`, `PAGE_SIZE = 20`, y `count: 'exact'` para el total. Los KPIs y filtros existentes se calculan con conteos agregados server-side para no romper la lógica actual de "eje unificado de filtros".
   - `AdminUsers`: `PAGE_SIZE = 50` con búsqueda server-side por nombre/email.
   - `ExecutiveReviewQueue`: se mantiene la carga por grupos de estado (los filtros y contadores actuales dependen del set completo); se limita con `.range()` a 200 filas por grupo y se añade "cargar más".
   - Migrar a React Query los fetches que aún viven en `useEffect` (`AdminUsers`, `AdminSchedule`, catálogos), con `queryKey` que incluya página y filtros.

3. Virtualización
   - Instalar `@tanstack/react-virtual`.
   - Aplicar en la tabla de `AdminInspections` y en la lista de `ExecutiveReviewQueue`, respetando los grupos colapsables y el `forceOpen` ya existente.

4. Imágenes
   - Auditoría final: añadir `loading="lazy"` / `decoding="async"` a los `<img>` restantes que no son lightbox (firma en `AdminInspectionDetail`, cualquier grilla nueva).

## Parte 2 — Monitoreo con PostHog

PostHog está disponible como conector de Lovable, así que se conecta por ahí en lugar de pedir claves manuales: las variables `VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY` y `..._REGION` quedan inyectadas automáticamente. Requiere una acción del usuario para autorizar la conexión.

1. `src/lib/monitoring.ts`
   - `initMonitoring()` — inicializa `posthog-js` solo en producción y solo si hay token; `capture_pageview`, `capture_pageleave`, `capture_performance` (Web Vitals), session replay con `maskAllInputs: true` y `maskTextSelector: '[data-sensitive]'`.
   - `identifyUser(userId, role)` — identifica por id y rol únicamente, sin email ni nombres (regla de datos sensibles).
   - `captureError(error, context)` — envía `$exception`.
   - `measureOperation(name, fn)` — mide duración, emite `performance_operation` y avisa en consola sobre 3000 ms.
   - `stopRecordingOnSensitiveRoutes()` — detiene el replay en rutas con datos personales del inquilino (formularios de inspector, detalle de inspección, reporte público).

2. Wiring
   - `initMonitoring()` en `src/main.tsx` antes del render.
   - `identifyUser` en `AuthContext` cuando el perfil queda cargado; `posthog.reset()` en `signOut`.
   - Marcar con `data-sensitive` los campos con datos del inquilino (nombre, teléfono, WhatsApp, firma).

3. `src/components/ErrorBoundary.tsx`
   - Error boundary global que reporta a PostHog y muestra un fallback con el diseño del proyecto (tokens semánticos, botón de recarga). Se envuelve la app en `App.tsx`.

4. Instrumentación de operaciones lentas
   - `measureOperation` en: carga del dashboard de inspector, lista de admin, detalle de inspección admin, cola de revisión ejecutiva y subida de fotos (`src/shared/lib/inspection-photos.ts`).

5. `src/pages/admin/AdminMonitoring.tsx` (ruta `/admin/monitoring`, solo admin, link en el sidebar)
   - Estado del backend usando el `health-check`/`system_health_state` que ya existe en el proyecto.
   - Últimos errores de cliente desde la tabla `client_error_log` ya existente (últimos 50).
   - Operaciones más lentas de las últimas 24 h a partir de los eventos propios registrados en backend, más enlaces directos a PostHog (insights y session replays filtrados por rol inspector). PostHog no expone consultas de lectura con el token público, así que el panel muestra datos propios + enlaces, no métricas leídas desde PostHog.

## Notas técnicas

- Sin cambios de esquema salvo que el panel de monitoreo requiera un índice sobre `client_error_log(created_at)`; se confirmará antes de crearlo.
- Nada de PostHog corre en desarrollo (`import.meta.env.PROD`).
- No se hacen pushes al repositorio.
- Al final: typecheck y suite de tests.
