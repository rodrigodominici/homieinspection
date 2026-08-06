# Crear manualmente el check-out de San Ignacio de Loyola 3233 D 503

El workflow de HubSpot no envió este check-out, así que se crea directamente en la base de datos usando el mismo camino que usa la integración (evento de origen + generación de estructura), para que quede idéntico a una inspección creada automáticamente.

## Datos confirmados

- Tipo: check-out
- Mercado: Chile (CL)
- ID de propiedad: RE0003927
- Dirección: San Ignacio de Loyola 3233 D 503
- Fecha de término real de contrato: 2026-08-06
- Receptora: Vanessa Mendoza (inspectora activa, CL)
- Ejecutivo: David Chavez
- Inquilina: Karen Yu-Yen Bustios Wong (sin WhatsApp informado)
- Tipología: departamento, 2 dormitorios / 1 baño
- Sin bodega ni estacionamiento informados
- Origen: HubSpot, contrato 37395005360

## Qué se hará

1. Registrar un evento de origen con el payload normalizado (marcado como recuperación manual del contrato de HubSpot, conservando el ID externo para evitar duplicados futuros).
2. Generar la estructura de secciones y campos correspondiente a un departamento 2D/1B con el generador canónico, igual que la integración automática.
3. Crear la inspección ya asignada a Vanessa Mendoza (receptora) y David Chavez (ejecutivo), en etapa de inspección y estado asignado.
4. Verificar que la inspección aparezca correctamente en el panel de la receptora y en la cola del ejecutivo, con la fecha de término de contrato visible en los calendarios.

## Notas técnicas

- Se inserta en `inspection_source_events` con `source = 'hubspot'`, `event_type = 'inspection.create'`, `external_object_id = '37395005360'`, `payload_json` + `normalized_payload_json` (incluyendo `__snapshot__` y `__generated__`), y luego se ejecuta `create_inspection_from_event` para que todos los inserts ocurran en una sola transacción.
- `property_type = 'departamento'`, `bedrooms_count = 2`, `bathrooms_count = 1`; sin flags de bodega/estacionamiento (el generador solo lee `property_type` y los conteos).
- `fecha_de_termino_real_de_contrato = 2026-08-06`; `scheduled_at` queda sin fijar hasta que se agende la visita, salvo que se indique lo contrario.
- No se toca esquema ni código de la aplicación: es solo carga de datos operativa.
- Si el webhook de HubSpot reenvía este contrato más adelante, el evento existente evita crear una inspección duplicada.
