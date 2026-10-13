# Captaciones MX: enviar "Fecha de recolección de llaves" a "Fecha de visita técnica" en HubSpot

Todo este cambio aplica **solo a captaciones de México**. Chile queda exactamente como está.

## Qué encontré
- Campo de destino en México: `fecha_de_visita_tecnica`, en el negocio de HubSpot.
- **Hay un error que frena el envío:** al crearse desde HubSpot, las captaciones de México quedan vinculadas como si fueran un contrato de arriendo y no como un negocio. Cuando el receptor guarda la fecha, la app busca el vínculo con el negocio, no lo encuentra y no envía nada. Es lo que pasó con la captación del 9/10 (negocio 63732298614). Hoy hay 12 captaciones de México en esta situación.
- La parte de "cada vez que cambia" ya está: la app envía a HubSpot cada vez que se guarda la fecha, tanto desde el celular del receptor como desde el panel de admin. Solo hace falta que el vínculo esté bien.

## Qué haremos
1. **Las nuevas captaciones de México** que lleguen desde HubSpot quedarán vinculadas al negocio.
2. **Corregir las 12 captaciones de México que ya existen** para que queden vinculadas a su negocio.
3. **Enviar la fecha de recolección de llaves de México** a `fecha_de_visita_tecnica`, cada vez que se guarde o cambie.
4. **Reenviar las fechas que ya están cargadas**, empezando por la captación del 9/10, y confirmar en el registro de envíos que HubSpot las aceptó.

## Aviso (no se toca)
- Las captaciones de Chile tienen el mismo problema de vínculo (29 hoy), así que su fecha de recolección tampoco llega a HubSpot. Si quieres, lo vemos aparte.

## Detalles técnicos
- `hubspot-inspection-intake`: cuando la inspección es una captación y el país es MX, el vínculo se guarda como `deal` (0-3). Chile y check-out siguen igual que hoy.
- Datos: en las referencias activas de las captaciones de México, `lease_contract` pasa a `deal`, con `external_object_type_id = '0-3'`.
- `hubspot-update-inspection`: la acción `key_collection_date` de una captación de México envía `fecha_de_visita_tecnica`. Lo demás no cambia. `retry-hubspot-sync` hereda el cambio.
- Al final se despliegan las funciones y se reenvían las fechas.
