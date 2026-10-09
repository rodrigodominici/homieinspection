# Captación MX: enviar la fecha de recolección de llaves a "Fecha de visita técnica" en HubSpot

## Qué encontré
- La captación (México) tiene cargada la fecha de recolección de llaves: 9/10/2026.
- No hay ningún intento de envío a HubSpot registrado para esta inspección. Ni exitoso ni con error: la app nunca intentó mandarla.
- Además, aunque se hubiera enviado, hoy iría al campo "Fecha de recolección de llaves" (el de Chile), no a "Fecha de visita técnica".

## Qué haremos
1. Revisar por qué guardar la fecha no disparó el envío en esta pantalla de admin. Si el guardado desde admin no llama al envío, lo agregamos (igual que en la vista del inspector).
2. Para captaciones de México, enviar la fecha al campo "Fecha de visita técnica" del negocio. Chile sigue igual.
3. Antes de escribir el cambio, leer en HubSpot el nombre interno real del campo "Fecha de visita técnica". No lo vamos a adivinar.
4. Reenviar la fecha de esta inspección (9/10) y confirmar que aparece en el negocio 63732298614.
5. Revisar las otras captaciones MX con fecha cargada y reenviarlas también.

## Detalles técnicos
- `hubspot-update-inspection`: el nombre de la propiedad para `key_collection_date` pasa a depender del país (MX → la propiedad de visita técnica; CL → `fecha_de_recoleccion_de_llaves`).
- Revisar la llamada a `syncKeyCollectionDate` (src/lib/hubspot-sync.ts) en AdminInspectionDetail al guardar las fechas.
- Reintentos: retry-hubspot-sync usa la misma función, así que hereda el cambio.
