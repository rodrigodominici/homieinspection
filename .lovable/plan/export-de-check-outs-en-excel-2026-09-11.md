# Export de check-outs en Excel

Un archivo Excel con las 200 inspecciones de check-out, una fila por inspección.

## Contenido de la fila

Datos de la inspección:
- ID interno, país, tipo, dirección / nombre del inmueble, unidad, código de inmueble (RE...)
- Inspector, ejecutivo, contratista
- Estado actual (etiqueta que se ve en la app) y quién repara
- Respuesta del propietario (aceptada / sin respuesta / cierre manual)

Fechas de cada momento del flujo:
- Creación
- Recolección de llaves y término de contrato
- Inspección en terreno: inicio y término
- Revisión terminada
- Cotización terminada
- Publicación del informe
- Aprobación
- Finalización

Además, para cada cambio de estado registrado en el historial: la fecha del último cambio, quién lo hizo y la cantidad total de cambios registrados. El historial detallado no cabe en una fila por inspección, así que va como segunda hoja opcional solo si querés revisar caso a caso.

Vínculo con HubSpot:
- ID del contrato de arriendo en HubSpot y su tipo de objeto
- ID de propiedad de HubSpot
- Link directo al contrato: se arma solo si me pasás el ID de tu portal de HubSpot. Sin ese dato dejo la columna con el ID y una nota, y la completo en cuanto me lo digas.

## Notas honestas sobre los datos

El historial de cambios de estado guarda 479 registros para 200 check-outs: las inspecciones más antiguas (previas a que se activara el registro) no tienen historial completo. Para esos casos las fechas del flujo salen de las marcas de tiempo de cada etapa de la inspección, que sí están siempre. Lo dejo indicado en una columna para que se sepa qué filas tienen historial y cuáles no.

## Detalle técnico

- Consulta sobre `inspections` (filtro `inspection_type = 'check_out'`), con joins a `profiles` (inspector/ejecutivo), `contractors`, `inspection_external_references` (provider `hubspot`, tipo `lease_contract`) y agregación de `inspection_audit_log`.
- Generación con Python/openpyxl: encabezados en negrita, columnas ajustadas, formato de fecha `dd-mm-yyyy hh:mm`, panel congelado y autofiltro.
- Etiquetas de estado tomadas de la nomenclatura vigente (Sin asignar, Por coordinar, Coordinada, En espera de Hallazgos, En gestión de cotización, En gestión de aprobación, Aprobado, Finalizado).
- Salida en `/mnt/documents/checkouts-export-<fecha>.xlsx`, verificada antes de entregar.
