# Informe de check-in en PDF enviado por email al inquilino

Al publicar un informe de check-in, la app genera un PDF completo con fotos, lo guarda y envía un correo al inquilino con un botón para descargarlo.

## Alcance

- Solo para inspecciones de tipo check-in (los check-out y captaciones no cambian).
- Disparo automático al publicar el informe (acción actual del ejecutivo).
- Contenido del PDF: portada con datos del inmueble e inquilino, fecha de entrega, cada sección con sus respuestas y observaciones, todas las fotos visibles, y la firma del inquilino si existe.
- Destinatario: el correo del inquilino ya registrado en la ficha de la inspección (viene de HubSpot).
- El correo incluye un enlace de descarga del PDF (no adjunto) y también el enlace al informe web.

## Requisito previo: dominio de correo

Hoy el proyecto no tiene dominio de envío configurado, así que aún no se pueden enviar correos desde la marca. Hay que configurarlo una vez (por ejemplo `notify.homie.mx`); mientras la verificación esté pendiente, el PDF ya se genera y queda disponible para descargar desde la ficha, y los envíos comienzan al verificarse.

## Experiencia

1. El ejecutivo publica el check-in como hoy.
2. La app arma el PDF, lo guarda y dispara el correo al inquilino.
3. En la ficha de la inspección aparece un bloque "Informe PDF" con: fecha de generación, botón "Descargar PDF", estado del envío (enviado / error / correo faltante) y botón "Reenviar al inquilino".
4. Si falta el correo del inquilino, se avisa en pantalla al publicar y queda el PDF disponible; el envío se puede hacer luego desde ese bloque.

## Detalles técnicos

**Generación del PDF (cliente, al publicar)**
- Nuevo módulo `src/modules/review/pdf/checkinReportPdf.ts` que arma el documento con `pdf-lib` (nueva dependencia) desde el `normalized_payload` de la versión publicada, más las fotos.
- Fotos: se descargan por URL firmada usando la variante transformada (ancho ~900, calidad 70) para mantener el archivo por debajo de ~15 MB; máximo 4 fotos por página en grilla, con pie de foto.
- Idioma español, tipografía embebida con soporte de acentos, paleta Homie (indigo #525EA2), encabezado/pie con folio y numeración de páginas.

**Almacenamiento**
- Nuevo bucket privado `inspection-reports`, ruta `{inspection_id}/checkin-v{version}.pdf`.
- Migración con políticas RLS: escritura para admin/ejecutivo dueño del flujo, lectura para admin/ejecutivo; el inquilino no lee del bucket directamente.
- Nueva tabla `inspection_report_files` (`inspection_id`, `report_version_id`, `audience`, `storage_path`, `bytes`, `download_token`, `generated_by`, `created_at`) con GRANT + RLS (lectura admin/ejecutivo; sin acceso anónimo).

**Descarga pública para el inquilino**
- Nueva Edge Function `download-report-pdf` (`verify_jwt = false`): valida `token` contra `inspection_report_files.download_token`, y responde con redirección a una URL firmada de 15 minutos. Sin token válido, 404.

**Envío del correo**
- Infraestructura de correo de Lovable Cloud: cola + función de envío, plantilla `checkin-report-ready` en `supabase/functions/_shared/transactional-email-templates/` con marca Homie: saludo al inquilino, datos del inmueble, botón "Descargar informe" (apunta a `download-report-pdf`) y enlace al informe web.
- Página de baja de suscripción con la ruta que indique la configuración.
- Registro del envío en `communication_deliveries` (ya existe) con `event_name = 'checkin_report_sent'`.

**Integración con la publicación**
- En `publishInspection` (`src/modules/review/api/inspection-actions.service.ts`): si `inspection_type = 'check_in'`, tras crear las versiones se genera el PDF, se sube, se registra el archivo y se invoca el envío con clave de idempotencia `checkin-report-{version_id}`.
- Fallos de PDF o correo no revierten la publicación: se informan en pantalla y quedan reintentables desde el bloque "Informe PDF".
- UI nueva: `src/pages/executive/review-detail/ReportPdfCard.tsx`, visible también en la ficha de admin.

## Fuera de alcance

- PDF para check-out y captación (se puede extender después reutilizando el mismo módulo).
- Adjuntar el PDF al correo (no soportado por la plataforma de envío).
