# Video de lanzamiento: 4 nuevos features

Video animado de ~25 segundos, horizontal (1920x1080), sin audio, en español, listo para compartir en Slack o en una presentación. Todo el texto se lee en pantalla, así que se entiende en silencio.

## Guion (5 escenas)

1. **Apertura (0-4 s)** — Logo/wordmark "Homie Inspección" y bajada: "Cuatro avances de producto". Entrada con revelado de tipografía grande.
2. **Check-in (4-9 s)** — Título "Ya generamos inspecciones de Check-in". Visual: tres fichas (Captación / Check-in / Check-out) donde la de Check-in se enciende y completa el ciclo del inmueble.
3. **Inmuebles y comparación (9-15 s)** — "Nueva sección Inmuebles". Visual: ficha de inmueble con línea de tiempo de inspecciones y dos paneles antes/después que se deslizan para comparar.
4. **Informe al inquilino (15-20 s)** — "Informe de entrega en PDF". Visual: páginas de PDF que se apilan y un sobre/envío que sale hacia el inquilino, con el detalle "envío automático por email".
5. **Multipaís + cierre (20-25 s)** — "Listo para operar en todos los países". Visual: selector de país con Chile activo y México y Perú apareciendo; cierre con las 4 frases resumidas y el wordmark.

## Dirección visual

- Paleta de la marca: Homie Indigo `#525EA2`, fondo profundo `#1B1E2E` con degradado sutil, superficie `#EEF1F8`, texto claro `#F6F7FB`, acento cálido para destacados.
- Tipografía: Inter (display en peso alto + cuerpo regular), coherente con la app.
- Estilo: tech product — geometría limpia, cortes precisos, capas de fondo con movimiento lento, entradas por resorte y revelados por recorte. Sin degradados morados genéricos, sin neón.
- Ritmo variado: escenas de 4 a 6 segundos, transiciones consistentes (barrido + deslizamiento), nada estático.

## Alcance

- Motion graphics con texto y formas; no incluye capturas reales de la app.
- Sin voz en off ni música.
- Entrega: un archivo MP4 descargable.

## Detalles técnicos

- Proyecto Remotion nuevo bajo `remotion/` (React + Tailwind, 1920x1080, 30 fps, ~750 frames), escenas separadas en `remotion/src/scenes/`, capas persistentes de fondo, `TransitionSeries` para el encadenado.
- Fuente vía `@remotion/google-fonts/Inter`; toda la animación con `useCurrentFrame()` + `interpolate()`/`spring()`.
- Render headless con script programático a `/mnt/documents/homie-inspection-features.mp4`, con verificación de frames clave antes del render final.
- No se modifica ningún archivo de la aplicación.
