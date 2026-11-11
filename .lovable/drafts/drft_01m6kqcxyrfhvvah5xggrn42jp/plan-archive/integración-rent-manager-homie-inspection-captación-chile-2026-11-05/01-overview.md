# Integración Rent Manager ↔ Homie Inspection (captación Chile)

Se sigue el contrato `v1` al pie de la letra y se trabaja por partes. HubSpot sigue igual: lo nuevo solo actúa en inspecciones vinculadas a Rent Manager.

## Dónde se prueba
Este borrador tiene su **propia base de datos** y sus **propias funciones del servidor**: confirmé que responden dentro del borrador, separadas de producción. La tabla nueva, los avisos automáticos y el cambio en la entrada de HubSpot se aplican solo acá. Producción y la integración real con HubSpot no cambian hasta que aceptes el borrador. Desde el borrador tampoco se escribe en HubSpot ni en Slack.

## Ajuste respecto a lo que ya hicimos
Se borran las dos entradas separadas que había creado: la de creación y la de consulta de estado. El RM usa la entrada existente.

## Partes (se entregan en orden, con pruebas cada una)
1. **Entrada:** la entrada actual también acepta `source: "rent_manager"`, con su propia clave, sin consultar HubSpot y con la fecha tentativa como fecha agendada. La inspección queda «Sin asignar». El reintento y la recuperación dejan la inspección vinculada.
2. **Bandeja de salida:** cada cambio se encola **en el servidor, nunca desde el navegador**. Así no se pierde si se cierra la pestaña y también avisa cuando el cambio llega por otro camino. Los avisos se envían al RM en orden y con reintentos. Incluye la pantalla de admin «Integración Rent Manager».
3. **Pantallas nuevas:**
   - disponibilidad al completar las fotos;
   - «Mover fecha de disponibilidad», con historial;
   - «Inmueble no en condiciones»;
   - avisos de retiro de llaves y de envío.
4. **«Publicable»:** no se construye; el aviso de publicación va sin ese campo.
