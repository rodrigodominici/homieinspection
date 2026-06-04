
## Objetivo

Convertir el reporte público del propietario en un formulario interactivo donde puede, **por cada reparación**, marcar `aceptada`, `rechazada` u `observada` (con comentario). Al enviar, la inspección vuelve a estado **"En revisión"** del ejecutivo con badge de feedback pendiente. El ejecutivo ajusta, vuelve a publicar (nueva versión) y reenvía. El ciclo se repite hasta que **todas** las reparaciones queden aceptadas → la inspección pasa a estado **`accepted`** (cierre del flujo de share).

Alcance v1: **solo audiencia `owner`**. El link del inquilino sigue siendo informativo. Identidad: **anónima con el token actual** (sin OTP).

---

## Flujo de usuario

### Propietario (link público)
1. Abre `/reportes/:propertyId/:token`.
2. Ve cada reparación con tres botones: ✅ Aceptar · ✏️ Observar · ❌ Rechazar. "Observar" y "Rechazar" requieren comentario.
3. Resumen flotante: "X de Y reparaciones decididas". CTA "Enviar respuesta" se habilita solo cuando todas tienen decisión.
4. Al enviar, ve una pantalla de confirmación: "Recibimos tu respuesta. El equipo revisará tus comentarios." Si aceptó todo, mensaje: "Inspección aceptada".
5. Si vuelve a abrir el link después de enviar y el ejecutivo ya publicó una nueva versión, ve la nueva versión limpia para revisar otra vez. Si no hay versión nueva, ve sus decisiones en modo lectura.

### Ejecutivo
1. En el dashboard / queue ve un badge **"Feedback del propietario"** en inspecciones con feedback pendiente.
2. En `ExecutiveReviewDetail`, una nueva pestaña/panel **"Respuesta del propietario"** muestra:
   - Resumen (X aceptadas, Y rechazadas, Z observadas).
   - Lista de reparaciones con la decisión + comentario del propietario.
3. Edita reparaciones (flujo existente) y al re-publicar se crea una **nueva versión** del reporte (v2, v3…) que resetea el ciclo de decisiones para esa versión.
4. Cuando el propietario acepta todas en una versión, la inspección pasa a `accepted` y el botón de re-compartir se deshabilita (cierre).

---

## Cambios de datos

### Nueva tabla `inspection_owner_feedback`
Una fila por (versión de reporte × reparación). Versionar contra `inspection_report_versions.id` permite mantener histórico limpio cuando el ejecutivo publica v2.

Campos clave (omitidos id/timestamps estándar):
- `inspection_id`, `report_version_id`, `repair_item_id` (referencia conceptual a `inspection_repair_items.id`)
- `decision`: `accepted | rejected | observed`
- `comment` (obligatorio si `rejected`/`observed`)
- `submitted_at`, `submitter_name` (opcional, capturado en el form)

Constraint: único por (`report_version_id`, `repair_item_id`).
RLS: solo `admin`/`executive` asignado pueden leer; **no se escribe directamente desde el cliente** — toda escritura pasa por la RPC `submit_owner_feedback`.

### Nueva tabla `inspection_owner_feedback_submissions`
Un registro por envío completo del propietario (auditoría).
- `inspection_id`, `report_version_id`, `submitter_name`, `summary_json` (counts), `all_accepted` (bool), `submitted_at`.

### Cambios en `inspections`
- Nueva columna `owner_feedback_status`: `none | pending_executive_review | accepted` (default `none`).
- Nueva columna `owner_feedback_last_submitted_at`.
- Nuevo valor de `status` permitido: `accepted` (cierre final del ciclo de share). El status `published` sigue existiendo entre publicar y recibir feedback.

### Cambios en `inspection_report_versions`
- Nueva columna `owner_decision_summary_json` (cache del último submission de esa versión, para mostrar rápido en el ejecutivo).

---

## RPCs (security definer)

