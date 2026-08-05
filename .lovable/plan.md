# Duplicar contratista con su matriz de precios

Permitir clonar un contratista existente desde Configuración → Catálogo de reparaciones → pestaña Contratistas, copiando todos sus precios por reparación, y editando el nombre antes de confirmar.

## Flujo

1. En la tabla de contratistas se agrega una acción "Duplicar" (icono copiar) por fila.
2. Se abre un diálogo con:
   - Nombre prellenado: `Copia de <nombre original>` (editable, obligatorio).
   - País prellenado con el del contratista original (editable).
   - Resumen: "Se copiarán N precios de reparaciones".
   - Opción activada por defecto: "Copiar precios de reparaciones".
3. Al confirmar: se crea el contratista nuevo (activo) y se insertan todas las filas de precios del original apuntando al nuevo contratista, manteniendo precio y moneda.
4. Toast de resultado ("Contratista duplicado · N precios copiados") y refresco de la tabla + matriz de precios.
5. Si falla la copia de precios, se elimina el contratista recién creado para no dejar duplicados vacíos, y se muestra el error.

## Detalles técnicos

- Archivo: `src/pages/admin/AdminRepairCatalog.tsx` (pestaña `contractors`).
- Sin cambios de base de datos: se reutilizan `contractors` y `repair_catalog_item_contractor_prices`.
- El conteo de precios a copiar se calcula desde el estado ya cargado (`priceMatrix` / consulta puntual por `contractor_id`), y la inserción se hace en un solo `insert` por lotes.
- Nombre duplicado: se valida contra la lista en memoria y se bloquea el botón con mensaje inline si ya existe.
- Se reutiliza el patrón de `Dialog` + `Input` + `Select` ya presente en la página; sin nuevos componentes globales.
