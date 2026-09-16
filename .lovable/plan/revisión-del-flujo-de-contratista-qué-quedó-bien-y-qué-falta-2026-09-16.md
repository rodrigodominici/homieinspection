# Revisión del flujo de contratista: qué quedó bien y qué falta

## Lo que sí quedó implementado

Revisé el código y está todo lo del feedback: aceptar/rechazar la orden con motivo, reasignación desde Admin/Ejecutivo, "Informe de hallazgos" dentro de la orden, el campo de costo real ya no existe en la app del contratista (Admin/Ejecutivo sí ve el histórico), foto "Después" obligatoria y "Antes" opcional, y estado de llaves obligatorio al firmar (con número y clave si es candado). El panel de Admin/Ejecutivo compara hallazgos, cotización aprobada e informe final.

## El problema real: la orden de prueba quedó "usada"

Las capturas muestran la orden de San Isidro 337 D 1207 como **En curso** con **5 de 5 reparaciones terminadas**, así que Operaciones nunca ve la pantalla de aceptar/rechazar ni puede registrar nada nuevo. En la base de datos la orden quedó así:

- estado `En curso` pero **sin fecha de aceptación** (quedó de las pruebas automáticas previas, es un estado inconsistente),
- las 5 reparaciones marcadas como *Terminada*, cada una con su foto "Después" cargada,
- sin estado de llaves registrado.

## Qué se hace

1. **Dejar la orden de prueba lista para probar de cero**: volver a "Asignada · por aceptar", limpiar aceptación/rechazo, reparaciones de nuevo en *Pendiente* sin comentarios, borrar las fotos antes/después cargadas en las pruebas (archivos y registros), limpiar el estado de llaves y la firma, y volver la inspección a la etapa previa de obra.
2. **Evitar que se repita la inconsistencia**: una orden no puede quedar "En curso" sin fecha de aceptación; se corrige a nivel de base de datos para que ese salto no sea posible.
3. **Verificación end-to-end** con el usuario de prueba del contratista en móvil: ve la orden por aceptar → abre el Informe de hallazgos → acepta → registra una reparación con foto "Después" → firma indicando llaves en candado con número y clave → la orden queda En revisión; y en Admin/Ejecutivo se ven los tres bloques comparables, el estado de llaves y las acciones de aprobar/devolver/reasignar. Al terminar, la orden se deja otra vez en el estado inicial para que Operaciones pruebe desde cero.

## Detalle técnico

- Limpieza de datos (no de esquema): `inspection_work_orders` de la orden demo `00fbf15d…` vuelve a `status='open'` con `accepted_at/accepted_by/rejected_at/contractor_rejection_reason/keys_*/contractor_signature_*/submitted_at` en null; `inspection_work_order_items` vuelven a `pending` con `comment/not_done_reason/completed_at` en null; borrado de las 7 filas de `inspection_photos` con `work_order_item_id` y sus objetos en Storage; `inspections.work_status` vuelve a `not_applicable` y el estado a `approved`.
- Migración de consistencia: trigger `BEFORE UPDATE` en `inspection_work_orders` que rechaza pasar a `in_progress` sin `accepted_at` (y lo setea cuando el cambio viene del RPC `accept_work_order`).
- Verificación con Playwright: sesión del contratista demo (`eb256256…`) y de un ejecutivo, capturas de cada paso.
