# Cierre de monitoreo PostHog, performance pendiente y corrección de error Lock

## Estado verificado

- PostHog ya está cableado: `src/lib/monitoring.ts`, `initMonitoring()` en `src/main.tsx`, `SessionRecordingGate` en `App.tsx`, `ErrorBoundary` global y página `/admin/monitoring`.
- La página de monitoreo aparece en el sidebar de admin y consume `system_health_state` + `client_error_log`.
- `AuthContext` ya está blindado con timeout de sesión y perfil.
- `INPECTION_LIST_COLUMNS` y `PROFILE_LIST_COLUMNS` se usan en listas principales.
- `ExecutiveReviewQueue` ya usa `@tanstack/react-virtual` para grupos grandes.
- Hay un error de runtime actual: `AbortError: Lock broken by another request with the 'steal' option`, originado en el lock manager de `@supabase/auth-js`.
- Faltan proyecciones y límites en catálogos de reparaciones (`AdminRepairCatalog`, `ExecutiveRepairCatalog`) y en `inspections.service.ts` (`getInspectionById`/`listSectionsForInspection`).
- `AdminInspections` sigue cargando hasta 500 filas y filtrando/ordenando en cliente.

## Parte 1 — Validar y endurecer PostHog

1. **Verificar ingestión real en producción**
   - Confirmar que `VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY` y `_REGION` llegan al build publicado.
   - Abrir PostHog y comprobar que llegan eventos: `$pageview`, `$pageleave`, `performance_operation`, `$exception`.
   - Verificar que Web Vitals aparecen en el panel correspondiente.

2. **Auditar privacidad de Session Replay**
   - Revisar todas las rutas sensibles en `SENSITIVE_PATH_PATTERNS` de `src/lib/monitoring.ts`.
   - Asegurar que campos de inquilino/propietario, firmas, teléfonos, emails y direcciones tengan `data-sensitive`.
   - Añadir un helper `SensitiveText` o `SensitiveInput` para no depender de marcas manuales dispersas.
   - Verificar que `maskAllInputs: true` y `maskTextSelector: '[data-sensitive]'` cubren lo que no debe grabarse.

3. **Completar instrumentación de operaciones lentas**
   - Añadir `measureOperation` en:
     - Carga del dashboard de inspector.
     - Carga de lista de admin y detalle de inspección admin.
     - Carga de la cola ejecutiva.
     - Firma y guardado de secciones del inspector.
   - Extender `measureOperation` para sincronizaciones con HubSpot si aplica.

4. **Panel de monitoreo**
   - Verificar que `system_health_state` y `client_error_log` existen y tienen índice sobre `created_at`.
   - Añadir una sección con las operaciones más lentas de las últimas 24 h a partir de `performance_operation` (si existe tabla o eventos backend).
   - Añadir un botón "Enviar evento de prueba" para validar ingestión sin esperar a producción.

## Parte 2 — Corregir el error Lock de Supabase

1. **Investigar origen**
   - El error proviene de `navigator.locks.request` con `steal: true` en `@supabase/auth-js`.
   - Ocurre cuando el refresh de token o `getSession()` compite entre pestañas o cuando una llamada anterior no libera el lock.

2. **Mitigación inmediata**
   - Añadir un handler global de `unhandledrejection` que capture este `AbortError` específico, lo ignore en consola de usuario y lo envíe a PostHog como `auth_lock_warning` (no como crash).
   - Revisar `AuthContext` para evitar llamadas concurrentes a `getSession()`/`refreshSession()`.

3. **Configuración del cliente (si el auto-generado no permite opciones)**
   - Evaluar si se puede crear un cliente envoltorio con `auth: { lockAcquireTimeout: ... }` o una implementación de `lock` sin `LockManager`.
   - No editar `src/integrations/supabase/client.ts`; si es necesario, crear `src/lib/supabase-client.ts` y migrar solo los puntos que lo requieran.

## Parte 3 — Completar optimizaciones de performance

1. **Proyecciones y límites en catálogos**
   - `AdminRepairCatalog` y `ExecutiveRepairCatalog`: reemplazar `select('*')` y `select('*, repair_catalog_categories(*)')` por columnas explícitas y añadir `limit()` razonable.
   - `inspections.service.ts`: cambiar `select('*')` en `getInspectionById` y `listSectionsForInspection` por `INSPECTION_DETAIL_COLUMNS` y columnas de sección necesarias.
   - Auditar `AdminSchedule` y `ExecutiveSchedule` para aplicar `PROFILE_LIST_COLUMNS` y evitar `select('*')`.

2. **Paginación server-side en AdminInspections**
   - Reemplazar el fetch único de 500 filas por paginación real con `.range()` y `count: 'exact'`.
   - Mantener el KPI bucket counts sin romper el eje unificado de filtros: usar un endpoint de conteo agregado (RPC o `count` con filtros) para los KPIs.
   - Implementar búsqueda server-side por `address` e `id` (texto libre) y dejar el filtro de texto de inspector/ejecutivo en cliente si los perfiles ya están cargados.
   - Tamaño de página por defecto 25, opciones 25/50/100.

3. **Virtualización y lazy loading**
   - Validar que `@tanstack/react-virtual` en `ExecutiveReviewQueue` funciona con filtros activos y grupos vacíos.
   - Auditar todas las grillas de fotos y añadir `loading="lazy"` / `decoding="async"` en cualquier `<img>` que falte.

4. **Imágenes y red**
   - Confirmar que `src/lib/photo-urls.ts` sigue usando firmas de 480px y refresco de JWT antes de subir.
   - Verificar que `uploadInspectionPhotos` reporta `performance_operation` y que el timeout/retry no genera falsos positivos.

## Parte 4 — Validación final

1. **Typecheck y tests**
   - `tsgo` y `bunx vitest run` (o el comando del proyecto).

2. **Pruebas en el preview**
   - Login admin: entrar a `/admin/monitoring` y ver que carga sin errores.
   - Login ejecutivo: entrar a `/executive`, aplicar filtros y scroll largo.
   - Login inspector: abrir una inspección, subir foto y verificar que no se dispara el error Lock.
   - Comprobar en PostHog (entorno de desarrollo NO envía nada) que no hay eventos de prueba contaminando producción.

3. **Publicación**
   - Desplegar funciones Edge afectadas si se toca alguna.
   - Publicar el frontend.
   - Abrir PostHog en vivo y verificar eventos reales después de la publicación.

## Notas técnicas

- Nada de PostHog corre en desarrollo (`import.meta.env.PROD`).
- No se tocan `src/integrations/supabase/client.ts`, `auth`, `storage`, `realtime`, `supabase_functions` ni `vault`.
- Cualquier cambio de esquema (índice, tabla, RPC) requiere una migración con `GRANT` y RLS cuando aplique.
