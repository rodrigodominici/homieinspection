# Plan — Ajustes vista de revisión ejecutiva

## 1. Reestructurar resumen financiero (sticky top bar)

En `ExecutiveReviewDetail.tsx` (líneas 630–663), reemplazar los 4 bloques actuales por 7 bloques en este orden:

```
Depósito · Inquilino · Inquilino Opcional · Inquilino Total S/IVA · Propietario · Propietario Opcional · Propietario Total S/IVA
```

- Usar los valores ya calculados en `budgetBreakdown` (`tenantRequired`, `tenantOptional`, `tenantTotal`, `ownerRequired`, `ownerOptional`, `ownerTotal`).
- "S/IVA" = sin IVA (los totales actuales ya son netos; el IVA se aplica en cotización/reporte público).
- El `Total general` y la línea "vs depósito" se mantienen al final como bloque destacado (`bg-primary/10`).
- Reemplazar `fmtCurrency` por `<MoneyDisplay value={...} market={inspection.market} />` para consistencia.
- Mantener `overflow-x-auto` — con 7 bloques + total será necesario scroll horizontal en pantallas chicas.

## 2. Mover "Subtotal sección" debajo de "Reparaciones de esta sección"

Hoy el bloque `Subtotal sección` vive en el panel derecho de fotos (líneas 888–899). Moverlo:

- Eliminar el bloque del `<aside>` derecho.
- Insertarlo dentro de la tarjeta "Reparaciones de esta sección" (líneas 1313+), como fila inferior del header o pie de la lista, mostrando: subtotal visible al propietario + cantidad de reparaciones.
- El panel derecho queda solo con fotos.

## 3. Publicar sin observaciones finales obligatorias

Hoy `handlePublish` (líneas 369–378) bloquea con toast destructivo si hay secciones sin `final_observation`.

Cambios:
- Quitar el bloqueo duro.
- Si `missingSections.length > 0`, abrir un `AlertDialog` con:
  - Título: "Hay {n} secciones sin observación final"
  - Lista de las secciones afectadas
  - Acciones: `Cancelar` / `Publicar de todas formas` (variante primaria).
- Si confirma, ejecutar el publish actual sin tocar el payload de fotos.
- Verificar (ya es así hoy) que el payload `sections[].photos` incluye TODAS las fotos visibles de cada sección independientemente de si tiene `final_observation`. La línea 393 ya filtra solo por `visible_to_owner !== false` — no requiere cambios.
- Las secciones sin observación final se publicarán con `final_observation: null`; el `OwnerReport` ya maneja ese caso.

## 4. Reemplazar inputs numéricos con flechas (spinner)

Los `<Input type="number">` muestran flechas nativas del navegador en desktop que disparan eventos `onChange` molestos y permiten clicks erróneos. Afecta:
- Cantidad, Cliente, Contratista en el editor expandido de reparación (líneas 1683–1700).
- Eventuales otros (MatrixCell en catálogo no aplica porque es admin).

Solución: crear `src/shared/ui/NumberInput.tsx` como wrapper de `<Input>` con:
- `type="text"` + `inputMode="decimal"` + `pattern="[0-9]*[.,]?[0-9]*"`.
- Parseo controlado (acepta coma o punto, normaliza a número).
- Soporte `value` / `onChange(number)`.
- Misma API visual que `Input` (acepta `className`, `step` ignorado).

Reemplazar las 3 ocurrencias en `RepairItemCard`. Esto elimina las flechas y el scroll-wheel.

## 5. Vista de catálogo para ejecutivos (solo lectura)

- Nueva ruta `/executive/catalog` en `App.tsx` envuelta en `ProtectedRoute allowedRoles={['executive']}`.
- Nueva página `src/pages/executive/ExecutiveRepairCatalog.tsx`:
  - Reutiliza la lógica de fetch y la matriz de precios de `AdminRepairCatalog`, pero **sin** botones de edición, sin `MatrixCell` editable (reemplazar por `<span>` con `MoneyDisplay`), sin dialogs de crear/editar/borrar, sin tab de gestión de contratistas/categorías (solo lectura del listado).
  - Para evitar duplicar 900 líneas: extraer el render del listado y de la matriz a `src/modules/catalog/CatalogReadOnlyView.tsx` y consumirlo desde ambas páginas con `readOnly` flag, **o** crear página standalone más simple que solo muestre los items + matriz.
  - Recomendación: página standalone simple (matriz + filtros básicos por categoría/búsqueda). Menos acoplamiento.
- Agregar item de navegación "Catálogo" en `ExecutiveLayout.tsx` con ícono `Wrench` o `BookOpen`.
- RLS: validar que la tabla `repair_catalog_items` y `repair_catalog_item_contractor_prices` permitan `SELECT` al rol `executive`. Si no, agregar policy:
  ```sql
  create policy "executives can view catalog"
  on public.repair_catalog_items for select to authenticated
  using (public.has_role(auth.uid(), 'executive'));
  ```
  (y análogo para contractor_prices, contractors, repair_catalog_categories).

## 6. Re-cotizar contratista al cambiar contratista activo

Hoy `handleContractorChange` (líneas 361–367) solo actualiza `inspections.contractor_id`. Los `contractor_unit_price` de cada repair item quedan congelados en su valor anterior (o en 0 si nunca se asignaron) hasta editar manualmente.

Cambios en `handleContractorChange`:
1. Update `inspections.contractor_id` (igual que hoy).
2. Si el nuevo `contractorId` es `null` → setear `contractor_unit_price = 0` en todos los `inspection_repair_items` de esta inspección (ya hay UPDATE bulk simple).
3. Si hay nuevo contratista:
   - Recolectar `repair_catalog_item_id` de todos los `allRepairs` que lo tengan.
   - Query `repair_catalog_item_contractor_prices` `in (repair_catalog_item_id, ...)` `eq contractor_id`.
   - Para cada repair item:
     - Si hay precio para `(catalog_item_id, contractor_id)` → update su `contractor_unit_price`.
     - Si no hay precio → update a 0 (o dejar igual; decisión: 0, así queda explícito que falta cargar).
   - Items sin `repair_catalog_item_id` (manuales) → no se tocan.
4. Refetch repairs (`fetchAll()` o solo `inspection_repair_items`) para refrescar UI y `contractorTotal`.
5. Toast: "Contratista actualizado · N precios recargados".

Manejar el caso "0 items con catalog_item_id" silenciosamente.

## Detalles técnicos

- **Archivos a editar**: `ExecutiveReviewDetail.tsx`, `App.tsx`, `ExecutiveLayout.tsx`.
- **Archivos a crear**: `src/shared/ui/NumberInput.tsx`, `src/pages/executive/ExecutiveRepairCatalog.tsx`.
- **Migración RLS**: solo si `repair_catalog_items` no es legible por ejecutivos hoy (verificar con `read_query` antes).
- **No tocar**: `OwnerReport.tsx`, `QuotationDialog.tsx`, `AdminRepairCatalog.tsx`.
- **Riesgo bajo**: cambios 1–4 son UI/UX puros. #5 es página nueva. #6 toca lógica de pricing pero está aislada en un handler.

## Fuera de alcance
- Refactor estructural de `ExecutiveReviewDetail.tsx` (1781 líneas) — sigue pendiente para sesión dedicada.
- Cambios en el reporte público (`OwnerReport`).
