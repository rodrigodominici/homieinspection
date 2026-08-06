# Auditoría de performance — Homie Inspection

Hallazgos verificados sobre el código y la base de datos actuales, con las correcciones propuestas. Datos reales hoy: 142 inspecciones, 19.826 fotos, 21.608 campos, 1.630 ítems de reparación, 14 perfiles.

## 1. Bundle y carga inicial

**Bien:** ya hay code-splitting por ruta (`src/App.tsx` 17-52), `manualChunks` por vendor (`vite.config.ts` 80-111), `preconnect` a backend y fuentes (`index.html`), PWA con precache del shell.

**Hallazgos**

| # | Archivo | Impacto | Síntoma | Solución |
|---|---|---|---|---|
| 1.1 | `src/App.tsx` 74-81 | Medio | `BackendStatusBanner` + `AuthProvider` montan y consultan antes de pintar cualquier ruta; el spinner inicial se alarga. | Mover el banner dentro del `Suspense` y hacerlo `lazy`; el health-check ya es diferible. |
| 1.2 | `index.html` 30 | Medio | La hoja de estilos de Google Fonts es render-blocking en 3G (bloquea el primer paint ~300-600 ms). | Autohospedar Inter (woff2 en `public/fonts`, `font-display: swap`) o cargarla con `media="print" onload`. |
| 1.3 | `src/pages/public/OwnerReport.tsx` (1.242 líneas) | Medio | El informe público carga en un solo chunk grande; es la ruta que ven los propietarios en móvil. | Extraer secciones (galería, presupuesto, feedback) a componentes `lazy` y dejar el encabezado en el chunk inicial. |
| 1.4 | `index.html` | Bajo | No hay prefetch de la ruta por rol tras el login. | Al resolver el rol en `AuthContext`, disparar `import()` de la ruta destino (warm del chunk). |

No hay imágenes locales pesadas (solo íconos PWA), así que WebP/AVIF no aplica al bundle; sí aplica a las fotos de inspección (ver §5).

## 2. Renders React

| # | Archivo | Impacto | Síntoma | Solución |
|---|---|---|---|---|
| 2.1 | `src/pages/executive/ExecutiveReviewDetail.tsx` (708 líneas), `src/pages/admin/AdminInspectionDetail.tsx` | Alto | Un solo componente contiene estado de UI + datos; cada tecla en notas/precios re-renderiza toda la vista (galería incluida). | Envolver `PhotoPanel`, `SectionSidebar`, `RepairsTableView`, `SectionWorkspace` en `React.memo` y pasar handlers con `useCallback`. |
| 2.2 | Todo el proyecto (`rg react-window` = 0 resultados) | Alto | Listas sin virtualizar: fotos por inspección (cientos), 21.608 field values, catálogo de reparaciones. El scroll se traba en móvil. | Adoptar `@tanstack/react-virtual` en `PhotoPanel`, `AdminRepairCatalog` y las listas de campos. |
| 2.3 | `src/pages/admin/AdminInspections.tsx` (959 líneas, 7 usos de memo) | Medio | Filtrado + búsqueda recalculados en cada render sobre 500 filas. | `useMemo` sobre el pipeline de filtros y `memo` en la fila de tabla. |
| 2.4 | `src/contexts/AuthContext.tsx` | Medio | El value del contexto re-crea objeto en cada cambio → cascada global. | Memoizar el value y separar `session` de `profile` en dos contextos. |
| 2.5 | `src/App.tsx` 55-63 | Bajo | `refetchOnWindowFocus` queda en default `true`; al volver de HubSpot se refetchea todo. | Añadir `refetchOnWindowFocus: false` a los defaults (el `staleTime` de 5 min ya está bien). |

## 3. Queries a Supabase

| # | Archivo | Impacto | Síntoma | Solución |
|---|---|---|---|---|
| 3.1 | `src/pages/admin/AdminInspectionDetail.tsx` 170-246 | Alto | 11 queries con `select('*')`, incluidas fotos y 21k field values sin proyección; la vista tarda segundos. | Reusar `INSPECTION_DETAIL_COLUMNS` y listar columnas explícitas como ya hace `useReviewDetail.ts` 135. |
| 3.2 | `src/pages/inspector/InspectorSectionComplete.tsx` 92-99, `InspectorInspectionDetail.tsx` 66-70 | Alto | `select('*')` sobre `inspection_photos` y `inspection_field_values` en móvil (payload grande en 3G). | Proyectar solo las columnas usadas por la UI. |
| 3.3 | `src/pages/admin/AdminInspections.tsx` 226 | Medio | `.limit(500)` sin paginación real; crecerá con el volumen. | Paginar con `.range()` + `count: 'exact'`, o `useInfiniteQuery`. |
| 3.4 | `AdminIntegrationHubSpotLogs.tsx` 90, `...OutboundLogs.tsx` 91 | Medio | `select('*').limit(200)` trae `request_payload`/`response_body` completos (JSONB pesado) solo para listar. | Proyectar metadatos en la lista y cargar el payload al abrir el detalle. |
| 3.5 | `src/pages/admin/AdminRepairCatalog.tsx` 175-178, 290-308 | Medio | Tras cada guardado se re-consulta toda la matriz de precios; además `select('*')` sin filtro sobre `repair_catalog_item_contractor_prices`. | Invalidar por React Query y actualizar en caché en lugar de refetch total. |
| 3.6 | `src/pages/admin/AdminInspectionDetail.tsx`, `AdminSchedule.tsx`, `ExecutiveSchedule.tsx` | Medio | Cada página vuelve a pedir `profiles`/`contractors` con `select('*')`; misma query duplicada en paralelo. | Hooks compartidos (`useProfiles`, `useContractors`) con `staleTime: 5 min`, como `reviewDetailKeys.contractors()`. |
| 3.7 | Índices verificados | Bajo | `inspections`, `inspection_photos`, `inspection_sections`, `inspection_field_values`, `inspection_repair_items` ya tienen índices por FK/estado/orden. `profiles` solo tiene PK. | Añadir `idx_profiles_role_active (role, is_active)` — lo usa `has_role`/`get_user_role` en cada policy. |

