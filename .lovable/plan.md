## Resumen

Permitir al ejecutivo aplicar **un único descuento global activo** sobre la cotización de una inspección. El descuento se prorratea proporcionalmente entre las cotizaciones de propietario e inquilino, se aplica **antes de IVA**, y nunca modifica los precios de las reparaciones originales.

---

## 1. Base de datos

### 1.1 Tabla `inspection_quotation_discounts`

Una fila por aplicación de descuento (historial completo). El descuento "vigente" es la fila `is_active = true`; cuando se reemplaza, la anterior queda `is_active = false` con `superseded_at` y `superseded_by_id`.

Columnas:
- `inspection_id` — FK lógica a `inspections`
- `discount_type` — `percentage` | `fixed`
- `discount_value` — numeric (porcentaje 0-100 o monto fijo)
- `discount_reason` — text nullable
- `is_active` — boolean (solo una activa por inspección, garantizado por índice único parcial)
- `applied_by` / `applied_at`
- `removed_by` / `removed_at` (cuando se elimina sin reemplazo)
- `superseded_by_id` — FK a la fila que la reemplazó
- timestamps estándar

Validaciones SQL:
- `discount_value >= 0`
- `discount_type IN ('percentage','fixed')`
- Para `percentage`: valor ≤ 100
- Índice único parcial: `(inspection_id) WHERE is_active = true`

RLS:
- Admins: todo
- Executives: gestionan descuentos de inspecciones asignadas
- GRANTs a `authenticated` y `service_role`

### 1.2 Auditoría

Reusar `inspection_audit_log` con `action` en:
- `quotation_discount_applied`
- `quotation_discount_updated`
- `quotation_discount_removed`

El `note` incluye tipo, valor, monto calculado y razón.

---

## 2. Lógica de cálculo (cliente)

Nuevo helper en `src/lib/quotation-discount.ts`:

```text
input:  subtotalOwner, subtotalTenant, discount {type, value}, taxConfig
output: {
  subtotalOwner, subtotalTenant, subtotalTotal,
  discountAmount,                  // monto total descontado
  discountOwner, discountTenant,   // prorrateo proporcional
  baseOwner, baseTenant,           // subtotal − descuento (base IVA)
  vatOwner, vatTenant,
  totalOwner, totalTenant, grandTotal
}
```

Reglas:
- Prorrateo: `discountOwner = discountTotal × (subtotalOwner / subtotalTotal)`, redondeo a entero, residuo al propietario.
- `discountAmount` para `percentage`: `round(subtotalTotal × value / 100)`.
- `discountAmount` para `fixed`: `min(value, subtotalTotal)`.
- IVA se calcula sobre la base ya descontada usando `applyVat()` existente, por payer.
- Totales nunca negativos (garantizado por el `min`).

---

## 3. UI

### 3.1 Ubicación

En `QuotationView.tsx`, agregar un bloque "Descuento comercial" entre las tarjetas de payer y la conciliación de depósito:

```text
┌─ Descuento comercial ────────────────────┐
│  [estado actual: 10% — $10.000]          │
│  Motivo: "Negociación comercial"         │
│  [Editar]  [Eliminar]                    │
└───────────────────────────────────────────┘
```

Cuando no hay descuento: una tarjeta con CTA `Aplicar descuento`.

### 3.2 Tarjetas de payer

Cada `PayerCard` muestra:
```text
Obligatorio          $X
Opcional             $Y
Subtotal             $S
Descuento           −$D
Base                 $B
IVA (19%)            $V
Total                $T
```

### 3.3 Sheet `QuotationDiscountSheet.tsx`

Campos:
- Tipo: radio `Porcentaje` / `Monto fijo`
- Valor: input numérico con sufijo `%` o prefijo `$`
- Motivo: textarea opcional (placeholder con sugerencias)
- Vista previa en vivo: subtotal, descuento, IVA, total nuevo (combinado y por payer)
- Validación: rango, no exceder subtotal
- Botones: `Cancelar`, `Aplicar` (o `Guardar cambios`)

### 3.4 Summary bar

`BudgetSummaryBar` agrega línea "Descuento" en el tooltip cuando hay uno activo.

---

## 4. Servicio y hook

`src/modules/review/api/quotation-discount.service.ts`:
- `getActiveDiscount(inspectionId)`
- `applyDiscount(inspectionId, {type, value, reason})` — desactiva el anterior, inserta nuevo, escribe audit log
- `removeDiscount(inspectionId)` — marca activo como `is_active=false`, audit log

Hook `useQuotationDiscount(inspectionId)` con react-query: query + mutaciones que invalidan `review-detail`.

---

## 5. Reporte público (propietario)

`get_published_report` ya devuelve el payload normalizado. Al **publicar**, el snapshot incluido en `inspection_report_versions.normalized_payload` debe incorporar:

```json
{
  "discount": {
    "type": "percentage",
    "value": 10,
    "amount": 10000,
    "reason": "Negociación comercial"
  },
  "totals": {
    "subtotal": 100000,
    "discount": 10000,
    "base": 90000,
    "vat": 17100,
    "total": 107100
  }
}
```

`OwnerReport.tsx` muestra desglose:
```text
Subtotal             $100.000
Descuento comercial  −$10.000
IVA (19%)             $17.100
Total final          $107.100
```

Solo se muestra la línea "Descuento" cuando hay uno aplicado al momento de la publicación.

---

## 6. Detalles técnicos

- **Archivos nuevos**: migración, `quotation-discount.ts`, `quotation-discount.service.ts`, `useQuotationDiscount.ts`, `QuotationDiscountSheet.tsx`, `QuotationDiscountCard.tsx`.
- **Archivos modificados**: `QuotationView.tsx`, `BudgetSummaryBar.tsx`, `helpers.tsx` (extender `BudgetBreakdown`), `inspection-actions.service.ts` (incluir snapshot al publicar), `OwnerReport.tsx`, `PublishView.tsx` (mostrar resumen con descuento).
- **No tocar** `inspection_repair_items`: los precios siguen intactos.
- **Lock al publicar**: el descuento queda capturado en el snapshot de la versión; cambios posteriores requieren republicar (mismo comportamiento que reparaciones).

---

## 7. Fuera de alcance (confirmado por PRD)

- Descuentos por reparación o categoría
- Múltiples descuentos acumulativos
- Cupones / reglas automáticas
- KPIs / dashboard de descuentos (se agregan después con la data ya persistida)

---

## 8. Criterios de aceptación

1. Ejecutivo aplica descuento porcentual o fijo desde la vista Cotización.
2. Subtotales por payer permanecen visibles e intactos.
3. Descuento se prorratea proporcionalmente entre propietario e inquilino.
4. IVA se recalcula sobre la base descontada.
5. Eliminar descuento restaura los totales originales.
6. Re-aplicar descuento reemplaza el anterior y deja historial.
7. Cotización publicada refleja el descuento al momento de la publicación.
8. Totales nunca negativos.
9. Cada acción queda registrada en `inspection_audit_log`.
