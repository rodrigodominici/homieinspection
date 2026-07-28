## Contexto

Búsquedas revisadas:

- **Admin** — `AdminInspections.tsx` líneas 401-406: `q = searchQuery.trim().toLowerCase()`, luego `address.includes(q) || property_id.includes(q) || property_name.includes(q)`.
- **Ejecutivo** — `ExecutiveReviewQueue.tsx` líneas 121-125: idéntico patrón sobre `[address, property_name, property_id]`.

## Diagnóstico

Tres limitaciones que producen falsos negativos:

1. **Substring contiguo.** La query debe aparecer como una sola cadena. Ej.: buscar `"carvajal 1202"` no matchea `"Carvajal 0330 D 1202 , Santiago — …"` porque "carvajal" y "1202" no son contiguos. En el caso del screenshot, `CARVAJAL 0330 D 1901` no matchea porque no existe la unidad **1901** en la BD (verificado con SQL), pero el equipo espera que al menos surjan las Carvajal 0330 relacionadas — cosa que sí ocurriría con tokens independientes.
2. **Cobertura de campos limitada.** Sólo se busca en `address`, `property_id`, `property_name`. No se busca por inspector, ejecutivo, mercado, HubSpot property id ni por inquilino/propietario (nombres que sí aparecen impresos en las filas). Los usuarios escriben "vanessa carvajal" o "sergio chavez" esperando resultados.
3. **Sin normalización.** Comparación sensible a acentos, comas y espacios repetidos. `"Ñuñoa"` vs `"nunoa"`, `"Carvajal, 0330,"` vs `"carvajal 0330"`, etc.

## Cambio propuesto

Un único helper de matching, reutilizado por Admin y Ejecutivo. Puramente presentación/filtrado en cliente.

### 1. Nuevo helper `src/lib/inspection-search.ts`

- Exporta `buildInspectionHaystack(insp, opts)` que concatena en un string normalizado los campos:
  - `property_name`, `address`, `property_id`, `hubspot_property_id`, `market`, `inspection_type`.
  - `inspectorName`, `executiveName` (recibidos vía `opts` desde los mapas de perfiles que ya existen).
  - `tenant_name`, `owner_name` extraídos con `getEffectiveSnapshot(insp)` (ya usados en otros paneles).
- Exporta `matchesInspectionQuery(haystack, rawQuery)`:
  - `normalize(s) = s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()`.
  - Tokeniza la query por espacios; requiere que **cada token** aparezca como substring en el haystack normalizado (AND de tokens).
  - Query vacía → siempre `true`.

### 2. `AdminInspections.tsx`

- Precomputar `haystackByInsp: Map<id, string>` con `useMemo` sobre `inspections + inspectorProfiles + executiveProfiles`.
- Reemplazar las líneas 401-406 por `if (q && !matchesInspectionQuery(haystackByInsp.get(i.id) ?? '', searchQuery)) return false;`.

### 3. `ExecutiveReviewQueue.tsx`

- Mismo patrón: precomputar haystack con los perfiles ya cargados (`inspectorProfiles`) y aplicar `matchesInspectionQuery`.
- El placeholder del input pasa de "Buscar por dirección o propiedad..." a "Buscar por dirección, unidad, inspector, propietario…".

### 4. UX menor

- Cuando la búsqueda produce 0 resultados, mostrar debajo del EmptyState un hint: "Prueba con menos palabras o quita filtros." (sólo si `searchQuery` no está vacía). Aplica a ambas vistas.

## Fuera de alcance

- Búsqueda fuzzy / tolerancia a typos (no lo pidió el usuario y añade complejidad).
- Search server-side / paginado sobre índices FTS. Se puede evaluar en un siguiente tier si el volumen crece.
- Cambios en `AdminSchedule` / `ExecutiveSchedule` (no tienen input de texto libre — filtran por dropdowns).

## Verificación

- Typecheck + build.
- Manual en preview:
  - Admin: buscar `"vanessa carvajal"` → aparecen todas las Carvajal asignadas a Vanessa.
  - Admin: buscar `"sergio chavez"` → aparece Carvajal 0330 D 1202.
  - Admin: buscar `"nunoa 3361"` → aparece "Marchant Pereira . Ñuñoa 3361 D 706".
  - Ejecutivo: mismos casos.
