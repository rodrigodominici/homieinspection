# Estabilización urgente: pantallas en blanco / carga infinita

## Qué está confirmado hoy (verificado en vivo, no supuesto)

- **El backend no está caído.** La base de datos está ociosa (conexiones idle de la API, sin saturación), no hay errores de autenticación en la última hora y el único error de Postgres reciente es un `statement timeout` aislado.
- **La app publicada funciona desde afuera.** Cargando `app.inspection.homie.mx` con una sesión real de admin, el Dashboard y el listado de Inspecciones renderizan completos, sin errores de consola ni respuestas 4xx/5xx.
- **Hay uso real y continuo.** Se subieron 248 fotos hoy y cientos por día la semana pasada: la falla es **intermitente**, no una caída total permanente.
- **No tenemos evidencia del fallo.** La telemetría (PostHog) recién quedó activa en producción hoy, y la tabla de errores de cliente sólo registra fallos de subida de fotos (1 registro en 10 días). O sea: llevamos una semana con un síntoma reportado y **cero datos** de qué pasa en el navegador del usuario.
- **Sí hay un punto caliente real:** la función que firma fotos de los reportes públicos se invoca una vez **por foto** (≈290 invocaciones/minuto, 3 consultas a la base cada una) y ya devolvió 504/500 en la última hora.
- **Riesgo estructural que produce exactamente este síntoma:** todas las rutas se cargan como *chunks* separados con nombre versionado y caché "inmutable". Cuando publicamos una versión nueva, cualquier pestaña o PWA que quedó abierta (caso típico del inspector que deja la app abierta días) sigue apuntando a archivos que ya no existen: al navegar a otra pantalla el archivo no carga y queda **pantalla en blanco o spinner infinito**. Hoy no hay ningún reintento ni recarga automática para ese caso.

Diagnóstico honesto: la causa exacta **no está confirmada**, y no se puede confirmar sin datos del navegador. Por eso el primer paso del plan es obtener ese dato en horas, en paralelo con blindar la causa estructural más probable.

## Fase 1 — Ver la falla (mismo día)

1. Registrar en la tabla de errores de cliente, además de fotos: fallos de carga de módulos, errores no capturados, promesas rechazadas y timeouts de sesión/perfil, con ruta, rol, versión de build y user agent.
2. Estampar cada build con un identificador de versión y enviarlo en cada evento, para saber si el usuario que falla está corriendo una versión vieja (hipótesis del chunk obsoleto).
3. Panel simple en Monitoreo: últimos errores agrupados por tipo, ruta, rol y versión, con las últimas 24 h destacadas.
4. Registrar un evento de "arranque completado" para poder medir cuántas sesiones nunca llegan a pintar la app (hoy es invisible).

## Fase 2 — Blindar el arranque y la navegación (mismo día)

5. **Recuperación automática de chunks obsoletos:** envolver la carga de cada pantalla con reintento y, si detecta que el archivo ya no existe, recargar la app una sola vez de forma automática (con marca en sesión para no entrar en bucle). Esto convierte la pantalla en blanco en una recarga transparente.
6. **Aviso de versión nueva:** al detectar que hay un build más reciente, ofrecer recarga en vez de dejar la sesión vieja rota.
7. **Límite duro de arranque:** si la app no termina de resolver sesión y perfil en un tiempo acotado, mostrar pantalla accionable ("Reintentar" / "Volver a iniciar sesión") en lugar de spinner infinito, cubriendo también el caso de perfil inexistente o bloqueo de almacenamiento en móvil.
8. **Frontera de error por ruta:** hoy un error dentro de una pantalla puede tumbar todo el árbol; pasar a un límite de error por ruta con opción de reintento sin perder la sesión.

## Fase 3 — Quitar la carga que genera 504 (día siguiente)

9. Reemplazar el firmado foto-por-foto del reporte público por **una sola llamada que firma todas las fotos del informe**, con caché de respuesta. Reduce de cientos de invocaciones por informe a una.
10. Revisar la función pública para que valide el token una vez y reutilice el cliente, y ajustar el TTL/caché de las URLs firmadas.
11. Revisar el único `statement timeout` detectado y confirmar que las consultas del panel de desempeño (la más lenta: ~1,4 s promedio) no se disparen en cada carga del dashboard.

## Fase 4 — Verificación

12. Recorrido autenticado por los tres roles (inspector móvil, ejecutivo, admin) sobre producción, midiendo tiempo hasta primer contenido y navegación entre pantallas.
13. Simular explícitamente el escenario "pestaña vieja + publicación nueva" y confirmar que ahora se recupera solo.
14. A las 24 h, revisar el panel de errores: si sigue habiendo pantallas en blanco, ya tendremos ruta, rol y versión exactos para atacar la causa puntual.

## Notas técnicas

- Instrumentación: extender `client_error_log` (agregar `route`, `role`, `app_version`, `event_kind`) y el reporte desde `src/lib/monitoring.ts` (`initGlobalErrorHandlers` ya existe y hoy sólo manda a PostHog).
- Chunks: helper `lazyWithRetry` aplicado a los `lazy()` de `src/App.tsx`; detección de `Failed to fetch dynamically imported module` / `error loading dynamically imported module`.
- Arranque: en `src/contexts/AuthContext.tsx` el fail-safe actual es de 4 s para la sesión y 6 s × 2 intentos para el perfil; falta el caso "perfil nulo sin error", que hoy deja pasar al usuario sin rol.
- Reporte público: nueva función/RPC de firmado masivo consumida por `src/pages/public/OwnerReport.tsx`, en lugar de una invocación de `sign-public-photo` por foto.
- Sin cambios de esquema destructivos; las migraciones son sólo columnas nuevas en la tabla de log.
