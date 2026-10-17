# App completa sin conexión (receptores, sobre todo México)

## Qué va a poder hacer el receptor
- Abrir la app sin señal si ya la abrió antes con internet.
- Ver sus inspecciones asignadas (las que se descargaron la última vez que tuvo señal).
- Llenar respuestas y sacar fotos sin internet. Todo queda guardado en el celular.
- Ver un aviso claro: "Sin conexión — X cambios y Y fotos pendientes".
- Cuando vuelve la señal, todo se envía solo y en orden, y el aviso desaparece.
- No se puede enviar ni finalizar la inspección sin conexión. El botón se activa cuando todo está subido.

## Cuidados
- Antes de cerrar sesión con cambios pendientes, la app avisa para que no se pierdan.
- Si alguien del admin cambió la misma respuesta mientras tanto, gana el cambio más reciente y queda registrado.
- Para evitar el problema de antes (celulares atascados en versiones viejas), la app abre siempre la versión nueva cuando hay internet, y la copia guardada solo se usa sin señal. También queda un "botón de emergencia" para borrar la copia guardada.
- Esto solo funciona en la app publicada, no en la vista previa del editor.

## Etapas
1. Fotos y respuestas en cola en el celular, con subida automática al volver la señal (se puede probar y usar sola).
2. Inspecciones asignadas guardadas para verlas sin señal.
3. Que la app abra sin internet.

## Detalles técnicos
- Cola en IndexedDB (blobs de fotos ya comprimidos + upserts de inspection_field_values), procesada al evento `online` y al abrir la app; reintentos con la lógica actual de `uploadInspectionPhotos`.
- Caché de datos del inspector (inspecciones, secciones, valores) en IndexedDB vía persistencia de React Query.
- App shell offline con `vite-plugin-pwa` (generateSW, `/sw.js`, NetworkFirst para HTML, CacheFirst solo para assets con hash, `devOptions.enabled: false`, `injectRegister: null`, registro desde un único wrapper con guardas de preview/iframe/dev y `?sw=off`). Esto reemplaza el kill-switch actual de `public/sw.js`; se actualiza la regla en AGENTS.md.
- Bloquear `finalize`/submit mientras la cola no esté vacía.
