# Documento: flujo de Captación en Chile y México

## Qué se entrega

Un documento descargable, `flujo-captacion-cl-mx.md`, para evaluar la integración con el nuevo sistema de captación. Describe cómo funciona hoy la captación en la app, sacado del código y de los datos reales. No se cambia nada de la app.

## Contenido del documento

1. **Resumen y alcance**: qué cubre Homie Inspection dentro de la captación y qué queda fuera (por ejemplo, la gestión comercial previa en HubSpot).
2. **Actores y responsables por rol**: Admin, Ejecutivo de operaciones, Inspector (receptor), Contratista, Propietario y Comercial. Qué hace y qué ve cada uno.
3. **Flujo de punta a punta**, con un diagrama:
   - Origen: el negocio en HubSpot (pipeline Publicaciones) o la creación manual desde Admin.
   - Creación de la inspección y asignación por correo.
   - Coordinación y recolección de llaves.
   - Visita y registro de hallazgos.
   - Revisión, cotización, publicación del informe al propietario, respuesta del propietario.
   - Orden de trabajo al contratista y cierre ("quién repara", Finalizado).
4. **Estados**: tabla con estado interno → nombre visible → qué lo dispara → responsable → siguiente estado. Incluye las etapas (inspección, revisión, presupuesto, compartir) y los estados de respuesta del propietario y de la orden de trabajo.
5. **Datos de entrada**: campos que se reciben desde HubSpot (obligatorios y opcionales), formato, idempotencia, cómo se generan las secciones según el tipo de propiedad, y qué pasa si falta el correo o no coincide.
6. **Datos de salida hacia HubSpot**: qué campos se actualizan y en qué momento (fecha de recolección de llaves, fecha de recepción), en el objeto Deal (0-3).
7. **Diferencias Chile vs México**: país, moneda (CLP/MXN), catálogo de partidas y contratistas separados, servicio de datos del inmueble (Chile por API de Homie; México por el endpoint de homie.mx, sin bodega), dominio de correo y estado actual de usuarios y precios en México.
8. **Puntos de integración para el nuevo sistema**: qué tendría que mandar para crear una captación (webhook y formato), qué puede consultar o recibir de vuelta, reglas de deduplicación, y riesgos o vacíos conocidos (correos que no coinciden, precios de México en 0, reenvíos).
9. **Preguntas abiertas** para la decisión de integración.

## Cómo se arma

- Fuente: el código actual (estados, generador de secciones, recepción y actualización de HubSpot, catálogo por país) y conteos reales de la base de datos, solo lectura.
- Se guarda como archivo descargable para compartir. No se agrega a la app.

## Detalles técnicos

- Referencias: `src/shared/ui/status-registry.ts`, `src/lib/inspection-type-labels.ts`, `supabase/functions/hubspot-inspection-intake`, `hubspot-update-inspection`, `create_inspection_from_event`, `src/lib/markets.ts`, `docs/PRODUCT_LOGIC.md`.
- Salida: `/mnt/documents/flujo-captacion-cl-mx.md`.
