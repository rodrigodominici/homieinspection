# Captaciones MX: enviar "Fecha de recolección de llaves" a "Fecha de visita técnica" en HubSpot

## Qué encontré
- Campo de destino en México: `fecha_de_visita_tecnica` (negocio de HubSpot).
- **Además hay un error que frena el envío en todas las captaciones** (Chile y México): al crearse desde HubSpot, la app las vincula como si fueran un contrato de arriendo y no como un negocio. Cuando el receptor guarda la fecha, la app busca el vínculo con el negocio, no lo encuentra y no envía nada. Es lo que pasó con la captación del 9/10 (negocio 63732298614).
  - Afectadas hoy: 12 captaciones de México y 29 de Chile.
- La parte de "cada vez que cambia" ya está: la app envía a HubSpot cada vez que se guarda la fecha, tanto desde el celular del receptor como desde el panel de admin. Solo hace falta que el vínculo esté bien.

## Qué haremos
1. **Arreglar la creación de captaciones** para que queden vinculadas al negocio correcto desde ahora.
2. **Corregir las 41 captaciones existentes** (CL y MX) para que queden vinculadas al negocio.
3. **México:** la fecha de recolección de llaves se envía a "Fecha de visita técnica" (`fecha_de_visita_tecnica`). **Chile** sigue enviándose a "Fecha de recolección de llaves", como hoy.
4. **Reenviar** la fecha de las captaciones que ya la tienen cargada, empezando por la del 9/10, y confirmar en el registro de envíos que HubSpot la aceptó.

## Detalles técnicos
- `hubspot-inspection-intake`: hoy decide el tipo de vínculo con `body.inspection_type`, pero ese dato llega dentro de `data.inspection_type`. Se pasa a leer el tipo ya normalizado, así las captaciones quedan como `deal` (0-3).
- Datos: se actualizan las referencias activas de las captaciones de `lease_contract` a `deal`, con `external_object_type_id = '0-3'`.
- `hubspot-update-inspection`: para `key_collection_date`, el nombre de la propiedad depende del país (MX → `fecha_de_visita_tecnica`; CL → `fecha_de_recoleccion_de_llaves`). `retry-hubspot-sync` reutiliza esta misma función.
- Se despliegan las dos funciones y se reintenta desde los registros de envíos.
