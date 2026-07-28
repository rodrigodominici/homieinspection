## Objetivo

Rediseñar el tab **Presupuesto** del reporte público como **cotizaciones independientes en tarjetas desplegables** (accordion). Cada bloque colapsado muestra solo su total; al expandir se ve el detalle con Subtotal → IVA → Total. Sin mezclar categorías, sin sumar totales globales.

Previsualización aprobada en `/tmp/browser/budget/mock2_collapsed.png` (colapsado) y `mock2_open.png` (expandido) con datos reales de "Carlos Pezoa Véliz 190 D 212".

## Cambios en `src/pages/public/OwnerReport.tsx`

1. **Reemplazar `BudgetBlock` por `BudgetQuotationAccordion`** usando `<Accordion type="multiple">` de shadcn (`@/components/ui/accordion`, ya presente en el sistema). Props:
   - `id`, `title`, `variant: 'required' | 'optional'`, `icon`.
   - `groups: SectionPayerGroup[]`.
   - `subtotalAllForProration: number`, `discountAmount: number`, `discount`, `taxConfig`, `formatMoney`.
   - `interactive`, `decisions`, `onDecisionChange`, `lockedMap`.

2. **Header colapsado del accordion** (siempre visible):
   - Icono redondeado (fondo `primary-soft` para recomendadas, `muted` para opcionales).
   - Título ("Inquilino · Recomendadas", etc.) — cursiva/muted cuando `optional`.
   - Subtítulo con chips separados por punto: `N reparaciones · M secciones · IVA incluido`.
   - A la derecha: label "TOTAL" + monto grande en `font-mono tabular-nums`, color `primary` (recomendadas) o `muted italic` (opcionales).
   - Chevron shadcn con rotación.

3. **Body del accordion**:
   - Grupos por sección con subheader tenue (`uppercase`, `text-[11px]`, tracking amplio) y monto de sección a la derecha.
   - Items con nombre, descripción opcional, badge Recomendada/Opcional, y línea `cantidad × precio unitario = subtotal`.
   - En modo interactivo (owner), radios Aceptar/Observar/Rechazar como hoy, con `projectedSum` afectando el total del header en vivo.
   - Bloque de totales al pie: `Subtotal`, `Descuento comercial` (si aplica, prorrateado), `IVA {label} {pct}%`, `Total cotización` destacado.

4. **Estado inicial de expansión**:
   - `defaultValue`: los IDs de las cotizaciones **Recomendadas** con al menos 1 ítem. Las opcionales arrancan cerradas.
   - Vacías no se renderizan.

5. **Callout arriba del tab**: pill `primary-soft` — `"{N} cotizaciones independientes. Toca cada una para ver el detalle. No se suman entre sí."`

6. **Resumen mínimo al pie** (reemplaza tarjeta combinada actual, líneas 983-1059):
   - `Total recomendadas` (owner-req + tenant-req, cada uno ya con descuento+IVA prorrateados).
   - `Total opcionales` en cursiva/muted.
   - Nota: "Cada cotización se decide y factura por separado — los totales no se suman."

7. **Rama `tenant`** (líneas 1061-1120): mismo componente, con las 2 cotizaciones del inquilino.

8. **Prorrateo del descuento e IVA por bloque**:
   - Calcular `subOwnerReq/Opt`, `subTenantReq/Opt` una vez en `OwnerReport` (usando `projectedSum` en owner interactivo, `sumRepairs` en el resto).
   - `subAll = suma de los 4`.
   - Descuento por bloque = `round(discountAmount * subBloque / subAll)`.
   - IVA por bloque = `round((subBloque - descuentoBloque) * pct / 100)` cuando `taxConfig.enabled`.

## Fuera de scope

- No se toca `publishInspection`, `get_published_report`, tab Reporte, firma, lógica de submit ni RPC.
- No se agregan sub-tabs; el accordion vive dentro del tab Presupuesto actual.
- Aplica automáticamente a reportes ya publicados (solo cambia el render en cliente).

## Verificación

- Reporte `RE0004350 / 49db9cc9-…` en móvil: colapsado debe verse como `mock2_collapsed.png`; expandido como `mock2_open.png` (Total cotización = $179.158 y $48.917).
- Reporte con descuento activo: confirmar prorrateo por bloque.
- Vista `audience=tenant`: dos cotizaciones de inquilino, sin las de propietario.
