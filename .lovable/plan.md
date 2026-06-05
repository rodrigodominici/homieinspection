# Reestructurar cotizaciones e informes internos

## 1. `QuotationDialog` (Propietario / Inquilino)
- Aceptar nueva prop `operationalSections: InspectionSection[]`.
- Reemplazar las tablas separadas de "obligatorias" / "opcionales" por **una tabla por sección del inmueble** (ordenadas por `sort_order`).
- Cada fila incluye un `<Badge>`:
  - `Obligatoria` → variant `secondary`
  - `Opcional` → variant `outline`
- Subtotal por sección en `tfoot`.
- Totales finales: subtotal + IVA + total (igual que hoy), con resumen compacto de obligatorias vs opcionales debajo.
- Actualizar la versión de impresión (PRINT_CSS) y el "Copiar resumen" para reflejar el agrupamiento por sección + tag.

## 2. Dividir `InternalReportDialog` en dos componentes nuevos

### a) `ContractorQuotationDialog` (nuevo archivo)
- Una tabla por sección del inmueble.
- Columnas: reparación (título + descripción), cantidad, **costo del contratista** (`contractor_unit_price`), subtotal.
- **Sin** distinción propietario/inquilino.
- **Sin** tag obligatoria/opcional.
- **Sin** IVA ni utilidad.
- PRINT_CSS propio, título "Cotización Contratista".

### b) `WorkOrderDetailsDialog` (nuevo archivo)
- Contiene exclusivamente la tabla actual "Resumen por categoría" (categoría | total venta | costo contratista | utilidad).
- Título "Detalles de la OT".
- PRINT_CSS propio.

## 3. `ExecutiveReviewDetail.tsx`
- Reemplazar el state `internalReportOpen` por `contractorQuotationOpen` y `workOrderDetailsOpen`.
- Montar los dos nuevos diálogos en lugar de `InternalReportDialog`.
- Pasar `operationalSections` al `QuotationDialog`.

## 4. `QuotationView.tsx` + `ReviewHeaderBar.tsx`
- Reemplazar el item de dropdown "Informe interno" por dos entradas:
  - "Cotización contratista" → abre `ContractorQuotationDialog`
  - "Detalles de la OT" → abre `WorkOrderDetailsDialog`
- Mismo patrón en cualquier otro lugar que dispare el informe interno actual.

## 5. Detalles técnicos
- Helper `groupBySection(repairs, sections)` reutilizable (puede vivir en `helpers.tsx`).
- Sin cambios de DB, RLS, snapshots ni tipos.
- `InternalReportDialog.tsx` queda obsoleto; eliminarlo una vez removidas todas sus referencias.
- Mantener tokens semánticos del design system (sin colores hardcoded).
