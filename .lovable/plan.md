# Plan: limpieza de logs + diagnóstico de calendarios

## Parte 1 — Purga de logs

### Estado actual

| Tabla | Filas |
|---|---|
| `inspection_source_events` | 141 (127 completed, 12 processing, 2 failed) |
| `hubspot_sync_log` | 21 |
| `slack_notifications_log` | 0 |

Las 7 inspecciones publicadas (todas `check_out`):
- RE0003519, RE000295, RE0002175, RE000413, RE0004350, RE0001119, RE0003397

### Acciones (en orden, todas vía `supabase--insert` con DELETE)

1. **`inspection_source_events`** — borrar todos los eventos cuyo `inspection_id` NO esté en la lista de las 7 publicadas (incluye los huérfanos sin `inspection_id`, los `processing`, `failed` y `completed` de inspecciones eliminadas/no publicadas).
2. **`hubspot_sync_log`** — borrar todas las filas cuyo `inspection_id` NO esté en la lista de las 7 publicadas (mantiene historial outbound de las publicadas).
3. **`slack_notifications_log`** — 0 filas, no hace falta.

### Resguardos

- Las 7 inspecciones publicadas conservan su `source_event_id` y su historial de sync HubSpot → no se rompe ningún FK.
- El nuevo `handleDelete` en `AdminInspectionDetail` ya cubre la limpieza de futuros borrados, así que este purgado es un one-shot.
- Después del DELETE, ejecuto un `SELECT count(*)` para confirmar que las 7 publicadas tienen `source_event_id` válido y al menos sus filas de `hubspot_sync_log` (si corresponde).

---

## Parte 2 — Diagnóstico de "Fecha fin de contrato" y "Recepción tentativa"

### Cómo funcionan hoy

Tanto `AdminSchedule.tsx` como `ExecutiveSchedule.tsx` usan **un único campo**: `snapshot.fecha_de_termino_real_de_contrato`, mapeado a `contractEndDate`. El label cambia según `inspection_type` vía `inspection-type-labels.ts`:

- `check_out` → **"Término de contrato"** / micro "Término"
- `captacion` → **"Recepción tentativa"** / micro "Recepción"

Lógica de visualización (idéntica en admin y executive):

```text
si tiene fecha_recoleccion_llaves  → grilla horaria "Programadas"
sino si tiene contractEndDate      → banner amber "Por coordinar" en el día del contractEndDate
sino                               → sección "Sin programar"
```

### Problemas detectados

1. **Las 7 publicadas no aparecen en la grilla horaria.** Ninguna tiene `fecha_recoleccion_llaves` en el snapshot, así que se renderizan como "Por coordinar" sobre la fecha de término — aunque ya fueron inspeccionadas y publicadas. Faltó persistir el campo de recolección de llaves al cerrar la inspección, o el filtro debería excluir estados terminales.
2. **No hay diferenciación visual entre `check_out` y `captacion`** más allá del texto. Para un ejecutivo es difícil distinguir de un vistazo si un "Por coordinar" es un cierre de contrato (urgente, fecha fija) o una captación tentativa (negociable).
3. **El banner amber se renderiza igual** aunque "Recepción tentativa" semánticamente es una fecha estimada y "Término de contrato" es una fecha legal.
4. **No hay filtro por `inspection_type`** en ningún calendario, así que captaciones y check-outs se mezclan en el mismo bucket "Por coordinar".
5. **Inspecciones terminadas (`published`, `approved`, `sent`) siguen apareciendo** en "Por coordinar" si nunca tuvieron `fecha_recoleccion_llaves` — ruido operativo permanente.

### Propuesta (sin implementar todavía)

| # | Cambio | Dónde |
|---|---|---|
| A | Excluir del calendario inspecciones en estados terminales (`published`, `approved`, `sent`, `archived`). Mostrar contador aparte tipo "7 publicadas este mes" si se quiere referencia. | Ambos `*Schedule.tsx`, filtro previo a `programmed/toCoordinate/unscheduled` |
| B | Separar "Por coordinar" en **dos buckets visuales**: `check_out` (amber, sólido, label "Término de contrato") y `captacion` (azul/indigo, borde punteado más marcado, label "Recepción tentativa"). | Render del banner row + sección bottom |
| C | Añadir **pill de filtro por tipo** (`Todas` / `Check-out` / `Captación`) junto al filtro existente de Programadas/Por coordinar. | Pills de filtro |
| D | Mostrar **chip de tipo** (`Check-out` / `Captación`) en cada tarjeta del bottom y en cada item del banner para lectura rápida. | Render tarjetas |
| E | Para `captacion`: prefijar la fecha con `~` o con texto "Estimada · " para reforzar que no es fecha fija. | Render etiquetas de fecha |
| F | (Opcional) Ordenar "Por coordinar" del bottom por proximidad a hoy con divisor "Esta semana / Próximas / Vencidas". | `toCoordinateBottom` |

Los cambios B–F son de UI/presentación; A toca el filtro de datos pero sigue siendo cliente, sin tocar schema ni RPCs.

### Decisión pendiente del usuario antes de implementar

¿Aplicar **A + B + C** (lo mínimo para limpiar ruido y diferenciar tipos), o sumar **D + E + F** para una vista más rica? Lo confirmamos antes de pasar a build.

---

## Detalles técnicos

- DELETEs ejecutados con `supabase--insert` usando `WHERE inspection_id NOT IN (<lista de 7>) OR inspection_id IS NULL`.
- No se requieren migraciones ni cambios de schema.
- No se tocan edge functions.
- Los cambios de calendario quedan acotados a `src/pages/admin/AdminSchedule.tsx` y `src/pages/executive/ExecutiveSchedule.tsx` (más `inspection-type-labels.ts` si agregamos un color token por tipo).
