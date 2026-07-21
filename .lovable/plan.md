Cambios a los presupuestos y al reporte público del propietario. Solo UI + payload de publicación (sin cambios de esquema).

## 1. Cambio de terminología: "Obligatoria" → "Recomendada"

En todos los lados donde aparece la etiqueta de `payment_nature === 'required'`, mostrar **"Recomendada"** en lugar de "Obligatoria" (y "Recomendadas" en los subtotales). El valor en la base de datos sigue siendo `required` — solo cambia el texto visible.

Archivos: `src/components/QuotationDialog.tsx`, `src/pages/public/OwnerReport.tsx`, `src/pages/executive/review-detail/QuotationView.tsx` (subtítulo "Obligatorio" del PayerCard), y cualquier badge similar en `RepairsTableView` / `SectionRepairsPanel` si aplica.

## 2. Detalle de valor unitario y cantidad en cotizaciones

El diálogo `QuotationDialog` ya muestra columnas Cant. / Precio / Subtotal en pantalla y en el HTML de impresión — se queda como está.

En el **reporte público** (`OwnerReport.tsx`) hoy solo se ve el subtotal de cada reparación. Cambio: mostrar debajo del nombre una línea tipo `2 × $12.000 = $24.000` (cantidad × unitario = subtotal) para cada repair row, tanto en modo interactivo como bloqueado.

## 3. Cotización dividida en 4 bloques (propietario/inquilino × recomendada/opcional)

### 3a. Vista pública del propietario (`OwnerReport.tsx`, pestaña Presupuesto)

Reemplazar las dos cards actuales ("propietario" y "inquilino") por **cuatro** cards, en este orden:

1. Propietario · Recomendadas
2. Propietario · Opcionales (en cursiva/tono sutil)
3. Inquilino · Recomendadas
4. Inquilino · Opcionales (en cursiva/tono sutil)

Cada card muestra sus reparaciones agrupadas por sección y su propio subtotal ("Subtotal recomendadas propietario", "Subtotal opcionales propietario" en cursiva, etc.).

**No** se calcula un subtotal general que sume recomendadas + opcionales. En su lugar la card de resumen final muestra los 4 subtotales por separado + IVA/descuento aplicados donde corresponda + un "Total recomendadas" y un "Total opcionales" separados. Se elimina el "Total general" que mezclaba todo.

La lógica de feedback del propietario (aceptar/observar/rechazar) sigue funcionando exactamente igual — cada bloque contiene los mismos ítems que hoy, solo cambia la agrupación visual.

### 3b. Vista ejecutivo (`QuotationView.tsx`)

En cada PayerCard mostrar los subtotales como:
- Recomendadas: `$X`
- Opcionales: `$Y` (cursiva)
- (sin línea "Subtotal" que sume ambos)
- Descuento / IVA / Total como hoy

### 3c. Diálogo imprimible `QuotationDialog.tsx`

Cambiar el resumen para mostrar "Subtotal recomendadas" y "Subtotal opcionales (cursiva)" sin línea de subtotal combinado antes del IVA. El total sigue existiendo porque el IVA se aplica sobre la suma — pero se presentará como el total final del documento, no como un "subtotal" intermedio.

## 4. Firma del inquilino visible en el informe de hallazgo

Hoy el payload publicado (`normalized_payload` armado en `publishInspection`) no incluye la firma. Cambios:

- En `inspection-actions.service.ts::publishInspection`: leer `inspection_signatures` para la inspección y añadir al payload un bloque:
  ```
  signature: {
    status: 'signed' | 'unavailable' | 'skipped',
    signer_name: string | null,
    signature_data: string | null,   // dataURL PNG
    skip_reason: string | null,
    signed_at: string | null,
  }
  ```
- En `OwnerReport.tsx`, pestaña **Reporte**, añadir al final una nueva `Card` "Firma del inquilino" que:
  - Si `status === 'signed'`: renderiza `<img src={signature_data}>` + nombre del firmante + fecha.
  - Si `status === 'unavailable'` o `skipped`: muestra un aviso "El inquilino no firmó" + motivo si existe.

- Actualizar el tipo `ReportPayload` para incluir el nuevo campo `signature`.

## Detalles técnicos

- No requiere migración de base de datos. `signature_data` ya es `text` (dataURL base64) en `inspection_signatures`.
- Los reportes ya publicados no tendrán firma hasta que se re-publiquen. Añadir un `select` defensivo (`payload.signature ?? null`) en el componente para no romper links antiguos.
- El cambio de "Obligatoria" → "Recomendada" es puramente cosmético: no cambia enums, DB ni RPCs.
- Los cálculos de descuento/IVA por payer se mantienen exactamente iguales; solo cambia la presentación visual.

## Fuera de alcance

- No se cambia la lógica de aprobación ni el feedback del propietario.
- No se cambia el flujo del contratista (`ContractorQuotationDialog`) — allí no aplica "recomendada/opcional" ni "propietario/inquilino".
