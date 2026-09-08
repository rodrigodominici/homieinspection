# Flujo de contratista: registro de trabajo ejecutado

## Qué se agrega

Un nuevo tipo de usuario, **Contratista**, con vista mobile-first (igual que el inspector), que entra a la app para ejecutar y documentar las reparaciones aprobadas de una inspección.

Se agregan dos etapas nuevas entre **Aprobado** y **Finalizado**:

```text
Aprobado  ->  Reparación en curso  ->  Reparación en revisión  ->  Finalizado
             (contratista trabaja)     (ejecutivo/admin valida)
```

Solo entran a este flujo las inspecciones de **captación** y **check-out** que quedaron aprobadas con **Quién repara = Homie**. Si repara el dueño o no requiere, el caso pasa directo a Finalizado como hoy.

## Cómo funciona para cada rol

**Ejecutivo / Admin**
- Al aprobar una inspección con Quién repara = Homie, elige la empresa contratista (las mismas que ya están dadas de alta) y la orden de trabajo queda abierta.
- Ve el avance en vivo: cuántas reparaciones están terminadas, fotos antes/después, costos reales y comentarios.
- Cuando el contratista cierra la orden, la inspección queda en "Reparación en revisión": el ejecutivo aprueba (pasa a Finalizado) o devuelve el trabajo con un comentario (vuelve a "en curso").

**Contratista (móvil)**
- Inicia sesión con su propio usuario. El admin lo crea o aprueba desde Usuarios y lo vincula a una empresa contratista y a sus países.
- Pantalla inicial: lista de órdenes de trabajo asignadas a su empresa, con dirección, inmueble y cantidad de reparaciones pendientes.
- Dentro de una orden: lista de reparaciones aprobadas. Por cada una registra:
  - foto(s) **antes** y **después** (obligatorias para marcarla terminada),
  - estado: pendiente / en curso / terminada / no realizada (con motivo),
  - comentario y costo real ejecutado,
- Al terminar todas, firma la conformidad y envía la orden a revisión. No ve precios al cliente ni el resto de la operación.

**Admin (gestión)**
- Nueva sección para ver todas las órdenes de trabajo, con filtro por país, contratista y estado.
- La empresa contratista pasa a poder tener usuarios asociados.

## Restricciones de acceso

- El contratista solo ve inspecciones donde su empresa está asignada, y solo la parte de reparaciones y sus propias fotos. No ve la cotización al cliente, márgenes, ni informes del propietario/inquilino.
- Un usuario contratista nuevo queda pendiente de aprobación, igual que hoy los demás roles.
- Todo se respeta también por país asignado.

## Detalle técnico

Base de datos (una migración):
- `profiles.role` acepta `contractor`; nueva columna `profiles.contractor_id` (referencia a `contractors`), obligatoria a nivel de validación para ese rol.
- Nueva tabla `inspection_work_orders`: `inspection_id`, `contractor_id`, `status` (`open` | `in_progress` | `in_review` | `approved` | `rejected`), `assigned_by`, `assigned_at`, `submitted_at`, `reviewed_by`, `reviewed_at`, `review_note`, `contractor_signature_*`, timestamps + trigger `updated_at`.
- Nueva tabla `inspection_work_order_items`: `work_order_id`, `repair_item_id`, `status` (`pending` | `in_progress` | `done` | `not_done`), `not_done_reason`, `comment`, `actual_cost`, `completed_at`, timestamps.
- `inspection_photos`: nueva columna `work_order_item_id` y `photo_stage` (`before` | `after` | null) para reutilizar el pipeline de fotos existente (bucket privado, compresión, URLs firmadas).
- `inspections`: se agregan `work_status` (`not_applicable` | `in_progress` | `in_review` | `done`) para no romper el enum de `status` actual, y se refleja como etiqueta de etapa en la UI. `finalize_inspection` se ajusta: si `quien_repara = 'homie'`, exige `work_status = 'done'`.
- GRANTs + RLS en todas las tablas nuevas: contratista solo filas de su `contractor_id`; ejecutivo/admin acceso por país vía `user_has_market`; `service_role` completo. Políticas de Storage para que el contratista suba solo bajo el prefijo de sus inspecciones.
- Funciones `security definer`: `assign_work_order`, `submit_work_order`, `review_work_order` (aprobar/rechazar), todas con auditoría en `inspection_audit_log`.

Frontend:
- `UserRole` suma `'contractor'`; `ProtectedRoute`, `AuthContext` y redirecciones de rol lo contemplan.
- Nuevo `ContractorLayout` + bottom nav móvil siguiendo los patrones del inspector (barra de acción sticky, CTA full-width).
- Páginas: `ContractorDashboard` (órdenes), `ContractorWorkOrderDetail` (items), `ContractorItemDetail` (fotos antes/después, estado, costo, comentario), cierre con `SignaturePad`.
- `status-registry.ts`: nuevas entradas de etapa de obra; `inspection-combined-status.ts` y los buckets/KPIs del tablero suman "Reparación en curso" y "Reparación en revisión".
- `AdminUsers.tsx`: rol Contratista con selector de empresa contratista.
- En `ExecutiveReviewDetail` / `AdminInspectionDetail`: panel de orden de trabajo con avance, fotos antes/después y acciones de revisión.
- Reutiliza `SignedPhotoImg`, `ZoomableImage`, `PhotoUploadSheet` y el servicio de fotos existente.

## Fuera de alcance

- Notificaciones por email/WhatsApp al contratista (se puede sumar después sobre `communication_rules`).
- Pagos, órdenes de compra o facturación al contratista.
- Contratistas por reparación individual (una orden = una empresa por inspección).
