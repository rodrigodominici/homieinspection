# Tooltips en KPIs de dashboards + orden correcto en ejecutivo

## Objetivo
1. Que cada tarjeta KPI explique en un tooltip qué inspecciones cuenta y qué acción implica.
2. Corregir el orden de la Bandeja de revisión del ejecutivo para que **Feedback propietario** quede después de **Esperando propietario**, respetando la secuencia real del flujo.

## Cambio 1 — Reordenar KPIs del ejecutivo
Archivo: `src/pages/executive/ExecutiveReviewQueue.tsx`

Orden actual:
`Feedback propietario · Para revisar · En revisión · Para publicar · Esperando propietario · Aceptadas`

Orden nuevo (sigue el ciclo de vida real):
`Para revisar → En revisión → Para publicar → Esperando propietario → Feedback propietario → Aceptadas`

Se mantiene el acento rojo de "Feedback propietario" para que siga destacándose como el único que requiere acción del ejecutivo en la post-publicación.

## Cambio 2 — Soporte de tooltip en las tarjetas
Archivo: `src/shared/ui/KpiCard.tsx`
- Agregar prop opcional `tooltip?: string`.
- Cuando esté presente, envolver la tarjeta con `Tooltip` (`@/components/ui/tooltip`) usando `TooltipProvider` + `TooltipTrigger asChild` + `TooltipContent` (max-w ~260px, texto pequeño).
- No cambia layout, solo añade el envoltorio condicional.

Archivo: `src/pages/inspector/InspectorDashboard.tsx`
- Agregar la misma prop `tooltip` al `StatTile` local con el mismo patrón.

## Cambio 3 — Textos de tooltip por KPI

### Ejecutivo (`ExecutiveReviewQueue.tsx`)
- **Para revisar**: "Inspecciones enviadas por el inspector que esperan tu revisión inicial."
- **En revisión**: "Estás revisando estas inspecciones. Continúa para aprobarlas o pedir cambios."
- **Para publicar**: "Aprobadas internamente. Falta enviarlas al propietario."
- **Esperando propietario**: "Publicadas y enviadas al propietario. Aguardando su respuesta."
- **Feedback propietario**: "El propietario solicitó cambios. Requiere tu acción para ajustar y reenviar."
- **Aceptadas**: "El propietario aceptó la cotización. Ciclo cerrado."

### Admin Dashboard (`src/pages/admin/AdminDashboard.tsx`) y Lista (`AdminInspections.tsx`)
Mismos textos que los del ejecutivo para los KPIs equivalentes (Para revisar, Para publicar, Esperando propietario, Feedback propietario, Aceptadas), más los propios de admin que ya existan en esas pantallas (sin cambiar su semántica).

### Inspector (`InspectorDashboard.tsx`)
- **Total asignadas**: "Todas tus inspecciones activas (asignadas + en progreso)."
- **Por coordinar**: "Falta coordinar fecha o acceso con el propietario/inquilino."
- **Por iniciar**: "Coordinadas y listas para arrancar el día de visita."
- **En progreso**: "Ya iniciaste la captura en sitio. Continúa donde quedaste."

## Fuera de alcance
- No se cambian filtros, buckets, ni lógica de cálculo de KPIs.
- No se modifican estilos generales ni se reordena nada fuera del dashboard del ejecutivo.
