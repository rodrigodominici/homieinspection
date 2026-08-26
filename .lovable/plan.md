# Los cambios no se perdieron: el navegador está usando una versión vieja

## Qué verifiqué

- La tarjeta **Finalizados** sigue en el dashboard (`AdminDashboard.tsx`), con su ícono y borde verde.
- El estado `sent` sigue mapeado a la etapa `finalized` en la lógica de KPIs (`inspection-buckets.ts`).
- El botón **Finalizar inspección** sigue montado tanto en el detalle de admin como en la vista de publicación del ejecutivo.
- El diseño uniforme de las tarjetas (alto mínimo y etiquetas a 2 líneas) sigue en `KpiCard`.
- No hay errores de build.
- En las llamadas de red que capturó tu sesión, el dashboard pidió a la base de datos **menos columnas** de las que pide el código actual: eso confirma que la pestaña estaba ejecutando un bundle anterior, cacheado por el service worker (PWA), no el código actual.

Conclusión: nada se revirtió. Lo que ves es una versión vieja de la app cargada desde caché (y, si estás mirando el dominio publicado, ese dominio todavía no tiene el último deploy).

## Paso inmediato (sin cambios de código)

1. Recargá con caché forzado (Cmd/Ctrl + Shift + R) en la vista previa.
2. Si seguís en la app instalada (PWA), cerrala por completo y volvé a abrirla.
3. Para que el equipo lo vea en producción, hay que publicar.

## Cambio propuesto para que no vuelva a pasar

El aviso de nueva versión hoy sólo aparece si el navegador detecta el worker en espera; si el service worker ya tomó control con el bundle viejo, nadie fuerza la actualización.

- Agregar una comprobación de versión al montar la app y cada pocos minutos: comparar la versión del build embebida (`src/lib/app-version.ts`) contra un archivo de versión servido sin caché.
- Si difieren, mostrar el mismo cartel "Actualizar" que ya existe, y si el usuario no actúa, recargar automáticamente al volver a la pestaña.
- Mantener el resto del comportamiento del service worker igual (no toco caché de datos ni de fotos).

## Detalles técnicos

- `NewVersionPrompt.tsx`: sumar un chequeo periódico con `fetch` a un endpoint de versión con `cache: "no-store"`, además del `reg.update()` actual por visibilidad.
- Exponer la versión del build como archivo estático generado en el build (o reutilizar el hash ya disponible en `app-version.ts`) para comparar.
- Sin cambios de base de datos, ni de RLS, ni de lógica de estados.
