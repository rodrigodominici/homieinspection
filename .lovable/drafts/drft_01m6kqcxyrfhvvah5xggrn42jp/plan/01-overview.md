# Respuestas y plan para probar en producción

## Lo que encontré
**Avisos que salen hoy en producción**
- **Crear / asignar:** no sale ningún aviso por Slack, correo ni WhatsApp. HubSpot solo se actualiza si la inspección tiene una referencia de HubSpot.
- **Cuando el receptor entrega:** aviso por Slack al ejecutivo. En captaciones, también sale el aviso de fotos de comercialización a #captaciones-hi, con enlace público de descarga.
- **Respuesta del propietario en el informe:** aviso por Slack al ejecutivo.
- **Publicar el informe:** en check-in, correo al inquilino con el PDF. En captación no sale correo.
- **Finalizar:** HubSpot (check-in completo) solo para check-in con referencia de HubSpot.
- **WhatsApp:** es solo un botón que abre un mensaje prellenado; nunca envía nada automáticamente.

Hoy **no se pueden apagar** por inspección.

**¿Rent Manager sincroniza con HubSpot?** No. La sincronización busca solo referencias de HubSpot; una captación de Rent Manager solo tiene la de Rent Manager, así que el intento queda registrado como omitido y no escribe en HubSpot.

**Borrado actual:** el botón de admin borra fotos, informes, referencias, el evento de entrada y los registros de Slack y HubSpot, pero **deja** la bandeja de salida de Rent Manager, el historial de disponibilidad y el PDF del check-in. Además no es todo-o-nada: si falla a mitad, deja restos.

**Métricas:** no existe una marca de "prueba", así que las inspecciones de prueba **sí aparecen** en tableros, contadores y listados hasta que se borran.
