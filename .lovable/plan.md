## Diagnóstico — San Isidro 96 D 1712

**Inspección:** `87e186be-5ce1-4c14-bd0b-3eefd3ff1403` — status `published` desde `2026-07-01 16:20:16`. Última foto en BD: `2026-06-30 04:04:38`. Cero fotos insertadas después del intento reportado.

### Qué encontré

1. **El mensaje "HTTP 400 error" es genérico del SDK de Storage.** El cliente supabase-js lo devuelve cuando la respuesta 400 del bucket viene con cuerpo vacío o no-JSON. **No es el error real** — el mensaje útil se pierde antes de llegar al toast del inspector.

2. **Las causas más probables de un 400 "opaco" en móvil**, por orden de frecuencia:
   - **JWT expirado / sesión caduca** durante una sesión larga en móvil (WhatsApp abre el link, la app queda en background, el token no refresca a tiempo). Storage rechaza con 400 y cuerpo vacío.
   - **HEIC de iPhone**: `compressImage` intenta cargar el archivo en `<img>`; si Safari no decodifica, cae al `onerror` y **sube el archivo HEIC original** con `contentType: 'image/jpeg'`. El bucket rechaza el mismatch.
   - **Blob vacío**: `canvas.toBlob` retorna `null` (fotos muy grandes / poca memoria RAM en el device) y se sube el `File` original — si es HEIC vuelve al punto anterior.
   - **RLS de Storage**: descartado. Las políticas de `inspection-photos` e `inspection_photos` **no filtran por status**, así que el `published` no bloquea el upload por sí solo.
   - **Bucket size/mime limit**: descartado. El bucket no tiene límites configurados.

3. **RLS status-gap:** aunque no causa el 400 de hoy, hay un hueco: un inspector puede insertar fotos en una inspección `published` a nivel de storage/DB. La UI lo esconde con `isInspectorReadOnly`, pero el backend no.

### Qué haría el fix

**A. Diagnóstico real (obligatorio).** Sin esto seguiremos a ciegas:
- Envolver el error del SDK y **loggear a `slack_notifications_log`** (o una tabla nueva `client_error_log`) con: `inspection_id`, `section_key`, `user_id`, `file.type`, `file.size`, `navigator.userAgent`, `error.message`, `error.statusCode`. Un solo campo `context jsonb` alcanza.
- Mostrar en el toast el `statusCode` y el `message` del `StorageError` (no solo `.message`), para que el inspector pueda mandar captura útil.

**B. Robustez del upload (previene el 90 % de los 400 reales):**
- **Refresh explícito del JWT** justo antes de subir: `supabase.auth.getSession()` → si `expires_at` está a <60 s, `refreshSession()`. Si falla el refresh, decir "Sesión expirada, vuelve a iniciar" en lugar de 400 opaco.
- **Reintento con backoff** (2 intentos, 1 s / 3 s) para 400/5xx/network.
- **Fallback HEIC → JPEG**: si `img.onerror` dispara en `compressImage`, **abortar** el upload en vez de subir el archivo original con content-type mentido. Toast: "Formato de foto no soportado en tu navegador. Toma la foto de nuevo con la cámara."
- **Validar blob no-vacío** antes del `.upload()`. Si `blob.size === 0`, abortar con mensaje claro.
- Centralizar toda esta lógica en `uploadInspectionPhotos` para que el flujo del inspector (`InspectorSectionComplete`) y el del ejecutivo (`PhotoPanel`) la compartan. Hoy el inspector tiene su propia copia en `handlePhotoUpload`.

**C. Cerrar el hueco de RLS (opcional pero recomendado):**
- Añadir en las políticas de INSERT de `storage.objects` e `inspection_photos` la condición `i.status NOT IN ('published','sent','approved')` para inspectores. Así, si por algún bug la UI expone el botón en read-only, el backend lo rechaza con mensaje claro en lugar de un 400 genérico.

### Alcance sugerido de esta iteración

Propongo **A + B** en un solo cambio (diagnóstico + robustez). **C** lo dejamos para una migración aparte porque toca políticas y quiero probar A/B primero con el logging para confirmar la causa raíz en los próximos casos reales.

### Archivos que tocaría

- `src/shared/lib/inspection-photos.ts` — refresh JWT, reintento, validación blob, HEIC guard, error enriquecido.
- `src/pages/inspector/InspectorSectionComplete.tsx` — reemplazar `handlePhotoUpload` local por `uploadInspectionPhotos`.
- `src/pages/executive/review-detail/PhotoPanel.tsx` — surface `statusCode` en toast.
- Migración nueva: tabla `client_error_log` (o reutilizar `inspection_audit_log` con `action='photo_upload_failed'`).

¿Avanzo con A+B, o prefieres que primero solo agregue el logging (A) para capturar el error real del próximo caso antes de tocar la lógica de upload?