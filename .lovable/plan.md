# Arreglar el aviso "Hay una versión nueva" que no desaparece

## Qué está pasando

- La app publicada está bien: la versión del servidor y la del código publicado coinciden (5/10, 13:31).
- El problema está en los celulares. La app instalada guarda una copia propia de sí misma y la abre en vez de descargar la nueva. El aviso detecta que esa copia es vieja, pero al tocar "Actualizar" el celular vuelve a abrir la misma copia guardada. Por eso el mensaje no se va aunque cierren todo o actualicen desde la computadora.
- Mientras corre esa versión vieja, las fotos también fallan: esa copia no tiene los últimos arreglos y además guarda en su memoria algunas respuestas del servidor de fotos.

## Qué vamos a hacer

1. **Limpiar los celulares automáticamente.** Publicamos un "limpiador" que reemplaza la copia guardada. La próxima vez que el inspector abra la app con señal, borra la copia vieja, se desactiva y recarga la versión real. No hace falta reinstalar ni hacer nada a mano.
2. **Que la app deje de guardar copias de sí misma.** Se mantiene el ícono en la pantalla de inicio, así que sigue pareciendo una app. Lo que se quita es el modo "funciona sin internet" de la app completa, que es lo que provoca el problema. Las fotos pendientes por falta de señal se siguen reintentando como hasta ahora.
3. **Botón "Actualizar" que siempre funcione.** Si el aviso vuelve a aparecer, al tocarlo se borra todo lo guardado y se descarga la versión nueva. Si aun así no se actualiza, deja de mostrarse en bucle.
4. **Publicar** para que llegue a los inspectores.

## Qué tienen que hacer los inspectores después

Solo abrir la app con internet, una o dos veces. Si alguno sigue viendo el aviso después de eso, la solución de respaldo es borrar los datos del sitio en el navegador.

## Detalles técnicos

- `vite.config.ts`: quitar `VitePWA`. Dejar el manifest en `public/manifest.webmanifest` con los mismos `start_url`, `scope` e íconos, y enlazarlo en `index.html`. Mantener `versionFilePlugin`.
- `public/sw.js`: kill-switch del skill PWA. Borra solo las cachés de Workbox de su scope (precache/runtime) y `supabase-edge`, hace `clients.claim`, navega los clientes y llama a `unregister` en `finally`.
- `NewVersionPrompt.tsx`: sacar el detector del service worker (`reg.waiting` dejaba el aviso fijo). Al tocar "Actualizar": `getRegistrations().unregister()` + `caches.delete` de las cachés de la app, y recargar con cache-bust. Guardar en `sessionStorage` una marca por versión para cortar el bucle si después de recargar sigue la misma versión.
- `lazy-with-retry.ts`: revisar que su limpieza de service worker quede compatible.
- Sin cambios de base de datos.
