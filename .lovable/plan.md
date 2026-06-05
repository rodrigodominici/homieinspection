# Fix: CTA "Iniciar Inspección" y gate de fecha de llaves

## Problema observado

En el caso de la captura:
- Estado real de la inspección: `assigned` (o equivalente pre-work).
- Estado derivado (`displayState.key`): `to_coordinate` — porque tiene `fecha_de_termino_real_de_contrato` pero NO `fecha_recoleccion_llaves`.
- Progreso: 0% / sin `started_at`.

Esto causa dos bugs en `src/pages/inspector/InspectorInspectionDetail.tsx`:

### Bug 1 — Etiqueta del CTA incorrecta
Línea 735:
```text
{displayState.key === 'assigned' ? 'Iniciar Inspección' : 'Continuar Inspección'}
```
Cuando `displayState.key` es `to_coordinate`, cae al `else` y muestra "Continuar Inspección" aunque la inspección **nunca se haya iniciado**.

### Bug 2 — Gate de fecha solo cubre status `'assigned'`
Líneas 307, 723, 732 y la lógica usan estrictamente `inspection.status === 'assigned'`. Si la inspección está en `pending` o `pending_assignment` (también pre-work), el botón queda **habilitado** y `handleStart` no bloquea, permitiendo iniciar sin fecha de llaves.

## Solución

Introducir dos derivaciones locales claras y reemplazar los chequeos estrictos:

```text
const PRE_WORK = ['assigned', 'pending', 'pending_assignment'];
const notStartedYet = PRE_WORK.includes(inspection.status) && !inspection.started_at;
const blockStart = notStartedYet && !keyCollectionCoordinated;
```

Cambios puntuales en `src/pages/inspector/InspectorInspectionDetail.tsx`:

1. **CTA label (línea 735)**: usar `notStartedYet ? 'Iniciar Inspección' : 'Continuar Inspección'` en lugar de comparar contra `displayState.key === 'assigned'`. Así, cuando el display sea `to_coordinate` (o `assigned`), igual diga "Iniciar Inspección".

2. **Disabled (línea 732)** y **hint amber (línea 723)**: reemplazar `inspection.status === 'assigned' && !keyCollectionCoordinated` por `blockStart`. Esto extiende el gate a todos los estados pre-work, no solo `assigned`.

3. **`handleStart` (líneas 307 y 316)**:
   - Cambiar el guard inicial a `if (blockStart)` para que cubra `pending`/`pending_assignment` también.
   - Cambiar el bloque que actualiza a `in_progress` a `if (PRE_WORK.includes(inspection.status))` para que cualquier estado previo transicione correctamente al iniciar.

## Fuera de alcance

- No se toca `getInspectorDisplayState` ni la lógica de `to_coordinate` (sigue siendo válido para el badge y filtros).
- No se modifica la persistencia ni RLS.
- No se toca el sync con HubSpot.

## Criterios de aceptación

1. Con inspección en `assigned`/`pending`/`pending_assignment` y sin `fecha_recoleccion_llaves`:
   - El CTA muestra "Iniciar Inspección".
   - El CTA está deshabilitado.
   - Aparece el hint amber pidiendo cargar la fecha.
2. Al cargar la fecha, el CTA se habilita y permanece como "Iniciar Inspección" hasta que `started_at` se setee.
3. Una vez iniciada (`in_progress` con `started_at`), el CTA pasa a "Continuar Inspección".
4. No es posible disparar `handleStart` (ni vía click ni vía estado intermedio) sin fecha de llaves cargada.
