## Objetivo

Disparar manualmente la edge function `notify-executive-slack` contra una inspección real para verificar que llega la notificación al canal de Slack.

## Pasos

1. **Elegir inspección de prueba**: query a `inspections` para listar las 5 más recientes con `executive_id` asignado (id, property_name, status, executive email). Tú eliges cuál usar.

2. **Limpiar log de idempotencia** para esa inspección + evento (la tabla `slack_notifications_log` bloquea reenvíos del mismo evento). Borrar la fila con status='sent' para ese `(inspection_id, event_type)`.

3. **Invocar la edge function** vía `supabase--curl_edge_functions`:
   ```json
   POST /notify-executive-slack
   { "inspection_id": "<uuid>", "event_type": "submitted" }
   ```
   Y opcionalmente repetir con `"event_type": "owner_feedback"`.

4. **Verificar**:
   - Respuesta HTTP 200 con `{ status: "sent", ts: "..." }`.
   - Mensaje visible en el canal de Slack configurado.
   - Fila nueva en `slack_notifications_log` con `status='sent'` y el `slack_message_ts`.
   - Si no resolvió el user de Slack por email, el mensaje sale con `*Nombre*` en negrita en vez de arroba — esto indica que falta mapear ese email a un usuario de Slack en el workspace.

5. **Logs**: si algo falla, leer `supabase--edge_function_logs` de `notify-executive-slack`.

## Preguntas

- ¿Qué evento quieres probar primero: `submitted`, `owner_feedback`, o ambos?
- ¿Prefieres que yo elija la inspección más reciente con ejecutivo asignado, o quieres pasarme un `inspection_id` específico?

## Fuera de alcance

- Cambiar el estado real de una inspección (no es necesario; la edge function solo lee datos y publica en Slack).
- Modificar la lógica de la function.