## Propuesta antes de publicar
1. **Marca "inspección de prueba":** Rent Manager la envía en el cuerpo de creación (`es_prueba: true`) y un admin también puede marcarla. Se ve una etiqueta "PRUEBA" en todas las pantallas.
2. **Avisos apagados en pruebas:** Slack (entrega, propietario, fotos de comercialización), el correo del informe y HubSpot se omiten y quedan registrados como "omitido por prueba". Los avisos a Rent Manager **sí** salen, porque son lo que querés probar.
3. **Fuera de métricas:** tableros, contadores y reportes las excluyen; el listado admin permite verlas con un filtro.
4. **Borrado completo en un solo paso:** acción de admin del lado del servidor, todo o nada, que elimina la inspección y sus fotos (incluidas las de comercialización), el PDF, la bandeja de salida y el historial de Rent Manager, el evento de entrada, las referencias, los registros de avisos y los enlaces del informe (el enlace del propietario deja de funcionar). Para las de prueba, también un botón "Borrar todas las de prueba".

Sin esto, cada prueba en producción manda avisos reales por Slack y suma a las métricas.

## Detalles técnicos
- Columna `inspections.is_test` (false por defecto); el intake la toma del payload solo con `source: rent_manager`.
- Guardas `is_test` en `notify-executive-slack`, `notify-marketing-photos`, `send-checkin-report-email`, `hubspot-update-inspection`.
- Filtro `is_test = false` en dashboards y métricas.
- RPC `admin_purge_inspection(id)` (solo admin, transaccional) + función de servidor que borra objetos de Storage en `inspection-photos` y en el bucket de PDF; reemplaza el borrado actual desde el navegador.
- Pruebas: aviso omitido con `is_test`, exclusión de métricas, y que el borrado no deje filas en ninguna tabla relacionada.
