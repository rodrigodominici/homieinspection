# Pendientes Chile — plan por etapas

Se hace en 4 etapas, cada una probada y publicable por separado. Nada cambia en México ni en lo que ya funciona.

## Etapa 1 — Varias OT / proveedores y cotizaciones adicionales
- Una inspección puede tener varias órdenes de trabajo, cada una con su contratista.
- Cada partida aprobada va a una sola OT a la vez (no se duplica trabajo).
- «Cotización adicional»: la ejecutiva agrega partidas nuevas después de publicada la cotización; se envían al inversionista como nueva versión y solo las aprobadas pueden ir a una OT (nueva o existente).
- El historial de versiones y el finiquito siguen igual, ahora por cada OT.

## Etapa 2 — Propuestas del contratista
- Desde su OT, el contratista propone un trabajo extra con foto, comentario y costo.
- La ejecutiva aprueba o rechaza; si aprueba, se convierte en partida y entra en la cotización adicional para el inversionista (Etapa 1).

## Etapa 3 — Informe de ejecución descargable
- Al revisar una OT se genera un PDF del informe de ejecución (partidas, estado, fotos antes/después, comentarios), guardado como versión.
- Cada nueva revisión crea una versión nueva; las anteriores quedan para descargar.

## Etapa 4 — Inspección final y tipos de trabajo de vacancia
- Después de cerrar las OT, se asigna un receptor que revisa cada partida ejecutada: «cumple / no cumple» con foto y comentario.
- Lo que «no cumple» vuelve a la OT correspondiente como pendiente.
- Los tres tipos de trabajo de vacancia se agregan como clasificación de la OT/partida (definición pendiente de confirmar).

## Detalles técnicos
- Etapa 1: quitar la suposición de una OT por inspección en `assign_work_order`, `WorkOrderPanel`, `create_final_settlement` y vistas del contratista; índice único parcial que impide asignar la misma partida activa a dos OT.
- Etapa 2: tabla `work_order_proposals` (RLS: contratista dueño crea/lee las suyas, ejecutiva/admin del mercado deciden) + RPC transaccional de decisión que crea la partida.
- Etapa 3: tabla de versiones del informe de ejecución + archivos en el bucket privado de informes.
- Etapa 4: tabla de verificaciones finales por partida y estado de inspección final; reabre ítems vía RPC.
- Tests por regla: una partida no puede estar en dos OT activas; propuesta aprobada crea partida pendiente de aprobación del inversionista; «no cumple» reabre el ítem.
