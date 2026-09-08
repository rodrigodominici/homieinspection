# País global de verdad + permisos por país

## Qué está pasando hoy

El selector de país solo alcanza cinco pantallas (Inspecciones, Agenda, Dashboard, cola del Ejecutivo e Inmuebles). Verificado en el código: el catálogo de reparaciones, contratistas, usuarios, los paneles de desempeño de ejecutivos e inspectores, las pantallas del rol comercial (que además conservan su propio filtro de país) y las del inspector no consultan el país global. Por eso al elegir México siguen apareciendo datos, aunque hoy toda la operación es Chile.

Datos reales verificados: 212 inspecciones en "CL" y 3 guardadas como "chile"; 133 ítems de catálogo en CL; 12 usuarios en CL y 2 sin país; impuestos configurados para CL y MX; 5 contratistas en Chile.

## 1. El país cambia toda la app

- Cada pantalla con datos pasa a respetar el país elegido: Inmuebles, Inspecciones, Agenda, Dashboard (incluidos los paneles de carga por ejecutivo, aging de propietario, incompletas y desempeño de ejecutivos e inspectores), cola y agenda del Ejecutivo, catálogo de reparaciones, contratistas, usuarios, impuestos y las pantallas del rol comercial.
- Se elimina el filtro de país propio que todavía tiene la pantalla comercial.
- Al abrir el detalle de una inspección o inmueble que no pertenece al país elegido, la app avisa y ofrece cambiar de país en lugar de mostrarla mezclada.
- Se deja de mostrar la opción "Todos los países" a quien no es administrador: siempre se trabaja dentro de un país. El administrador conserva "Todos los países" para comparar.

## 2. Permisos por país

- Cada usuario tiene uno o más países asignados. Solo puede ver y elegir esos países; el selector muestra únicamente los suyos y, si tiene uno solo, queda fijo sin posibilidad de cambio.
- El administrador siempre ve todos los países.
- La asignación de países se gestiona en Usuarios (al aprobar, al crear y al editar), con selección múltiple.
- El límite no es solo visual: la base de datos también rechaza el acceso a inspecciones, inmuebles y fotos de países que el usuario no tiene asignados. El administrador queda exento.
- Los receptores (inspectores) siguen viendo solo sus propias inspecciones, ahora además acotadas a sus países.

## 3. No queden registros sin país

- Se corrigen las 3 inspecciones guardadas como "chile" para que queden como Chile.
- Los 2 usuarios sin país quedan asignados a Chile.
- Los ítems del catálogo sin país quedan asignados a Chile, y el país pasa a ser obligatorio al crear o editar un ítem.
- La creación manual de inspecciones y la entrada desde HubSpot siempre graban el país en formato canónico ("CL"/"MX"), nunca texto libre.

## Detalles técnicos

Base de datos (una migración):

- `profiles.markets text[] not null default '{CL}'`, backfill desde `normalizeMarket(market)`; `market` se mantiene como país principal para compatibilidad.
- `public.user_markets(_user_id uuid) returns text[]` y `public.user_has_market(_user_id uuid, _market text) returns boolean` (SQL, stable, security definer, `search_path=public`); `true` siempre para rol admin.
- Se añade `public.user_has_market(auth.uid(), market)` a las políticas de lectura existentes de `inspections`, y por relación a `inspection_sections`, `inspection_field_values`, `inspection_photos` y `inspection_repair_items`. Las policies de admin y las públicas por token (`get_published_report`) no se tocan.
- `UPDATE` de datos: normalizar `inspections.market` ('chile' → 'CL'), `profiles.market/markets` nulos → CL, `repair_catalog_items.market` nulo → 'CL'.
- `prevent_profile_privilege_escalation` se extiende para que un usuario no-admin no pueda cambiar su propio `markets`.

Frontend:

- `MarketContext`: expone `market`, `setMarket`, `matchesMarket`, `availableMarkets` (desde `profile.markets`, o todos + 'all' si es admin) y fuerza el valor a un país permitido; si el valor persistido no está permitido, cae al primero disponible. Se elimina `'all'` para no-admins.
- `MarketSwitcher`: renderiza solo `availableMarkets`; se oculta (chip de solo lectura) cuando hay un único país.
- Aplicar `matchesMarket` en `AdminUsers`, `AdminRepairCatalog` (ítems y matriz de contratistas), `AdminSettings` (impuestos), `ComercialCheckOutList` (y quitar su `Select` local), `InspectorDashboard`, `InspectorAllInspections`, `InspectorCalendar`, `InspectorPastInspections`, `StalledInspectionsPanel`, `OwnerAgingPanel`, `ExecutiveLoadChart`.
- `get_executive_performance()` y `get_inspector_performance()` reciben un parámetro opcional `p_market text default null` y filtran por `normalizeMarket`-equivalente; los paneles lo pasan desde el contexto.
- Guardia de detalle: en `AdminInspectionDetail`, `ExecutiveReviewDetail` y `PropertyDetail`, si el país del registro no coincide con el elegido, mostrar aviso con acción "Cambiar a <país>".
- `src/lib/markets.ts`: `normalizeMarket` como única fuente de verdad; usarlo en `CreateInspectionForm` y en el intake de HubSpot (`supabase/functions/hubspot-inspection-intake`) al grabar `market`.
