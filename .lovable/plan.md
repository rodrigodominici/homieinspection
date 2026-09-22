# El descuento no aparece en la cotización descargada

## Qué está pasando

La propiedad **Briones Luco 801 D 513 (RE000440)** tiene un descuento activo del **5%** guardado correctamente desde el 12 de agosto.

Ese descuento se ve bien en pantalla (tarjetas de Propietario e Inquilino, tarjeta de descuento) y también en el informe publicado que ve el propietario. Pero el documento que se genera con **"Generar cotización propietario"** / **"Generar cotización inquilino"** (y su botón de imprimir / guardar PDF y de copiar resumen) calcula sus propios totales por su cuenta y nunca recibe el descuento: muestra subtotal, IVA y total sin descontar nada.

Por eso el total del PDF es más alto que el que se ve en la pantalla de Cotización.

## Qué se va a hacer

1. Pasar el descuento activo al documento de cotización, tanto desde la vista del ejecutivo como desde la ficha de administración.
2. En el documento (pantalla, impresión/PDF y texto copiado) agregar, cuando exista descuento:
   - Subtotal recomendadas / opcionales (como hoy)
   - **Descuento comercial (5%)** con el monto en negativo, y el motivo si se registró
   - Base sobre la que se calcula el IVA
   - IVA y Total ya con el descuento aplicado
3. Que el descuento del documento use el mismo reparto proporcional entre propietario e inquilino que ya usa la app, para que el PDF y la pantalla muestren exactamente el mismo total.
4. La cotización del contratista no cambia: ahí van costos internos, sin descuento comercial.
5. Verificación: abrir la cotización de propietario e inquilino de Briones Luco 801 D 513 y comprobar que el total del documento coincide con el de la pantalla.

## Detalles técnicos

- `src/components/QuotationDialog.tsx` recibe dos props nuevas: el `QuotationDiscountInput` activo y el monto de descuento prorrateado para ese `payer` (`discountOwner` / `discountTenant` del `QuotationDiscountBreakdown`). Con eso reemplaza su cálculo local `applyVat(subtotal)` por `applyVat(subtotal − descuento)`, y agrega las filas de descuento y base en el bloque de totales, en `PRINT_CSS`/`summary` del `handlePrint` y en `handleCopy`.
- `src/pages/executive/ExecutiveReviewDetail.tsx` y `src/pages/admin/AdminInspectionDetail.tsx` ya tienen `discountBreakdown` y `activeDiscountInput` en memoria; solo hay que pasarlos al `<QuotationDialog>`.
- Sin cambios de base de datos: la lógica de `src/lib/quotation-discount.ts` y la tabla `inspection_quotation_discounts` quedan igual.
