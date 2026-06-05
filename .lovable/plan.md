## Objetivo

Hacer los controles de Aceptar / Observar / Rechazar más amigables y mostrar subtotales en vivo que reflejen las decisiones del propietario (excluyendo los rechazados), para que pueda ver inmediatamente cuánto pagará.

## Alcance

Solo `src/pages/public/OwnerReport.tsx` (UI del reporte público para propietario, tab "Presupuesto"). No se tocan datos, RPCs, ni la lógica de submit.

## Cambios

### 1. Control de decisión por reparación (`RepairDecisionControl`)

Reemplazar los 3 botones outline actuales por un **segmented toggle tintado** dentro de un track gris:

- Track: `bg-slate-100 rounded-lg p-1 grid grid-cols-3`
- Botón sin seleccionar: texto `text-muted-foreground`, sin borde, hover sutil
- Botón seleccionado:
  - Aceptar → fondo `primary` (indigo) + texto blanco + ícono check
  - Observar → fondo blanco + borde y texto ámbar
  - Rechazar → fondo `destructive` + texto blanco + ícono X
- Sombra suave (`shadow-sm`) solo en el botón activo para dar sensación de "pill" elevado

### 2. Tarjeta de reparación tintada según estado

El contenedor de cada reparación (`RepairRow` / wrapper) cambia de tono según la decisión:

- Sin decidir → neutro (actual)
- Aceptada → borde y fondo muy suave en primary (`border-primary/20 bg-primary/[0.03]`)
- Observada → borde y fondo ámbar suaves (`border-amber-200 bg-amber-50/40`)
- Rechazada → fondo gris, opacidad 70%, **precio y nombre tachados**

Esto da feedback visual inmediato sin necesidad de leer texto.

### 3. Subtotales dinámicos (en vivo)

Hoy `ownerTotal`, `tenantTotal`, `grandTotal` suman todas las reparaciones publicadas. Cuando el reporte es **interactivo** (propietario con feedback abierto), recalcular según decisiones del usuario:

- **Aceptado + Observado** → cuentan
- **Rechazado** → se excluye
- **Sin decidir** → se muestra como "pendiente" pero también se suma (para mostrar el máximo)

Mostrar dos números cuando hay diferencia:
- "Total proyectado" (en grande, primary) = aceptado + observado + pendientes
- Línea pequeña: "− Rechazado: $X" cuando hay rechazos, en `text-muted-foreground` con guión

Por cada card (propietario, inquilino, total general):
- Subtotal proyectado actualizado
- IVA recalculado sobre el proyectado
- Total recalculado

En modo no-interactivo (ya bloqueado o tenant), se mantiene el comportamiento actual.

### 4. Hint visual en bloque de instrucciones

Pequeño ajuste de copy del banner azul de instrucciones: aclarar que el total se actualiza a medida que decide.

## Detalle técnico

- Nuevo helper `sumRepairsByDecision(repairs, decisions)` que devuelve `{ projected, rejected, pending }`.
- `RepairRow` recibe la decisión actual y aplica clases condicionales al wrapper.
- `RepairDecisionControl`: cambiar markup a segmented toggle; mantener la misma API (`state`, `onChange`).
- Mantener uso de tokens semánticos donde sea posible (`primary`, `destructive`, `muted-foreground`). Los tonos ámbar se mantienen con clases tailwind directas (igual que hoy) por consistencia con el estado "observación" ya usado en el resto del sistema.
- El Textarea de comentario obligatorio (observar/rechazar) se mantiene tal cual, debajo del toggle.

## Fuera de alcance

- Cambios en `submit_owner_feedback` RPC o lógica de validación.
- Cambios en el footer sticky de envío (ya funciona bien con el contador).
- Cambios en la vista del ejecutivo (`OwnerFeedbackPanel`).
- Vista del inquilino (sin decisiones).
