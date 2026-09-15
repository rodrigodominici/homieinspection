# Ajustes al check-in: informe, estado y acceso del Property Advisor

Tres correcciones sobre el check-in de Curiñanca 715 D 517 (`RE0002984`).

## 1. El informe muestra secciones vacías

Confirmado en la base: la sección **Datos del Inmueble** tiene 13 campos y los 13 están vacíos, porque en la app esos datos se muestran como contexto leído del inmueble y nunca se guardan como respuestas. El PDF los lee de las respuestas, así que imprime "Sin registros en esta sección". Lo mismo pasa con parte de **Introducción**.

Cambio: el PDF toma esos datos del inmueble (dirección, código, tipo, país, torre, número, dormitorios, baños, estacionamiento, bodega, fecha de recolección de llaves, correo del receptor) directamente de la ficha del inmueble, igual que la app. Si un campo no tiene dato, se omite en lugar de mostrar la sección como vacía.

También, en check-in no existe ejecutivo por diseño: se quita la línea "Ejecutivo responsable" del informe y el receptor se rotula "Property Advisor".

## 2. Al finalizar, el admin ve "En gestión de cotización"

La inspección quedó en el estado interno "enviada", y la etiqueta genérica de ese estado es "En gestión de cotización" — pensada para check-out, que sí tiene cotización.

Cambio: para check-in las etiquetas pasan a ser **"En espera de revisión"** (recibida del advisor) y **"Finalizado"** al cerrarla; nunca se muestra "cotización". Check-out y captación no cambian.

## 3. El Property Advisor debe poder descargar el informe

Hoy solo Admin y Ejecutivo pueden generar y descargar el PDF.

Cambio: el advisor asignado a un check-in ve en la ficha de su inspección un bloque "Informe de entrega (PDF)" con botones para generarlo y descargarlo, con la misma tarjeta que usa Admin. Solo para sus propias inspecciones de check-in.

## Detalles técnicos

- `src/modules/review/api/checkin-report.service.ts`: pasa al PDF los datos del snapshot efectivo (`getEffectiveSnapshot`) como bloque de contexto; `src/modules/review/pdf/checkinReportPdf.ts` recibe un arreglo `propertyFacts` y lo imprime en la sección de datos del inmueble, y omite secciones cuyo único contenido eran campos `ctx_*` vacíos. Se elimina `executiveName` del layout para check-in.
- `src/lib/inspection-combined-status.ts`: `Input` suma `inspection_type`; para `check_in`, `submitted`/`in_review` devuelven `{ label: 'En espera de revisión' }`. `StatusBadge` ya pasa la inspección completa, sin cambios de firma en las páginas.
- Migración: RLS de `inspection_report_files` y políticas de `storage.objects` sobre el bucket `inspection-reports` amplían lectura e inserción al `inspector_id` de la inspección cuando `inspection_type = 'check_in'` (via subconsulta a `inspections`), manteniendo Admin/Ejecutivo y sin acceso anónimo.
- `src/pages/inspector/InspectorInspectionDetail.tsx`: renderiza `ReportPdfCard` cuando el tipo es check-in y la inspección ya fue enviada.
