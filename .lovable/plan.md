## Objetivo

El label "Inquilino" en el bloque "Datos de contacto" de `PropertyBriefingCard` debe variar según `inspection.inspection_type`:

- `check_out` → **Inquilino** (persona que entrega la propiedad)
- `captacion` → **Propietario** (persona que entrega la propiedad en captación)
- otros valores (`check_in`, etc.) → **Inquilino** por defecto

Alcance acotado: solo el label de identidad/contacto en `PropertyBriefingCard`. No se tocan los textos de "Firma del Inquilino", "Datos del Inquilino/Quien Entrega", cotizaciones, ni los roles de pagador (Inquilino vs Propietario en presupuestos), que son conceptos distintos.

## Cambios

### 1. `src/components/PropertyBriefingCard.tsx`

- Calcular `contactPersonLabel` a partir de `inspection.inspection_type`:
  ```ts
  const contactPersonLabel = inspection.inspection_type === 'captacion' ? 'Propietario' : 'Inquilino';
  ```
- Reemplazar el literal `Inquilino` (línea 164) por `{contactPersonLabel}`.

### 2. Nada más

- `inspection_type` ya es un `string` libre en la tabla `inspections`; no requiere migración para aceptar el nuevo valor `'captacion'`. La ingesta vía HubSpot ya pasa el valor tal cual desde el payload.
- No se toca documentación de HubSpot (`AdminIntegrationHubSpot.tsx`) en este cambio; si quieres que la nota `check_in | check_out` también mencione `captacion`, dilo y lo agrego.

## Notas técnicas

- `inspection_type` es columna `text`, no enum, por lo que insertar `'captacion'` desde HubSpot funciona sin cambios de schema.
- El mensaje de WhatsApp (`getWhatsAppUrl`) sigue diciendo "checkout"; queda fuera de este alcance — avísame si quieres que también sea dinámico.