### `submit_owner_feedback(p_property_id, p_token, p_submitter_name, p_decisions jsonb)`
- Valida que `(property_id, token)` resuelva a una versión `published` + `is_latest`.
- Valida que `p_decisions` cubra **todas** las reparaciones de esa versión (rechaza envíos parciales).
- Valida que `rejected`/`observed` traigan comentario no vacío.
- Inserta filas en `inspection_owner_feedback` (replace si existían para esa versión).
- Inserta una fila en `inspection_owner_feedback_submissions`.
- Si **todas** son `accepted` → marca `inspections.status = 'accepted'`, `owner_feedback_status = 'accepted'`.
- Si hay alguna `rejected`/`observed` → marca `owner_feedback_status = 'pending_executive_review'` (el `status` operativo de la inspección no cambia automáticamente; el ejecutivo decide cuándo reabrir).
- Devuelve `{ all_accepted, counts }`.

### Ampliar `get_published_report`
- Incluir `repairs[].id` (necesario para que el form mapee decisiones) y `version_id`.
- Incluir `owner_feedback_locked` (true si ya hay un submission para esta versión).
- Si está bloqueado, devolver también `decisions[]` para mostrar en modo lectura.

---

## Cambios de UI

### Público (`src/pages/public/OwnerReport.tsx`)
- Solo cuando `audience === 'owner'` y NO `owner_feedback_locked`: añadir controles por reparación.
- Componente nuevo `RepairDecisionControl` (3 estados + textarea condicional).
- Barra sticky inferior con contador + CTA "Enviar respuesta".
- Modal de confirmación pre-envío con resumen.
- Pantalla post-envío (locked): muestra decisiones y mensaje según `all_accepted`.

### Ejecutivo
- `ExecutiveReviewDetail`: nuevo panel/sección **"Respuesta del propietario"** (visible solo si existe submission para la versión más reciente). Lista plana de reparaciones con badge de decisión + comentario.
- Indicador en el sidebar del espacio: pequeño badge si alguna de sus reparaciones tiene decisión ≠ aceptada.
- En la lista/cola de inspecciones: badge "Feedback pendiente" cuando `owner_feedback_status = 'pending_executive_review'`.
- Al re-publicar (crear nueva versión), el ciclo se reinicia automáticamente; mostrar toast: "Nueva versión enviada al propietario, decisiones anteriores archivadas".
- Cuando `status = 'accepted'`: bloquear edición de reparaciones y mostrar banner "Inspección aceptada por el propietario".

---

## Detalles técnicos

```text
Ciclo:
 publish v1 → owner decide
   ├─ todas aceptadas → status=accepted (FIN)
   └─ alguna rechazo/observación → owner_feedback_status=pending_executive_review
        → ejecutivo edita → publish v2 (nuevo public_token o mismo)
            → owner decide v2 → ...
```

**Token**: se mantiene el mismo `public_token` entre versiones (el propietario reutiliza el mismo link). El backend resuelve siempre la versión `is_latest`.

**Idempotencia**: si el propietario reenvía la misma versión, la RPC hace upsert sobre `(report_version_id, repair_item_id)` y reemplaza el submission anterior (último gana). Se conserva auditoría completa vía `inspection_owner_feedback_submissions`.

**Estado vs status legacy**: no tocamos la máquina de estados existente más allá de añadir `accepted`. El `owner_feedback_status` vive en paralelo y es lo que dispara el badge "Feedback pendiente" sin reescribir el workflow.

**Realtime opcional (fuera de v1)**: ejecutivo recibe notificación push cuando llega feedback. Por ahora, solo badge al recargar / al entrar al detalle.

---

## Fuera de alcance (v1)

- Inquilino con flujo interactivo.
- Verificación OTP/email del propietario.
- Comentarios bidireccionales (chat) — el ejecutivo solo lee, no responde dentro del link.
- Notificaciones automáticas por email/WhatsApp al ejecutivo (queda como follow-up usando `communication_rules`).
- Aceptación parcial que cierre el ciclo (siempre se requiere 100% aceptado para `accepted`).

---

## Pasos de implementación

1. Migración: nuevas tablas, columnas, RLS, GRANTs, ampliar `get_published_report`, RPC `submit_owner_feedback`.
2. Cliente público: controles de decisión + envío + estado locked + pantalla post-envío.
3. Cliente ejecutivo: panel "Respuesta del propietario" + badges en queue y sidebar + bloqueo al `accepted`.
4. Memoria de proyecto: agregar `mem://features/owner-feedback-loop` documentando el contrato.
