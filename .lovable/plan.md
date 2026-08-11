# Pantalla de auth colgada: diagnóstico y blindaje

## Qué está pasando (verificado ahora)

- El servicio de autenticación responde normal (`/auth/v1/health` en ~50 ms).
- La **API de datos está colgada**: una consulta mínima a `profiles` con la llave pública no responde en 25 s (3 intentos seguidos, sin respuesta). Una consulta interna a la base falla con `Connection terminated due to connection timeout`.
- Conclusión: el bloqueo no viene de los cambios recientes en la pantalla de login. El login en sí puede resolver, pero justo después la app pide el perfil del usuario (con 3 reintentos y esperas) y esa llamada nunca vuelve, así que la interfaz se queda en estado de carga ("Loading…" / "Preparando tu cuenta…").
- Con sesión nueva y sin token previo, `/auth` sí renderiza el formulario (probado en navegador headless), lo que refuerza que el cuelgue aparece cuando hay que leer datos.

## Plan

### 1. Restablecer el backend (causa raíz, primero)
- Reiniciar el backend de Lovable Cloud para liberar el pool de conexiones saturado.
- Verificar salud después del reinicio y repetir la prueba de la API de datos hasta que responda en tiempos normales.
- Si vuelve a saturarse, revisar consultas lentas y bloqueos para identificar qué está consumiendo las conexiones.

### 2. Que la app nunca se quede colgada aunque el backend falle
- Poner un límite de tiempo a la carga del perfil (unos segundos) y reducir los reintentos con espera creciente, en lugar de esperar indefinidamente.
- Distinguir tres estados en vez de uno: cargando, perfil obtenido y **error de backend**.
- Cuando el perfil no se pueda obtener, mostrar una pantalla clara de "no pudimos conectar con el servidor" con botones de reintentar y cerrar sesión, en lugar del spinner infinito. Esto aplica tanto a la pantalla inicial como a las rutas protegidas.
- Mantener el mecanismo de seguridad ya existente que evita quedarse cargando cuando falla la renovación del token.

### 3. Aviso visible de incidente
- Reutilizar el banner de estado del backend para que, ante fallas de la API de datos, el usuario vea un mensaje de incidente en lugar de una pantalla en blanco o cargando.

### 4. Verificación
- Probar en navegador: sesión nueva, sesión vencida y login completo con el backend sano.
- Simular backend caído para confirmar que aparece la pantalla de error con reintento y no un spinner infinito.

## Detalles técnicos

- `src/contexts/AuthContext.tsx`: agregar `profileError` al contexto; envolver la consulta a `profiles` con `Promise.race` + timeout (~6 s) y bajar los reintentos a 2 con backoff corto; exponer `retryProfile()`.
- `src/pages/Index.tsx` y `src/components/ProtectedRoute.tsx`: consumir `profileError` y renderizar un estado de error accionable (reintentar / cerrar sesión) en lugar de seguir en estado de carga.
- `src/components/BackendStatusBanner.tsx` / `src/hooks/useBackendHealth.ts`: contemplar el caso de API de datos sin respuesta (timeout) como estado degradado.
- Restauración del backend vía la herramienta de reinicio de Cloud (requiere tu aprobación), seguida de comprobación de estado y de una consulta de prueba.
