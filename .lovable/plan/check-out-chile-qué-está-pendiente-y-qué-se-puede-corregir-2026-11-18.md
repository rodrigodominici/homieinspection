# Check-out Chile: qué está pendiente y qué se puede corregir

## Diagnóstico de cada punto

| # | Pedido | Estado real en HI | Qué hacer |
|---|---|---|---|
| S1 | La fecha de llaves también se copia en «Recepción de check-out» | HI manda cada fecha a su propio campo; la de recepción usa el día en que el receptor envía. **No pude confirmar la causa**: puede ser una automatización de HubSpot o un caso puntual | Revisar en HubSpot 2 o 3 contratos afectados y el registro de envíos. Si el error está en HI, se corrige; si está en HubSpot, se le avisa al equipo |
| S2/S3 | Que la fecha de envío del receptor llegue a «Fecha de recepción de checkout» del contrato | **Ya funciona** (60 envíos correctos en 30 días). Detalle menor: la fecha se toma en hora UTC, así que un envío nocturno puede caer en el día siguiente | Usar la hora de Chile |
| E1 | Cotización adicional con otro contratista o un proveedor externo | **Pendiente.** Hoy hay una sola OT por inspección | Agregar la opción de varias OT por inspección y proveedores externos (es el cambio más grande) |
| E2 | Modificar la cotización después de que la aprobó el propietario | **Ya existe** (cambios con OT, aprobación del inversionista). No sirve una vez que la obra está en revisión o aprobada | Agregar el «cierre final» con lo realmente ejecutado para cobrar el finiquito |
| A1 | Asignar contratista desde Administración | **Ya existe**, pero solo aparece cuando «Repara Homie» está marcado y la cotización está aprobada o publicada | Mostrar por qué no aparece cuando falta alguna de esas condiciones |
| C1 | Contratista ve el total aprobado (costo proveedor sin IVA) | Pendiente | Se puede hacer |
| C2 | Ítems agrupados por área | Pendiente (hoy se ordenan alfabéticamente) | Se puede hacer |
| C3 | Ocultar datos del inquilino y mandarlos con un mensaje al crear la OT | Ocultos solo en el informe | Ocultarlos en todo el portal y agregar un campo de mensaje en la OT |
| C4 | Adjuntar el informe de hallazgos a la OT | **Ya existe** en el portal | Agregar descarga en PDF si hace falta |
| C5 | Quitar la foto «antes» obligatoria | **Ya no se exige**; solo se pide la foto «después» | Nada; confirmar con el equipo |
| C6 | El contratista propone una cotización adicional | Pendiente | Agregar propuesta con foto, comentario y costo, que aprueba la ejecutiva |
| C7 | «No realizadas» → «Por ejecutar» | Pendiente | Cambiar el nombre y permitir retomar el ítem |
| C8 | Descargar las versiones del informe de ejecución | Pendiente | Generar una versión cada vez que el contratista envía |
| F1–F4 | Inspección final con inspector asignado, cumple / no cumple por ítem y campo de HubSpot | Pendiente; hoy la ejecutiva aprueba o devuelve la obra completa | Hacer un módulo nuevo y enviar el inspector a «Inspector – Trabajos finales» |
| V | Vacancia: tres tipos de trabajo | Pendiente | Clasificar cada ítem según su origen (requiere E1) |

## Orden propuesto
1. **Rápidos (1 entrega):** S1 diagnóstico, fecha en hora de Chile, A1 aviso, C1, C2, C3, C7.
2. **Medianos:** C6 propuestas del contratista, C8 versiones del informe, E2 cierre final para finiquito.
3. **Grandes:** E1 varias OT y proveedor externo, inspección final (F1–F4) con HubSpot, tipos de trabajo para vacancia.

## Detalles técnicos
- S1: revisar `hubspot_sync_log` y los contratos en HubSpot. Fecha local: formatear con America/Santiago en `hubspot-update-inspection`.
- E1: quitar el UNIQUE(inspection_id) de `inspection_work_orders`, sumar un tipo y un origen por OT, y un proveedor externo sin cuenta.
- F: nueva tabla de verificación por ítem, asignación de inspector y mapeo del owner al campo del contrato (2-47492934).
- Confirmar que las migraciones de revisiones de cotización (0006–0008) están aplicadas en producción.
