# Creación de inspecciones on-demand (admin)

Reemplazar el flujo obsoleto de "pegar JSON" por un formulario guiado que trae los datos del inmueble desde la API de Homie y registra el ID de objeto de HubSpot para que el sync funcione igual que en una inspección creada por el workflow.

## Flujo del nuevo formulario

```text
Paso 1  Tipo de inspección (Check-out / Captación)
        + ID de inmueble (ej. RE0003927)  →  [Buscar]
           ↓ trae desde api.homierent.com
Paso 2  Datos del inmueble (precargados, todos editables)
        dirección, comuna, ciudad, tipo, dormitorios, baños,
        depto, estacionamiento, bodega
Paso 3  Datos de HubSpot
        ID de objeto (Contrato de Locación si es check-out /
        Deal si es captación)  → habilita el sync
Paso 4  Fechas y personas
        recepción programada, fin de contrato real, recolección de
        llaves, inquilino (nombre + WhatsApp), garantía
Paso 5  Asignación: receptor (inspector) + ejecutivo
           ↓
        [Crear inspección]  → misma RPC que usa el intake de HubSpot
                             + referencia externa activa registrada
```

## Búsqueda del inmueble

- Nueva función de backend `homie-realty-lookup` que recibe el ID de referencia y consulta
  `https://api.homierent.com/real-estate/realties/reference-id/{id}`
  con las cabeceras `authorization: Bearer …` y `business-unit: HOMIERENT_CHILE`.
  El token se guarda como secreto del proyecto (nunca en el frontend).
- Verificado contra RE0003927: la API devuelve calle, número exterior/interior, piso, comuna,
  ciudad, región, tipo (`APARTMENT`) y atributos `BEDROOMS`, `FULL_BATHROOMS`,
  `HAS_PARKING_SPACE`, `PARKING_NUMBER`, `HAS_WAREHOUSE`, `WAREHOUSE_NUMBER`.
- Mapeo a los campos que ya consume el generador:
  - `APARTMENT` → departamento, `HOUSE` → casa, sin dormitorios → estudio.
  - dirección armada como `calle extNumber` + `D intNumber` cuando corresponde.
  - `property_name` = título/dirección; `comuna` = neighborhood; `unit_number` = intNumber.
- Si la API no responde o falta un dato, el formulario avisa y deja continuar con carga manual;
  todos los campos quedan editables en cualquier caso.

## Creación y sync

- Se reutiliza el servicio actual de creación (evento de origen + RPC transaccional),
  así la inspección nace con las mismas secciones y campos que las automáticas.
- El evento de origen queda marcado como creación manual, con el ID de objeto de HubSpot
  guardado para deduplicación futura.
- Tras crear, se inserta la referencia externa activa con el mismo criterio que el intake:
  check-out → tipo `lease_contract` (`2-47492934`), captación → `deal` (`0-3`);
  cualquier referencia activa previa del mismo objeto en otra inspección se desactiva.
  Con eso el botón de sincronizar con HubSpot funciona desde el detalle de la inspección.
- Estado inicial: `assigned` cuando hay receptor y ejecutivo (igual que hoy).

## Detalle técnico

- `supabase/functions/homie-realty-lookup/index.ts`: valida el ID, llama la API, normaliza
  la respuesta a la forma de `PropertyPayload` y devuelve también el crudo para depuración.
  Secreto nuevo: `HOMIE_API_TOKEN` (+ `HOMIE_BUSINESS_UNIT` con valor por defecto
  `HOMIERENT_CHILE` para soportar otros mercados más adelante).
- `src/pages/admin/AdminInspections.tsx`: la pestaña "create" pasa a renderizar un
  componente nuevo `src/pages/admin/create-inspection/CreateInspectionForm.tsx`;
  se elimina el textarea de JSON, los payloads de ejemplo y `handleGenerate`.
- `src/lib/homie-realty.ts`: cliente + mapeo de la respuesta de la API a `PropertyPayload`.
- `src/lib/inspection-service.ts`: acepta el ID de objeto externo y registra la referencia
  externa después de la RPC (misma lógica de desactivación que el intake).
- Validaciones antes de habilitar el botón: tipo de inspección, ID de inmueble, dirección,
  tipo de propiedad, dormitorios/baños, ID de objeto de HubSpot, receptor y ejecutivo.
- Sin cambios de esquema en la base de datos.
