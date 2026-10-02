# Precios y contratistas separados por país

Con el país elegido arriba (Chile o México), el catálogo de reparaciones, los contratistas y la matriz de precios muestran solo lo de ese país. Si eliges México, no ves nada de Chile, y al revés.

## Qué cambia

1. **Catálogo de México**
   - Se copian las 134 reparaciones de Chile a México, con el precio en 0 y en pesos mexicanos (MXN), para que las ajustes.
   - Los precios de Chile no se tocan.
2. **Contratistas por país**
   - La lista de contratistas muestra solo los del país elegido.
   - Al crear un contratista, el país viene marcado con el país elegido.
   - Al duplicar un contratista, solo se copian los precios de reparaciones de su mismo país.
3. **Matriz de precios**
   - Las filas son las reparaciones del país elegido y las columnas, los contratistas de ese país.
   - Al agregar un precio desde la ficha de una reparación, solo aparecen contratistas de ese país.
   - La moneda se toma del país: pesos chilenos (CLP) en Chile y pesos mexicanos (MXN) en México.
4. **Reparaciones nuevas**
   - El país viene marcado con el país elegido y pasa a ser obligatorio.
5. **Ejecutivo**
   - El catálogo que ve el ejecutivo y el selector de contratista de la cotización muestran solo lo del país de la inspección.
6. **Vista "Todos los países"**
   - Si estás viendo todos los países, la app te pide elegir un país antes de editar precios, para no mezclarlos.

## Detalles técnicos

- **Datos:** se hace una inserción en `repair_catalog_items` copiando cada ítem de `market='CL'` a `market='MX'`, con `base_price=0` y `currency='MXN'`. No se copian `repair_catalog_item_contractor_prices`. No hay cambios de esquema.
- **`AdminRepairCatalog.tsx`:**
  - Filtrar la tabla de contratistas, `availableContractorsForPricing` y el duplicado con `matchesMarket(c.country)`.
  - Preseleccionar el país en `newContractorCountry` e `itemForm.market` desde `useMarket()`.
  - Derivar la moneda del país en lugar de dejar `'MXN'` fijo.
  - Excluir de la matriz los ítems sin país y bloquear la edición cuando `market==='all'`.
  - Al duplicar, copiar solo los precios de ítems cuyo país coincide con el del contratista.
- **Ejecutivo:** filtrar `ExecutiveRepairCatalog` y `ContractorPicker` por el país de la inspección.
