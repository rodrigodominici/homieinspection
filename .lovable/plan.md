# Corregir 404 en links de Slack (`/inspections/:id`)

## Diagnóstico

La ruta compartida `/inspections/:id` ya está registrada en `src/App.tsx` (línea 111) y apunta a `InspectionRoleRedirect`, que redirige a `/admin/inspections/:id`, `/executive/inspection/:id` o `/inspector/inspection/:id` según el rol.

El 404 que ves al abrir `https://app.inspection.homie.mx/inspections/660873af-…` con `rodrigo.dominici@homie.mx` no es un bug de código: el dominio custom sirve la última build publicada, y esa build es previa al cambio que agregó la ruta. Por eso el router del bundle en producción no reconoce `/inspections/:id` y cae al catch-all `NotFound`.

En el preview de Lovable (`id-preview--…lovable.app`) el link sí funciona porque corre el código actual.

## Plan

1. **Publicar la app** desde Lovable para que `app.inspection.homie.mx` y `homieinspection.lovable.app` sirvan el bundle que ya incluye la ruta `/inspections/:id`.
2. **Validar** volviendo a abrir `https://app.inspection.homie.mx/inspections/660873af-9071-4d4c-9d90-e14cc3217aef` con la sesión de `rodrigo.dominici@homie.mx` (admin) — debe redirigir a `/admin/inspections/660873af-…`.
3. Si tras publicar sigue en 404, revisar caché del navegador (hard reload) y confirmar que el service worker/preview no esté sirviendo assets viejos.

## Detalles técnicos

- No hay cambios de código pendientes: `InspectionRoleRedirect.tsx` y el `Route` correspondiente están correctos y protegidos por `ProtectedRoute` con roles `['admin','executive','inspector']`.
- El Edge Function `notify-executive-slack` ya emite el link con `/inspections/:id`, así que una vez publicado todos los mensajes previos y futuros de Slack funcionarán para admin, ejecutivo e inspector.
- No requiere migración de base de datos ni redeploy de edge functions.
