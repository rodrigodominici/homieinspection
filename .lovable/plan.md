# VAT/IVA configurable por mercado

## Step 1 — Diseño y mapping

### 1. Dónde vive la configuración
Nueva tabla `market_tax_settings` (1 fila por mercado), administrada desde **Configuración → Impuestos**:

| Columna | Tipo | Notas |
|---|---|---|
| `market` | text PK | `CL`, `MX` |
| `vat_enabled` | boolean | default `true` |
| `vat_percentage` | numeric(5,2) | ej. `19.00` |
| `vat_label` | text | default `IVA` (CL) / `IVA` (MX) |
| `currency` | text | informativo (`CLP`/`MXN`) — display en quotation |
| `updated_at`, `updated_by` | — | auditoría |

Seed inicial: `('CL', true, 19, 'IVA', 'CLP')`, `('MX', true, 16, 'IVA', 'MXN')`.

**RLS:** `admin` ALL; `authenticated` SELECT (todos los roles necesitan leerla para renderizar quotations).

### 2. Vínculo con la inspección
- `inspections.market` ya existe (`CL` / `MX`).
- Resolución: `inspection.market` → `market_tax_settings[market]`. Si no existe fila o `vat_enabled = false` → IVA no se muestra (solo Total = Subtotal).

### 3. Cálculo
Helper puro `applyVat(subtotal, taxConfig)`:
```
vatAmount = vat_enabled ? round(subtotal * vat_percentage / 100) : 0
total     = subtotal + vatAmount
```
- Se calcula **sobre el subtotal visible**, no por línea.
- No se persiste IVA en `inspection_repair_items` ni en líneas de payload.
- Para evitar inconsistencias futuras, el `tax_config` (snapshot: `{percentage, label, enabled, currency}`) se incluye en `inspection_report_versions.normalized_payload` al publicar — así reportes publicados conservan la tasa vigente al momento de publicación.

### 4. Dónde se muestra y dónde NO

**SÍ se muestra (footer Subtotal / IVA X% / Total):**
- `QuotationDialog` (vista + impresión) — separado por payer (owner/tenant).
- `OwnerReport.tsx` (público) — en bloques de Subtotal propietario, Subtotal inquilino y en Total general (cuando `audience = owner`); solo Subtotal inquilino + IVA + Total cuando `audience = tenant`.

**NO se muestra:**
- `ExecutiveReviewDetail` totales operativos internos (budgetBreakdown, contractor totals, utility, sección subtotals, repair cards). Permanecen netos.
- `InspectorInspectionDetail`, dashboards, listados.

### 5. Owner / tenant
- Owner quotation: IVA sobre `sum(repairs where payer_role='owner' && visible_to_owner)`.
- Tenant quotation: IVA sobre `sum(repairs where payer_role='tenant' && visible_to_owner)`.
- Public owner audience: dos bloques (subtotal owner + IVA + total parcial; subtotal tenant + IVA + total parcial) y un Total general = suma de ambos totales con IVA.
- Public tenant audience: solo bloque tenant.
- Misma fórmula `applyVat` en cada subtotal — evita drift de redondeo.

---

## Step 2 — Implementación

### A) Base de datos (migration)
1. Crear `market_tax_settings` con columnas y RLS arriba.
2. Insertar seeds CL/MX.

### B) Tipos y helper
- `src/lib/types.ts`: añadir `MarketTaxSettings`.
- Nuevo `src/lib/tax.ts`:
  - `fetchTaxConfig(market): Promise<MarketTaxSettings | null>` (cache por sesión).
  - `applyVat(subtotal, config): { subtotal, vatAmount, total, label, percentage, enabled }`.
  - `formatVatLine(...)` para reutilizar en UIs.

### C) Settings UI
En `AdminSettings.tsx` añadir nueva Card **"Impuestos por mercado"**:
- Tabla editable inline (CL, MX): `vat_enabled` (Switch), `vat_percentage` (Input number), `vat_label` (Input). Botón Guardar por fila → `update market_tax_settings`.
- Solo visible para admin (página ya está bajo AdminLayout).

### D) QuotationDialog
- Recibir `inspection.market`, cargar `taxConfig` (efecto al abrir).
- Reemplazar bloque `.totals`:
  ```
  Subtotal obligatorias  $X
  Subtotal opcionales    $Y
  Subtotal               $S
  IVA 19%                $V    (si enabled)
  Total                  $T
  ```
- Mismo render en HTML de impresión y en `handleCopy`.

### E) OwnerReport (público)
- `get_published_report` ya retorna `normalized_payload` completo. Leer `payload.tax_config` (snapshot al publicar). Si ausente (reportes legacy) → no mostrar IVA (compat).
- Render bloque IVA bajo cada Subtotal y en Total general según `audience`.

### F) Publish flow (`ExecutiveReviewDetail.handlePublish`)
- Antes de insertar `inspection_report_versions`, fetch `taxConfig` por `inspection.market` y agregar `tax_config` al `payload`. No cambia totales internos.

### G) Sin cambios
- `inspection_repair_items` schema intacto.
- Editor ejecutivo, dashboards, secciones internas: sin cambios visuales.

---

## Resumen de entregables

- **Configurado en:** Admin → Configuración → "Impuestos por mercado" (tabla `market_tax_settings`).
- **Aplicado:** `inspection.market` → resolver config → helper `applyVat(subtotal)`.
- **Renderizado en:** `QuotationDialog` (owner y tenant) + `OwnerReport` público (owner y tenant audiences) + impresión.
- **Owner vs tenant:** cada quotation calcula su propio IVA sobre su subtotal visible filtrado por `payer_role` (y `visible_to_owner` para públicas). Snapshot de `tax_config` se persiste en `normalized_payload` al publicar para inmutabilidad histórica.
