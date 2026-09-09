# Ajustes al flujo de contratista (feedback de Operaciones)

## 1. Aceptar o rechazar la orden completa

Al abrir una orden nueva, el contratista ve primero el resumen de los trabajos solicitados y dos acciones: **Aceptar el trabajo** o **Rechazar**.

- Aceptar: la orden pasa a "En curso" y recién ahí puede registrar reparaciones.
- Rechazar: motivo obligatorio; la orden queda "Rechazada por el contratista", sale de su lista activa y el Ejecutivo/Admin ve el motivo.
- El Ejecutivo/Admin puede **reasignar** la orden a otra empresa contratista desde el panel de orden de trabajo (queda registro de quién rechazó y por qué).
- Mientras la orden no esté aceptada, no se pueden cargar fotos ni cambiar estados.

Nuevo flujo de la orden:

```text
Asignada -> (contratista acepta) -> En curso -> En revisión -> Aprobada
        \-> Rechazada por contratista -> reasignación a otro contratista
```

## 2. Informe de Hallazgos visible en la orden

Dentro de la orden se agrega **"Informe de hallazgos"**: una vista móvil de solo lectura con las secciones de la inspección, observaciones del ejecutivo y fotos del estado detectado, más el listado de trabajos aprobados (descripción y cantidad). No muestra precios al cliente, márgenes ni datos del propietario o inquilino.

Las fotos "Antes" siguen siendo opcionales: el informe de hallazgos ya documenta el estado previo. Solo la foto "Después" queda obligatoria para marcar una reparación como terminada.

## 3. Se quita "Costo real" de la app del contratista

El campo desaparece de la pantalla del contratista. El Ejecutivo/Admin sigue viendo el dato histórico ya cargado en su panel; los valores existentes no se borran.

## 4. Estado de llaves al cerrar la orden

Al firmar la conformidad, el contratista debe indicar dónde quedaron las llaves:

- Homie
- Administración del edificio
- Responsable autorizado
- Propietario
- Proveedor
- Candado (pide número de candado y clave, ambos obligatorios)

Sin este dato no se puede enviar la orden a revisión. Queda visible para Ejecutivo/Admin en el panel de la orden.

Nota: el contratista no tiene contacto con el inquilino (el inmueble está vacante); no se agrega ningún dato de inquilino a esta vista.

## 5. Revisión del Ejecutivo: comparación en una pantalla

En el detalle de la inspección (Admin/Ejecutivo), el panel de orden de trabajo pasa a mostrar tres bloques comparables:

1. **Informe de hallazgos**: lo detectado originalmente.
2. **Cotización aprobada**: trabajos y montos autorizados.
3. **Informe final de ejecución**: estado por reparación, comentarios, fotos antes/después, firma del contratista y estado de llaves.

Debajo, las acciones existentes: aprobar el trabajo, devolverlo con observaciones o reasignar a otro contratista. Aprobar habilita, como hoy, la finalización de la inspección.

## Detalle técnico

Migración:
- `inspection_work_orders`: nuevos campos `accepted_at`, `accepted_by`, `rejected_at`, `contractor_rejection_reason`, `keys_status`, `keys_lock_number`, `keys_lock_code`; el `status` acepta `assigned` (renombre lógico de `open`) y `contractor_rejected`.
- RPCs: `accept_work_order(p_work_order_id)`, `contractor_reject_work_order(p_work_order_id, p_reason)`, `reassign_work_order(p_work_order_id, p_contractor_id)`; `submit_work_order` recibe `p_keys_status`, `p_keys_lock_number`, `p_keys_lock_code` y valida su presencia. Todo con auditoría en `inspection_audit_log` y `inspections.work_status` coherente.
- RLS: el contratista solo actualiza ítems de órdenes aceptadas por su empresa; lectura de solo lectura sobre secciones/valores/fotos de la inspección de su orden para el informe de hallazgos.

Frontend:
- `src/lib/work-order-status.ts`: nuevos estados y etiquetas (`assigned`, `contractor_rejected`), `isWorkOrderEditable` exige orden aceptada.
- `work-orders.service.ts`: `acceptWorkOrder`, `rejectWorkOrderByContractor`, `reassignWorkOrder`, `submitWorkOrder` con datos de llaves, y carga del informe de hallazgos (secciones + valores + fotos visibles).
- Contratista: pantalla de aceptación/rechazo en `ContractorWorkOrderDetail.tsx`, nueva vista `ContractorFindingsReport.tsx` (ruta `/contratista/orden/:id/informe`), quitar `actual_cost` de `ContractorItemDetail.tsx`, foto "Antes" opcional, y bloque de llaves en el diálogo de firma.
- Ejecutivo/Admin: `WorkOrderPanel.tsx` con los tres bloques comparables, motivo de rechazo, estado de llaves y diálogo de reasignación.
