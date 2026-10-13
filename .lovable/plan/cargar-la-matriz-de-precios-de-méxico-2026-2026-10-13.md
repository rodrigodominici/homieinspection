# Cargar la matriz de precios de México 2026

## Qué haremos
1. **Reemplazar el catálogo de México.** Se borran las 128 partidas copiadas de Chile, todas en $0, junto con sus precios de contratista. Chile no se toca. Si alguna ya se usó en una cotización de México, esa cotización conserva su nombre y su precio, y solo se suelta el vínculo con el catálogo.
2. **Cargar las partidas de la hoja "OFICIAL Q3 2025"** (unas 65), con:
   - nombre y unidad tal como están en la planilla;
   - precio al cliente = "Precio Homie sin IVA", en MXN. El IVA lo suma la app.
   - categoría: se toma de la hoja "HOMIE" cuando el nombre coincide. Si no coincide, queda en "General".
3. **Contratistas de México:**
   - Crom y RDA (R-DAZA) ya existen: se cargan sus costos desde las columnas de la hoja oficial.
   - Diamante y Arquipaq se crean y se cargan sus costos desde la misma hoja.
   - Iván Varela se crea y su costo se toma de su propia hoja, cruzando por nombre de partida.
4. **Reporte de coincidencias.** Antes de guardar, te muestro:
   - partidas sin precio Homie;
   - partidas repetidas (por ejemplo, "Barniz de puertas" aparece dos veces);
   - partidas de Iván Varela que no están en la lista oficial;
   - costos de contratista mayores al precio al cliente.

   Tú decides qué hacer con cada caso y recién ahí cargo.

## Fuera de alcance
- La columna "NUEVO PROVEEDOR" no se carga, porque no tiene nombre.
- No hay cambios de pantallas: solo se cargan datos.

## Detalles técnicos
- La planilla se lee con pandas y se cruza por nombre normalizado (minúsculas, sin espacios dobles ni tildes).
- Datos: `repair_catalog_items` queda con is_active=false para market='MX'. Se insertan partidas nuevas (market MX, currency MXN, pricing_type igual al existente). Las categorías faltantes se crean en `repair_catalog_categories`.
- Los costos por contratista van en `repair_catalog_item_contractor_prices` (MXN), y los contratistas nuevos se crean en `contractors` con country MX.
- Verificación: se cuentan los registros cargados y se abre el buscador en una cotización de México.
