# Data de prueba completa para San Isidro 337 D 1207 + texto para Slack

## Objetivo

Dejar el inmueble `RE0003835` (San Isidro 337 D 1207, Santiago — Rodrigo Test) con las tres inspecciones del ciclo completo, llenas, con fotos y publicadas, para grabar un Loom. Además, entregar un texto listo para pegar en Slack con lo que hicimos hoy.

## Estado actual

- Ya existen dos inspecciones del inmueble, ambas en "Coordinada" y sin datos ni fotos:
  - Check-in (9 de septiembre, 12 secciones, 0 fotos)
  - Check-out (12 secciones, 0 fotos)
- No existe inspección de captación para este inmueble.
- Ambas tienen inspector y ejecutivo asignados.

## Qué se va a generar

### 1. Inspección de captación
Se crea por el mismo camino que usa la integración real (evento de entrada + creación automática), para que quede idéntica a una captación de producción: mismo inmueble, mismo inspector y ejecutivo, fecha reciente.

### 2. Llenado de las tres inspecciones
Para captación, check-in y check-out:
- Datos del inmueble y de quien entrega/recibe (inquilino "Rodrigo Test").
- Todas las secciones operativas respondidas (Acceso, Living, Cocina, Dormitorio, Walking Closet, Baño, Terraza, Otros Generales) con una mezcla realista de "bueno", "regular" y "malo".
- Observación final por sección y observaciones del inspector.
- Firma del inquilino en las tres.
- Fechas coherentes: captación primero, luego check-in, luego check-out (con término de contrato y recolección de llaves).

### 3. Fotos
- 4 fotos por sección operativa (unas 32 por inspección, ~96 en total).
- Se copian fotos reales ya existentes en el sistema a la carpeta propia de cada inspección, para que cada una tenga sus archivos independientes y se vean como fotos reales en el informe y en el visor con zoom.

### 4. Avance del flujo hasta publicado
- Captación: enviada por el inspector → revisada → informe publicado.
- Check-in: enviada → revisada → informe publicado para el inquilino + informe PDF de entrega generado (queda descargable en la ficha).
- Check-out: enviada → revisada → cotización con varios ítems del catálogo de reparaciones (con precios cliente y contratista) → informe publicado al propietario → respuesta del propietario aceptando → aprobado → finalizado con "quién repara: Homie".

Así el Loom puede recorrer: ficha de Inmuebles con las tres inspecciones y comparación de estados, informe público de propietario, informe del inquilino, PDF descargable, cotización y tablero.

### 5. Verificación
Se revisa en la aplicación (con capturas) que aparezcan: las 3 inspecciones en la ficha del inmueble, las fotos visibles en cada sección, el informe público, el PDF de check-in y los estados correctos en el tablero.

## Texto para Slack

Se entrega en el chat (y como archivo descargable) un mensaje corto, en tono operativo, con lo de hoy:
- Soporte de inspecciones de check-in con su propio flujo de estados y etiquetas.
- Nueva sección Inmuebles: historial y comparación entre captación, check-in y check-out.
- Informe de entrega en PDF descargable para check-in, generado al publicar y regenerable a mano.
- Filtros nuevos en el tablero: tipo de inspección y recolección de llaves.
- Selector de país global con permisos por país (Chile, México, Perú).
- Corrección de la llegada de inspecciones desde HubSpot cuando la fecha venía en otro formato.
- Panel de inspecciones incompletas para controlar las que se empezaron y no se cerraron.
- Fotos: se ven todas las cargadas, sin límite de visualización.

## Detalles técnicos

- La captación se crea insertando un registro en `inspection_source_events` y ejecutando `create_inspection_from_event` con sesión de administrador (mismo camino que el intake de HubSpot).
- Llenado de `inspection_field_values` con los `field_key`/`field_label` de cada sección existente, `inspection_sections.final_observation` y `inspection_signatures` (upsert por `inspection_id`).
- Fotos: copia de objetos dentro del bucket `inspection-photos` a `inspections/<inspection_id>/<section_key>/<uuid>.jpg` y filas en `inspection_photos` (`visible_to_owner = true`).
- Avance de flujo: actualización de `status`/`current_stage` y marcas de tiempo, `inspection_repair_items` para el check-out, `inspection_report_versions` publicadas con `public_token`, `inspection_owner_feedback*` para la aceptación y `finalize_inspection` para el cierre.
- El PDF de check-in se genera con el flujo existente en el navegador y queda en el bucket privado `inspection-reports` con su registro en `inspection_report_files`.
- No se requieren migraciones ni cambios de código de la aplicación: es solo carga de datos de prueba.
