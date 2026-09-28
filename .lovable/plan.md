# Etiquetas y colores del check-in como "Captación" en toda la UX

## Alcance

Solo etiquetas, chips y copys. Sin cambios de datos, estados ni lógica de envío.

Nota importante (ya comentada en el chat): "Captación" ya es otro tipo de inspección existente. Con este cambio, check-in y captación se llamarán igual ("Captación") y se diferenciarán solo por color (check-in en violeta, captación mantiene su verde). Los filtros del tablero y de Inspecciones mostrarán dos botones "Captación".

## 1. Etiquetas centralizadas (`src/lib/inspection-type-labels.ts`)

- `TYPE_LABELS.check_in`: "Check-in" → "Captación".
- `TYPE_LABELS.check_out`: "Check-out" → "Checkout".
- Todo lo que ya usa `getInspectionTypeLabel` (formulario de creación, chips del inspector, propiedades, comercial) se actualiza solo.

## 2. Color violeta para check-in

- `src/components/inspector/InspectionTypeChip.tsx`: tono de `check_in` pasa de ámbar a violeta (fondo/texto/borde con variables semánticas nuevas).
- `src/index.css`: agregar tokens semánticos violeta para el tipo check-in (evita colores hardcodeados y respeta dark mode).
- `src/lib/schedule-helpers.ts`: `CHECK_IN_TOKENS` pasa de teal a violeta (banner, anillo de tarjeta, chip y fondos de agenda Admin/Ejecutivo).

## 3. Envío desde el inspector (`src/pages/inspector/InspectorInspectionDetail.tsx`)

Cuando `inspection_type === 'check_in'`:

- Botón principal: "Completar Captación" (los demás tipos mantienen "Revisar y enviar").
- Diálogo de confirmación: título "¿Completar Captación?" y acción "Completar" (los demás mantienen "¿Enviar inspección?" / "Enviar").
- Toast de éxito: "Captación completada y sincronizada con HubSpot" (los demás mantienen "Inspección enviada"). El aviso de fallo de sync HubSpot se mantiene igual.

## 4. Admin: chip en lista y detalle

Hoy la lista y el detalle muestran el tipo como texto crudo (`check_in`, `check_out`):

- `src/pages/admin/AdminInspections.tsx` (filas de tabla y cards, ~líneas 850 y 943): reemplazar el texto crudo por `InspectionTypeChip` con el label nuevo.
- `src/pages/admin/AdminInspectionDetail.tsx` (resumen "Tipo", ~línea 918): ídem.
- Filtros de tipo con etiquetas hardcodeadas en `AdminInspections.tsx` (~111) y `AdminDashboard.tsx` (~34): pasar a `getInspectionTypeLabel` para que digan "Captación · Captación · Checkout".

## 5. Verificación

- Test de paridad del generador intacto (no toca etiquetas de tipo).
- Build OK + revisión con Playwright: formulario de creación con check_in seleccionado, detalle del inspector (botón, diálogo y toast al enviar la inspección DEMO), y lista/detalle de admin con chip violeta "Captación".
