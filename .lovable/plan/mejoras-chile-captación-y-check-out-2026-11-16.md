# Mejoras Chile: captación y check-out

## 1. «Otros generales» no se ve para ejecutivas ni administradores (error nuevo)
- Primero confirmo la causa con una captación real afectada. Sospecho que la revisión solo muestra los espacios físicos y que «Otros generales» quedó afuera tras un cambio reciente.
- Corrijo la vista para que ejecutivas y administradores vean las respuestas, las fotos de medidores y el contacto del administrador, sin poder agregarle reparaciones.

## 2. Fotos de comercialización en tres momentos (Chile)
- Captación nueva o semiusada: sigue siendo obligatoria, con mínimo 10 fotos (como hoy).
- Check-in (el inquilino recibe el inmueble): sección opcional, sin mínimo.
- Revisión de trabajos del contratista: espacio opcional para fotos de comercialización.
- Las fotos de check-in y de trabajos quedan guardadas solo en HI. No van a Slack, a Hunter ni a Rent Manager, y no aparecen en el informe del propietario.

## 3. Ver las fotos de comercialización como administrador y ejecutiva
- Agrego una galería en el detalle de la inspección, agrupada por momento (captación, check-in, trabajos), para revisar la calidad y descargar las fotos en ZIP.
- El acceso se limita a los países de cada persona.

## 4. Fecha de recolección de llaves [CL]
- Ya está corregido y publicado.
- Verifico un envío real a HubSpot y, si hace falta, reenvío las captaciones chilenas recientes que no la recibieron.

## 5. Fecha de recepción de check-out en el pipeline Publicaciones
- Busco en HubSpot qué campo usa HI y en qué objeto queda (negocio o contrato).
- Te digo dónde cae y por qué no se ve en Publicaciones. Sin cambios en el sistema por ahora.

## 6. Enviar ejecutivo de operaciones y receptor de HI a HubSpot
- Busco en HubSpot los campos que ya existen para ambos.
- Si existen, HI los completa al asignar o cambiar a la persona y deja registro de cada envío. Si no, te digo cuáles habría que crear.

## 7. Corregir el número de bodega o estacionamiento
- Solo administradores pueden corregir la cantidad y los números de bodegas y estacionamientos desde el detalle de la inspección.
- Se guarda lo que llegó originalmente y la corrección se usa en todas las pantallas y en el informe.
- Caso RE0004803: queda con 1 estacionamiento, el número 26.

## Detalles técnicos
- Punto 1: se revisa el filtro de las secciones que no son espacios físicos en las pantallas de revisión de ejecutivas y administradores. La sección `closing_operational` se muestra solo para lectura.
- Punto 2: en Chile se genera `marketing_photos` opcional para check-in. En la revisión de trabajos se usa `photo_stage = 'marketing'` asociado a la OT. El mínimo de 10 fotos solo aplica a captación. El aviso de Slack y Rent Manager se mantienen solo para captación.
- Punto 3: lectura con permisos por país y la descarga ZIP que ya existe.
- Punto 6: la elección de campos se suma al selector de campos de HubSpot que ya existe, con tests.
- Punto 7: la corrección se guarda en `property_overrides_json`. Un test cubre la corrección de RE0004803.
