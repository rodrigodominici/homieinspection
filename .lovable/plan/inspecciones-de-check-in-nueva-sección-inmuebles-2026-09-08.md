# Inspecciones de check-in + nueva sección Inmuebles

## 1. ¿El modelo está listo para recibir check-in?

Sí, la base de datos lo acepta hoy sin cambios: la columna `inspection_type` de `inspections` es texto libre (verificado: no existe restricción de valores permitidos; hoy hay 191 check-out y 21 captaciones) y la creación de inspecciones (manual y por integración) copia el tipo tal como llega, sin lógica condicionada al tipo. El formulario de inspección, las secciones, fotos, firma y el informe publicado son agnósticos del tipo.

Lo que NO está listo es la capa de interpretación: hoy todo el producto asume solo dos tipos y decide con un "¿es captación? si no, es check-out". Eso hace que un check-in se muestre y trate como check-out. Hay que ajustar:

- Etiquetas y textos: un check-in aparecería como "Check-out", con "Fecha de término de contrato" y contacto "Inquilino".
- Colores y filtros de calendario y agenda (Admin y Ejecutivo): hoy solo hay dos estilos y un filtro de dos valores.
- Formulario de creación manual: el selector de tipo solo ofrece dos opciones.
- Integración con HubSpot: el vínculo se elige con "si es captación → negocio, si no → contrato de arriendo"; hay que declarar el check-in explícitamente como contrato de arriendo.
- Lista del rol Comercial: filtra explícitamente a check-out y captación (los check-in quedarían invisibles; se mantiene así salvo que se indique lo contrario).
- Vista del panel de carga por ejecutivo: filtro binario por tipo.

## 2. Cambios para check-in

### Alcance funcional acordado
- El check-in deja registro del estado inicial de entrega al inquilino.
- No requiere presupuesto ni aprobación del propietario: al terminar la revisión se publica un informe dirigido al inquilino (se reutiliza el informe público con audiencia "inquilino" que ya existe) y queda listo para envío automático.
- Llega desde HubSpot vinculado al Contrato de arriendo, igual que el check-out.

### Trabajo
1. Tipos y etiquetas (`src/lib/inspection-type-labels.ts`): pasar de "captación o check-out" a tres tipos con etiquetas propias. Para check-in: etiqueta "Check-in", fecha relevante "Fecha de inicio de contrato / entrega", contacto principal "Inquilino".
2. Chip de tipo (`InspectionTypeChip`) con un tercer color propio; estilos y filtro de calendario (`schedule-helpers`, `AdminSchedule`, `ExecutiveSchedule`) extendidos a tres tipos.
3. Creación manual (`CreateInspectionForm`): tercera opción "Check-in" y ayudas de texto por tipo.
4. Integración HubSpot (`hubspot-inspection-intake` y `inspection-service`): mapa explícito por tipo — captación → negocio (0-3), check-out y check-in → contrato de arriendo (2-47492934). Documentar `check_in` como valor aceptado en la pantalla de Integraciones.
5. Flujo sin cotización: para check-in, la etapa de presupuesto se muestra como no aplicable y la publicación del informe (audiencia inquilino) habilita finalizar sin exigir decisión de "quién repara" por reparaciones; se mantiene la trazabilidad de estados actual.
6. Panel de carga por ejecutivo y filtros de tipo del tablero: tres valores.

## 3. Nueva sección "Inmuebles" (Admin y Ejecutivo)

Punto de entrada por inmueble, no por inspección.

- Listado con buscador por ID de inmueble, nombre, dirección y comuna (reutiliza la búsqueda tokenizada sin acentos ya existente). Cada fila: inmueble, mercado, cantidad de inspecciones por tipo, fecha de la última inspección y estado actual.
- Detalle del inmueble:
  - Ficha con los datos del inmueble (dirección, tipo, dormitorios, baños, unidad, torre, estacionamiento, bodega) tomados de la inspección más reciente y, si se necesita refrescar, del lookup de inmuebles de Homie que ya existe.
  - Línea de tiempo: todas las inspecciones del inmueble ordenadas por fecha, con tipo, estado, ejecutivo, receptor, cantidad de fotos, hallazgos y montos.
  - Comparación lado a lado: elegir dos inspecciones (por ejemplo check-in vs check-out) y ver enfrentadas las secciones con su estado, observaciones y fotos, marcando las secciones donde hay diferencias.
- Enlaces directos a cada inspección y al informe publicado.

## Detalles técnicos

- Sin migraciones de esquema: el agrupamiento por inmueble se hace por `property_id` sobre `inspections` (+ `property_snapshot_json` / `property_overrides_json`). Se evalúa un índice sobre `property_id` si el listado lo requiere.
- Nuevos archivos previstos: `src/modules/properties/api/properties.service.ts` (agregación por inmueble), `src/pages/admin/AdminProperties.tsx`, `src/pages/admin/AdminPropertyDetail.tsx`, componentes `PropertyTimeline` y `PropertyComparison` reutilizables por el rol Ejecutivo, más rutas en `App.tsx` y entradas de menú en `AdminLayout` y `ExecutiveLayout`.
- Fotos comparadas usan la firma de URLs en lote ya existente, con carga por bloques.
- Reutilización de `getCombinedInspectionStatus`, `StatusBadge` e `InspectionTypeChip` para consistencia visual.
