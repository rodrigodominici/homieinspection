# Informe de check-in en PDF descargable

Al publicar un informe de check-in, la app genera un PDF completo con fotos y lo deja disponible para descargar desde la ficha de la inspección. El envío por correo al inquilino queda para una etapa posterior.

## Alcance

- Solo para inspecciones de tipo check-in (check-out y captación no cambian).
- Se genera automáticamente al publicar el informe, y también con un botón "Generar PDF" para regenerarlo.
- Contenido: portada con datos del inmueble e inquilino, fecha de entrega, cada sección con sus respuestas y observaciones, todas las fotos visibles, y la firma del inquilino si existe.
- Descarga desde la ficha de la inspección (Ejecutivo y Admin).

## Experiencia

1. El ejecutivo publica el check-in como hoy.
2. La app arma el PDF y lo guarda; aparece un bloque "Informe PDF" en la ficha con fecha de generación, tamaño y botón "Descargar PDF".
3. Si la generación falla, el bloque lo indica y permite reintentar con "Generar PDF"; la publicación no se ve afectada.

## Detalles técnicos

**Generación del PDF (en el navegador, al publicar)**
- Nuevo módulo `src/modules/review/pdf/checkinReportPdf.ts` que arma el documento con `pdf-lib` (nueva dependencia) desde el `normalized_payload` de la versión publicada más las fotos.
- Fotos: se descargan por URL firmada usando la variante transformada (ancho ~900, calidad 70) para mantener el archivo por debajo de ~15 MB; grilla de 4 fotos por página con pie de foto.
- Español, tipografía embebida con acentos, paleta Homie (indigo #525EA2), encabezado/pie con folio y numeración de páginas.

**Almacenamiento**
- Nuevo bucket privado `inspection-reports`, ruta `{inspection_id}/checkin-v{version}.pdf`, creado con la herramienta de storage.
- Migración con políticas RLS en `storage.objects`: lectura y escritura para admin y ejecutivo; sin acceso anónimo.
- Nueva tabla `inspection_report_files` (`inspection_id`, `report_version_id`, `audience`, `storage_path`, `bytes`, `generated_by`, `created_at`) con GRANT + RLS (lectura/escritura admin y ejecutivo).
- La descarga usa URL firmada de corta duración generada desde la app.

**Integración con la publicación**
- En `publishInspection` (`src/modules/review/api/inspection-actions.service.ts`): si `inspection_type = 'check_in'`, tras crear las versiones se genera el PDF, se sube y se registra en `inspection_report_files`.
- Un fallo de PDF no revierte la publicación: se avisa en pantalla y queda reintentable.
- UI nueva: `src/pages/executive/review-detail/ReportPdfCard.tsx`, usada también en la ficha de admin.

## Fuera de alcance (etapa siguiente)

- Envío del PDF por correo al inquilino (requiere configurar el dominio de envío).
- PDF para check-out y captación (el módulo queda preparado para extenderse).
