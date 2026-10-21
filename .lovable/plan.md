# Partida "Por cotizar" en la cotización

## Qué se construye
En la cotización, el ejecutivo puede agregar una partida **"Por cotizar"**. Sirve para los casos en que el precio todavía no está definido o se está validando el tamaño del trabajo.

- Botón nuevo **"Agregar partida por cotizar"**, al lado de "Agregar partida del catálogo". El ejecutivo escribe la descripción, la sección y la cantidad, sin precio.
- En la cotización, el informe al inversionista y el PDF, la partida muestra **"Por cotizar"** en lugar del monto.
- **No suma al total.** Debajo del total aparece la nota "Incluye N partidas por cotizar, no consideradas en el total".
- **Inversionista:** ve la partida, pero no tiene que aprobarla ni rechazarla. Su respuesta se pide recién cuando la partida tenga precio.
- **Orden de trabajo:** las partidas por cotizar no se envían al contratista. Cuando el ejecutivo les pone precio, pasan a ser partidas normales y siguen el flujo de siempre: se publica una nueva versión al inversionista y, con su aprobación, se incluyen en la OT.
- Al ponerle precio, la partida puede quedar como texto libre o reemplazarse por una partida del catálogo.

## Fuera de alcance
- El historial de cambios de la cotización (punto 2) se hace por separado, después de este.

## Detalles técnicos
- Migración: agregar a `inspection_repair_items` la columna `is_pending_quote boolean not null default false`. Con la partida por cotizar, `unit_price` y `contractor_unit_price` quedan en 0 y no se calcula `subtotal`.
- Cotización (ejecutivo): nueva acción en `useReviewActions` para crear la partida, y un badge "Por cotizar" en la fila. Al cargar un precio, `is_pending_quote` pasa a false.
- Totales: excluir las partidas pendientes en todos los totales (vista del ejecutivo, informe, PDF, `get_executive_performance`). Hoy ya suman 0; se agrega el contador para la nota.
- Informe publicado: `normalized_payload` incluye `pending_quote: true` por partida. `submit_owner_feedback` deja de exigir decisiones para esas partidas (se excluyen de `v_expected_ids`), y la pantalla del inversionista no muestra botones de aprobar o rechazar en ellas.
- OT: `assign_work_order` inserta solo partidas con `is_pending_quote = false`.
- Prueba: agregar una partida por cotizar, publicar, confirmar que el inversionista puede responder sin decidir sobre ella, y que no entra en la OT ni en el total.
