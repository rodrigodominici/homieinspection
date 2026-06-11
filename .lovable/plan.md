## Objetivo

Enviar notificaciones a Slack al ejecutivo asignado cuando:
1. Una inspección pasa a estado **"submitted"** (Para Revisar — el inspector entregó).
2. El propietario envía **feedback** (`owner_feedback_status` → `pending_executive_review`).

Las notificaciones llegan a **un único canal compartido** (ej. `#inspecciones`), arrobando al ejecutivo correspondiente y con link directo a la inspección en Homie Inspection.

## Setup de Slack

- Conectar el **conector Lovable de Slack** (bot centralizado) vía `standard_connectors--connect`.
- Resolver el ejecutivo en Slack **por email** usando `users.lookupByEmail` (sin migración de schema, sin campo manual).
- El canal destino se configura como secreto: `SLACK_NOTIFICATIONS_CHANNEL_ID` (ej. `C0123ABCD`), para no hardcodear.

## Arquitectura

### Edge function: `notify-executive-slack`
- Recibe `{ inspection_id, event_type }` donde `event_type ∈ {'submitted', 'owner_feedback'}`.
- Carga la inspección + perfil del ejecutivo asignado (email, nombre).
- Resuelve Slack user ID vía gateway: `POST /slack/api/users.lookupByEmail?email=...`.
  - Si no encuentra match, manda el mensaje sin arroba (solo con el nombre).
- Construye el mensaje (ver formato abajo) y publica con `chat.postMessage`.
- Idempotencia: registra envíos en una tabla `slack_notifications_log` (inspection_id + event_type + sent_at) para no duplicar si el frontend dispara dos veces.

### Disparadores (desde el frontend, no triggers DB)

**Evento `submitted`**: en el flujo del inspector cuando se cambia el status a `submitted` (al finalizar la inspección), después del update exitoso se invoca la edge function.

**Evento `owner_feedback`**: en `submit_owner_feedback` RPC actualmente no se puede invocar una edge function desde SQL. Opciones:
- (A) Llamar la edge function desde `OwnerReport.tsx` después de que `submit_owner_feedback` responde con `all_accepted=false`.
- (B) Crear trigger DB con `pg_net` que llame la edge function. Más robusto pero más complejo.

**Recomendación**: empezar con (A) — más simple y suficiente. Migrar a (B) si vemos eventos perdidos.

## Formato de mensajes (Slack Block Kit)

**Submitted:**
```
🔍 *Inspección lista para revisar*
<@U123> tienes una nueva inspección pendiente.

*Propiedad:* {property_name} — {address}
*Inspector:* {inspector_name}
*Entregada:* hace X minutos

[Revisar inspección] → {APP_URL}/executive/review/{inspection_id}
```

**Owner feedback:**
```
💬 *Feedback del propietario recibido*
<@U123> el propietario respondió a tu reporte.

*Propiedad:* {property_name} — {address}
*Aceptadas:* X · *Rechazadas:* Y · *Observadas:* Z

[Ver feedback] → {APP_URL}/executive/review/{inspection_id}
```

`APP_URL` configurable como secret `APP_BASE_URL` (default: `https://app.inspection.homie.mx`).

## Cambios técnicos

1. **Conectar Slack** (`standard_connectors--connect` con `connector_id: slack`).
2. **Pedir secretos**: `SLACK_NOTIFICATIONS_CHANNEL_ID`, `APP_BASE_URL` (opcional, tiene default).
3. **Migración DB**: tabla `slack_notifications_log(id, inspection_id, event_type, slack_message_ts, sent_at)` con índice único `(inspection_id, event_type)` para idempotencia. RLS + GRANTs estándar (solo service_role).
4. **Edge function** `supabase/functions/notify-executive-slack/index.ts`:
   - Valida JWT del caller (debe ser usuario autenticado para 'submitted', o llamada desde server con service role para owner_feedback si se hace por RPC; en plan A es desde sesión del owner que no está autenticada → marcar `verify_jwt = false` y validar via shared secret en el body, o aceptar invocaciones públicas del path owner_feedback sin auth).
   - Resuelve email del ejecutivo → Slack user ID.
   - Publica mensaje formateado al canal.
   - Inserta en `slack_notifications_log`; si UNIQUE violation → noop (ya enviado).
5. **Frontend hooks**:
   - Inspector submit flow: invocar `supabase.functions.invoke('notify-executive-slack', { body: { inspection_id, event_type: 'submitted' } })` tras éxito del status update.
   - `OwnerReport.tsx`: tras `submit_owner_feedback` con `all_accepted=false`, invocar la function con `event_type: 'owner_feedback'`.

## Fuera de alcance

- Notificaciones por DM (solo canal compartido).
- Notificación al asignarse la inspección (descartada).
- Notificación cuando `all_accepted=true` (no es feedback que requiera acción).
- Configurar nombre/icono del bot (lo hace el usuario en el conector si quiere).
- Reintentos automáticos (idempotencia evita duplicados; fallos quedan en logs del edge function).

## Próximos pasos al implementar

1. Lanzar `standard_connectors--connect` para Slack y esperar confirmación.
2. Pedir `SLACK_NOTIFICATIONS_CHANNEL_ID` vía `add_secret`.
3. Crear migración + edge function + hooks frontend.
4. Probar end-to-end con una inspección de QA.