No hay suscripciones realtime en el código (`rg channel(` = 0), así que no hay fugas por ese lado.

## 4. Seguridad y RLS

- Verificado en `pg_policies`: ~40 políticas evalúan `has_role(auth.uid(), ...)` **sin** envolver en subselect. Al no estar en un InitPlan, la función se evalúa por fila. **Impacto Alto** en `inspection_photos` (19.826 filas) y `inspection_field_values` (21.608). Fix: reescribir a `has_role((select auth.uid()), 'rol')` — así se hizo ya con las políticas de `comercial`.
- Todas las tablas de negocio tienen RLS activo; `system_health_state` es read-only (correcto).
- Edge Functions bien usadas para lo sensible (HubSpot, Slack, firmado de fotos, health-check).

## 5. Network y Storage

| # | Archivo | Impacto | Síntoma | Solución |
|---|---|---|---|---|
| 5.1 | `src/shared/lib/inspection-photos.ts` | Alto | Las fotos se suben a 1600 px pero se sirven a tamaño completo en grillas de miniaturas: MBs por pantalla. | Servir miniaturas con transformación (`transform: { width: 400, quality: 70 }` en `createSignedUrl`) y la original solo al hacer zoom. |
| 5.2 | `src/modules/review/api/useReviewDetail.ts` 126-190 | Medio | Waterfall: `sections` debe resolver antes de fields/photos/reviews/repairs (2 saltos de red). | Un RPC `get_review_detail(inspection_id)` que devuelva todo en un round-trip, o filtrar por `inspection_id` (ya indexado) en vez de por `secIds`. |
| 5.3 | `src/lib/photo-urls.ts` | Bajo | Ya hace batch-signing + caché con refresh; mantener. | Sin cambios. |

## 6. UX percibida

- Hay `LoadingState`/`PageLoader`, pero **no hay skeletons** en Review Detail ni Admin Detail: pantalla en blanco durante la carga. Añadir skeletons por panel.
- **Sin optimistic updates** en precios de reparaciones, notas internas y visibilidad de fotos: el usuario espera el round-trip. Usar `onMutate` de React Query.
- Publicar informe bloquea la UI sin progreso por paso.

## 7. PWA

- Precache correcto del shell; `rest/v1` intencionalmente excluido (bien).
- Falta **fallback offline** para el flujo de inspección en campo (el caso de uso más crítico en móvil): página offline + cola de subidas persistida en IndexedDB.

## Priorización (impacto × esfuerzo)

| Prioridad | Acción | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | Envolver `auth.uid()` en subselect en las ~40 políticas RLS | Alto | Bajo |
| 2 | Quitar `select('*')` en Admin Detail e Inspector (§3.1, §3.2) | Alto | Bajo |
| 3 | Miniaturas transformadas en Storage (§5.1) | Alto | Bajo |
| 4 | `refetchOnWindowFocus: false` + hooks compartidos de profiles/contractors | Medio | Bajo |
| 5 | `memo`/`useCallback` en paneles de Review y Admin Detail | Alto | Medio |
| 6 | Virtualizar galerías y catálogo | Alto | Medio |
| 7 | RPC único para Review Detail (§5.2) | Medio | Medio |
| 8 | Skeletons + optimistic updates | Medio | Medio |
| 9 | Autohospedar Inter, lazy del banner, lazy en OwnerReport | Medio | Bajo |
| 10 | Índice `idx_profiles_role_active` | Bajo | Bajo |
| 11 | Fallback offline PWA para inspección en campo | Medio | Alto |

## Cómo medir con herramientas externas

- **Lighthouse** (DevTools → Lighthouse, modo Mobile): correr sobre `/reportes/:propertyId/:token` (público) y `/inspector`. Umbrales B2B aceptables: LCP < 2,5 s, TBT < 300 ms, CLS < 0,1, TTI < 4 s. Priorizar TBT: es donde pega el JS de los detalles.
- **Performance tab**: grabar abriendo una inspección en `/executive/inspection/:id`. En el flame chart buscar tareas largas (> 50 ms) bajo `commitRoot`; barras anchas repetidas al tipear = falta de `memo`.
- **Network tab** con throttling *Fast 3G*: mirar la cascada de `rest/v1`; si `inspection_photos` arranca después de `inspection_sections`, es el waterfall §5.2. Revisar también el tamaño de las respuestas de fotos.
- **React DevTools Profiler**: activar "Record why each component rendered", abrir el detalle de review y editar un precio; ordenar por *Ranked* para ver los componentes más costosos.
- **Backend → Reports (Lovable Cloud)**: revisar slow queries (esperables las de `inspection_field_values`/`photos` con RLS), saturación de conexiones y tamaño de la base. La herramienta de slow queries del chat también sirve para rankear por tiempo total.
- **WebPageTest**: test desde *Mexico City* o *Santiago*, dispositivo *Moto G4 / 4G*, 3 corridas, first + repeat view. La repeat view valida que el service worker esté sirviendo el shell.

## Alcance sugerido para implementar

Propongo ejecutar las prioridades 1 a 4 en una primera tanda (bajo riesgo, impacto medible) y luego 5 a 9 en una segunda. Confirmá si arrancamos con la tanda 1-4.
