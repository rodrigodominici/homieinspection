## Contexto

Hoy el flujo de "feedback del propietario" solo avanza si el propietario abre el link público y envía decisiones vía `submit_owner_feedback`. Si nunca responde — o si se aprueba por WhatsApp/correo/llamada — la inspección se queda en `published` con `owner_feedback_status = 'none'` y el `OwnerFeedbackPanel` muestra "Aún no recibimos respuesta…" sin ninguna acción disponible para el ejecutivo.

Necesitamos darle al ejecutivo una salida explícita y auditable para cerrar el ciclo manualmente.

## Objetivo

Permitir al ejecutivo marcar la inspección como **aprobada por gestión manual**, registrando motivo (sin respuesta / coordinado fuera de la plataforma / otro) y nota libre, sin alterar el flujo normal cuando sí hay respuesta del propietario.

## Alcance

### 1. Backend — nuevo RPC `executive_force_close_owner_feedback`

`SECURITY DEFINER`, validando rol `executive` o `admin` vía `has_role(auth.uid(), …)`. Parámetros:

- `p_inspection_id uuid`
- `p_reason text` (enum lógico: `no_response`, `coordinated_offline`, `other`)
- `p_note text` (opcional, requerida si `reason = 'other'`)

Comportamiento:

- Sólo opera si la inspección está en `status IN ('published','sent')` y `owner_feedback_status IN ('none','pending_executive_review')`. Si ya está `accepted` / `approved`, devuelve no-op.
- Actualiza `inspections`:
  - `owner_feedback_status = 'accepted'`
  - `owner_feedback_last_submitted_at = now()` (sólo si era NULL)
  - `status = 'approved'`
  - `approved_at = now()`, `approved_by = auth.uid()`
- Inserta en `inspection_owner_feedback_submissions` una fila sintética: `submitter_name = 'Cierre manual — <ejecutivo>'`, `summary_json = { manual_closure: true, reason, note }`, `all_accepted = true`. No se tocan filas de `inspection_owner_feedback` (no son decisiones reales del propietario).
- Inserta en `inspection_audit_log` (`action = 'owner_feedback_manual_closure'`, payload con reason/note/old_status/new_status).

### 2. Frontend — UI en `OwnerFeedbackPanel`

Cuando `status` esté en `published`/`sent`, `owner_feedback_status !== 'accepted'`, y no haya filas en `inspection_owner_feedback` para la versión activa: añadir botón secundario **"Cerrar manualmente…"** junto al texto "Aún no recibimos respuesta".

El botón abre un `Dialog` con:
- Radio: motivo (Sin respuesta del propietario / Aprobado fuera de la plataforma / Otro)
- Textarea: nota interna (obligatoria si "Otro")
- Aviso: "Esto marcará la inspección como aprobada y quedará registrado en el historial. No envía notificación al propietario."
- Confirmación: llama al RPC, muestra toast, invalida queries (`useReviewDetail`) y refresca panel.

Cuando ya está cerrada manualmente (detectable porque la submission tiene `summary_json.manual_closure = true`), el panel muestra una variante del estado "aceptado" con la etiqueta **"Cierre manual"** + motivo + ejecutivo + fecha, en lugar de la tarjeta verde estándar de aceptación del propietario.

### 3. Auditoría y visibilidad

- `inspection_audit_log` ya existe; añadimos la acción nueva. El `AdminInspectionDetail` que ya consume el log la mostrará automáticamente.
- No se requieren migraciones de constraints adicionales (status `approved` ya está en el CHECK).

## Fuera de alcance

- Notificaciones automáticas al propietario.
- Reversión del cierre manual (si se necesita, el ejecutivo puede republicar — eso ya resetea `owner_feedback_status` a `none`).
- Cambios en el reporte público; el propietario que entre verá la versión publicada normal (sin pedir decisiones, ya que la inspección quedó `approved`).

## Validación

1. Inspección publicada, sin respuesta del propietario → ejecutivo cierra manualmente → `status='approved'`, `owner_feedback_status='accepted'`, panel muestra "Cierre manual · Coordinado fuera de la plataforma".
2. Inspección con respuesta parcial (`pending_executive_review`) → ejecutivo puede cerrar manualmente igual; quedan las decisiones originales visibles más la fila de cierre.
3. Intento de cerrar manualmente una ya `approved` → RPC devuelve mensaje "ya estaba cerrada", UI sin cambios.
4. Usuario sin rol ejecutivo/admin → RPC rechaza con error de permiso.
5. Log de auditoría muestra la acción con motivo y nota.
