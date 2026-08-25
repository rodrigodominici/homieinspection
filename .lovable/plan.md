# Renombrar estados de inspección + flag "quien_repara"

Dos cambios independientes: (1) nueva nomenclatura visible de los estados, sin tocar la lógica del flujo; (2) un flag nuevo por inspección que indica quién ejecuta las reparaciones.

## 1. Nueva nomenclatura (solo etiquetas)

Los estados internos y las reglas de transición no cambian. Solo cambia el texto que ve el usuario en badges, filtros, KPIs, dashboards y listas.

| Nombre nuevo | Situación operativa actual |
|---|---|
| Sin asignar | Sin inspector o sin ejecutivo asignado |
| Por coordinar | Asignada, todavía sin fecha de recolección de llaves |
| Coordinada p/ recibir | Con fecha de llaves agendada |
| En espera de check out | Inspección en terreno en curso |
| En gestión de cotización | Enviada / en revisión (armado de presupuesto) |
| En gestión de aprobación | Publicada, esperando respuesta del propietario |
| Aprobado | Propietario aceptó (o cierre manual del ejecutivo) |
| Finalizado | Cierre final del caso |

Notas de comportamiento:
- "Por coordinar" y "Coordinada p/ recibir" ya se distinguen hoy por la existencia de fecha de llaves; se refleja también en las vistas de ejecutivo y admin, no solo en la del inspector.
- "Aprobado" y "Finalizado" hoy comparten el mismo estado de cierre. Al no cambiar la lógica, "Finalizado" se mostrará para los casos entregados/cerrados y "Aprobado" para los aceptados por el propietario. Si más adelante se quiere un cierre operativo separado, se agrega como estado real en otra iteración.

## 2. Flag independiente: quien_repara

- Valores: `homie`, `dueno`, `ninguno` (no requiere). Valor inicial: sin definir.
- Uno por inspección, independiente del estado.
- Editable por ejecutivo y admin (desde el detalle de revisión y el detalle de admin). Comercial lo ve, no lo edita.
- Visible como chip en: detalle de inspección (admin y ejecutivo), listas/cola con filtro por valor, y en el informe del propietario.
- Queda registrado en el historial de cambios de la inspección al modificarse.

## Detalles técnicos

Etiquetas:
- Centralizar los textos en `src/shared/ui/status-registry.ts` (fuente de verdad de labels/tonos) y `src/lib/inspection-combined-status.ts` (estado combinado con feedback del propietario).
- Alinear las etiquetas derivadas en `src/lib/inspection-buckets.ts` (STAGE_META, KPIs) y `src/lib/inspector-operational.ts` (estados de inspector).
- Reemplazar los textos sueltos que quedan en: `AdminInspections.tsx`, `AdminInspectionDetail.tsx`, `AdminDashboard.tsx`, `dashboard/OwnerAgingPanel.tsx`, `dashboard/ExecutivePerformancePanel.tsx`, `ExecutiveReviewQueue.tsx`, `ExecutiveReviewDetail.tsx`, `review-detail/PublishedVersionsTimeline.tsx`, `ComercialCheckOutList.tsx`, `ComercialCheckOutDetail.tsx`.
- "Por coordinar" / "Coordinada p/ recibir" se derivan del helper existente de fecha de llaves (`isToCoordinate` / `getScheduleDatetime`), expuesto al badge combinado para que admin y ejecutivo lo muestren igual que el inspector.

Flag:
- Migración: columna `quien_repara text` en `inspections` con validación de valores permitidos; se agrega al set de columnas de lista y detalle (`src/lib/inspection-columns.ts`) y al tipo `Inspection`.
- Escritura vía el servicio existente de acciones de inspección, con entrada en `inspection_audit_log`.
- Se incluye en el payload publicado del informe (`publish_inspection` / `get_published_report`) para renderizarlo en `src/pages/public/OwnerReport.tsx`.
