# Arreglar secciones sin opciones y textos del check-in

## 1. Por qué la sección se ve "sin datos para completar"

Las inspecciones creadas desde el 15 de septiembre quedaron con las preguntas cargadas pero **sin sus botones de estado** (Bueno / Regular / Malo / No Aplica). Por eso en "Baño 1" se ven solo los nombres de los ítems y no se puede marcar nada.

Verificado en la base de datos: las 35 inspecciones creadas entre el 15 y el 22 de septiembre tienen 0 preguntas con opciones guardadas, mientras que todas las anteriores las tienen. Afecta a check-out, captación y check-in (incluida la inspección de la capacitación DEMO-CHECKIN-01).

Causa: al restaurar el paso que guarda las preguntas (el 17 de septiembre) se dejó fuera la columna donde viajan las opciones de cada pregunta.

Qué se hace:
- Corregir el proceso de creación para que cada pregunta guarde sus opciones.
- Recuperar las opciones de las 35 inspecciones afectadas, tomándolas de la estructura original de cada inspección, sin tocar respuestas ya ingresadas.
- Revisar que ninguna sección haya quedado marcada como "Completada" sin haberse podido responder.

## 2. Textos para check-in

Hoy los textos son los del check-out ("Quien Entrega"). Para check-in pasan a hablar de recepción del inmueble:

| Check-out / Captación | Check-in |
| --- | --- |
| Datos del Inquilino / Quien Entrega | Datos del Inquilino / Quien Recibe |
| Nombre y Apellido de Quien Entrega | Nombre y Apellido de Quien Recibe |
| Email de Quien Entrega | Email de Quien Recibe |
| Teléfono de Quien Entrega | Teléfono de Quien Recibe |
| Fotos Datos del Inquilino / Quien Entrega | Fotos Datos del Inquilino / Quien Recibe |
| Recolección de llaves / inspección | Entrega de llaves / inspección |

La firma final sigue siendo del inquilino en ambos casos.

Los check-in ya existentes (4, incluida la de la capacitación) se actualizan con los textos nuevos.

## 3. Detalles técnicos

- `create_inspection_from_event`: agregar `value_json` al insert de `inspection_field_values`, construido como `jsonb_build_object('options', f->'options_json')` cuando el campo trae opciones.
- Backfill: para las inspecciones creadas desde 2026-09-15, completar `value_json` de cada `inspection_field_values` cruzando `inspections.generated_structure_json` por `section_key` + `field_key`, solo donde falten las opciones (merge, sin sobrescribir contenido existente).
- Reset de secciones marcadas `completed` sin respuestas ni fotos, únicamente en inspecciones en `pending_assignment` / `assigned` / `in_progress`.
- Copys: en `src/lib/inspection-generator.ts` y `supabase/functions/_shared/inspection-generator.ts` (ambos deben quedar iguales por el test de paridad) usar etiquetas condicionales según `inspection_type === 'check_in'` para la sección `handover_person` y `ctx_fecha_recoleccion`.
- Backfill de etiquetas: actualizar `section_title` en `inspection_sections`, `field_label` en `inspection_field_values` y la estructura almacenada de las inspecciones check_in existentes.
- Verificación con Playwright: entrar con el usuario de la capacitación (`checkin.demo@homie.mx`) y confirmar que "Baño 1" muestra los botones de estado y que la sección de datos dice "Quien Recibe"; y con la cuenta de Vanessa, que Matucana 1161 D 2112 ya permite marcar y comentar.
