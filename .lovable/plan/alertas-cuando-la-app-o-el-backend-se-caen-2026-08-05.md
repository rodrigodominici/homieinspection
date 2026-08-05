# Alertas cuando la app o el backend se caen

Objetivo: enterarse del problema antes que los usuarios, y que quien esté usando la app entienda qué pasa en vez de ver una pantalla en blanco.

Se propone en dos capas, porque una sola no alcanza: si la base de datos se cae, cualquier alerta que dependa de la base de datos también se cae.

## Capa 1 — Endpoint de salud público

Nueva función `health-check` (endpoint público, sin login) que:

- Hace una consulta mínima a la base de datos y mide cuánto tarda.
- Responde `200` con `{ status: "ok", db_ms }` si todo funciona.
- Responde `503` con el detalle del error si la base no contesta o tarda demasiado (umbral 5 s).

Este endpoint vive en el runtime de funciones, que es independiente de la base de datos: sigue respondiendo (con 503) incluso cuando la base está caída. Es la pieza que permite detectar la falla desde afuera.

## Capa 2 — Aviso a Slack cuando falla

La función `health-check` acepta también un modo "verificar y avisar": si detecta falla, publica en el canal de Slack ya configurado (el mismo que usan las notificaciones de inspecciones) un mensaje del tipo:

> Backend no responde — la base de datos no contesta hace X. Los usuarios no pueden iniciar sesión.

Con anti-spam: guarda el último estado en una tabla chica (`system_health_state`) y solo avisa en el cambio de estado (OK → caído, y caído → recuperado), no en cada chequeo.

Para que alguien llame a ese chequeo cada pocos minutos hay dos caminos:

- **Recomendado:** un monitor externo gratuito (Better Stack / UptimeRobot) apuntando al endpoint de salud cada 1-3 minutos, con aviso por mail o Slack. Es el único que sigue funcionando si toda la infraestructura del proyecto está caída. Requiere crear la cuenta y pegar la URL — se entregan los pasos exactos.
- **Complemento interno:** un job programado cada 5 minutos dentro de la base de datos que invoque el chequeo. Sirve para caídas parciales (base lenta, saturada, funciones con error), pero no para una caída total de la base.

Se implementan ambos: el job interno queda listo, y se entregan las instrucciones para el monitor externo.

## Capa 3 — Aviso visible en la app

Hoy, cuando el backend no responde, la app queda cargando o en blanco. Se agrega:

- Detección de errores de red/timeout y de fallas de refresco de sesión.
- Un banner fijo arriba: "Estamos con problemas de conexión al servidor. Reintentando…", con botón de reintentar, que desaparece solo cuando vuelve la conexión.
- En la pantalla de login, un mensaje claro en vez de un error genérico.

## Detalles técnicos

- Nueva función `supabase/functions/health-check/index.ts`, con `verify_jwt = false` en `config.toml`, protegida por un token en query string para el modo que publica en Slack.
- Reutiliza el patrón de `notify-executive-slack` para publicar (`SLACK_API_KEY`, `SLACK_NOTIFICATIONS_CHANNEL_ID`).
- Tabla `public.system_health_state` (una fila): estado actual, `since`, `last_notified_at`. Sin acceso para `anon`/`authenticated`; solo `service_role`.
- Job programado con `pg_cron` + `pg_net` cada 5 minutos hacia el endpoint.
- Frontend: hook `useBackendHealth` + componente `BackendStatusBanner` montado en el layout raíz; escucha errores globales de las consultas y hace ping al endpoint de salud para confirmar antes de mostrar el banner.
