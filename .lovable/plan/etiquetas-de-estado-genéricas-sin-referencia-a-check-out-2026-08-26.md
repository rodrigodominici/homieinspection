# Etiquetas de estado genéricas (sin referencia a check-out)

Solo cambia el texto visible. No se toca la lógica de estados, transiciones ni filtros.

## Cambios de etiqueta

| Antes | Ahora |
|---|---|
| En espera de check out | En espera de Hallazgos |
| Coordinada p/ recibir | Coordinada |

El tipo de inspección (Check-out / Captación / futuro Check-in) ya se comunica con el chip de tipo, así que las etiquetas de estado quedan neutras.

## Detalles técnicos

Reemplazar el texto en los puntos donde vive hoy:
- `src/shared/ui/status-registry.ts` (`assigned`, `in_progress`)
- `src/lib/inspection-combined-status.ts` (label coordinada y `in_progress` del baseMap)
- `src/lib/inspection-buckets.ts` (`inProgress` STAGE/KPI meta)
- `src/lib/inspector-operational.ts` (estados `in_progress` y `assigned`)
- Textos sueltos en UI: `src/pages/inspector/InspectorDashboard.tsx`, `src/pages/admin/AdminDashboard.tsx`, `src/pages/admin/AdminInspections.tsx` (opciones de filtro y KPI)

Los valores internos (`in_progress`, `assigned`) y los parámetros de URL de filtros permanecen iguales.
