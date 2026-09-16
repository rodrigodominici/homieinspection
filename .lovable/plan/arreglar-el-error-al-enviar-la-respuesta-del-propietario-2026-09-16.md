# Arreglar el error al enviar la respuesta del propietario

## Qué está pasando

El mensaje "No pudimos enviar tu respuesta — TypeError: Load failed" significa que el envío nunca llegó a nuestros servidores: el navegador del propietario cortó la conexión antes de completarla.

Lo verificado en el informe de Carvajal 330 D 1305 (RE000923):

- No hay ninguna respuesta guardada del propietario, ni intento registrado en el servidor en las últimas 48 horas: el envío se cayó en el teléfono del propietario.
- Ese informe tiene 159 fotos y 22 reparaciones. Cada foto pide su enlace por separado, así que al abrir el informe el teléfono dispara ~159 pedidos casi simultáneos.
- Cuando el propietario aprieta "Enviar" mientras esos pedidos siguen en curso, el navegador (típico en iPhone/Safari) descarta el pedido nuevo y devuelve exactamente ese error.

Diagnóstico: sobrecarga de pedidos en el informe + un envío que no reintenta. No es un problema de permisos ni de datos.

## Qué vamos a hacer

1. **Pedir los enlaces de fotos en lote y por tandas**, en vez de uno por foto. Así el informe abre con pocos pedidos y deja la conexión libre.
2. **Reintentar el envío automáticamente** (hasta 3 intentos con espera creciente) antes de mostrar un error, e indicar "Enviando…" mientras ocurre.
3. **No perder lo que el propietario marcó**: guardar sus decisiones y comentarios en el propio dispositivo, para que si algo falla pueda reintentar sin volver a llenar todo.
4. **Mensaje de error claro y accionable**, con botón "Reintentar" en lugar del texto técnico.
5. **Registrar la falla** para que el equipo la vea si vuelve a ocurrir.
6. **Verificar** con una prueba de envío real en el informe publicado y confirmar que la respuesta queda guardada.

Nota: al final hay que publicar para que el propietario reciba la corrección.

## Detalle técnico

- `src/pages/public/OwnerReport.tsx`: el componente de foto llama a la función `sign-public-photo` por imagen. Cambiar a un firmado por lotes (por ejemplo 20 rutas por pedido) con cola de concurrencia limitada (2–3 pedidos en vuelo), reutilizando el patrón de firma en lote ya usado en el resto de la app.
- `handleSubmit`: envolver la llamada `supabase.rpc('submit_owner_feedback', …)` en un helper de reintento (3 intentos, backoff 500/1500 ms) que solo reintente errores de red/`TypeError`, nunca errores de validación del servidor. Mantener el diálogo abierto en caso de fallo y ofrecer "Reintentar".
- Persistir `decisions` y `submitterName` en `localStorage` con clave `owner-feedback:<property_id>:<report_version_id>`, limpiando al éxito.
- Registrar el fallo en `client_error_log` con `error_kind = 'owner_feedback_submit_failed'` (inspection_id, versión, cantidad de reintentos).
- Confirmar que `public.submit_owner_feedback` es idempotente frente a reintentos; si no lo es, hacerla idempotente por (inspection_id, report_version_id) antes de activar el reintento.
