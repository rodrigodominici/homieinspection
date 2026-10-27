# Fotos de comercialización obligatorias en captación (CL y MX)

## Qué verá el receptor
- Una nueva sección **"Fotos de comercialización"** al final de la captación, antes de la firma.
- Una guía de recomendaciones arriba de la carga de fotos:
  - Celular en horizontal, a la altura del pecho, sin zoom.
  - Luz natural: abrir cortinas y encender todas las luces; evitar contraluz.
  - Ambientes ordenados: sin objetos personales, camas hechas, tapas de inodoro abajo.
  - Tomar desde una esquina para mostrar el ambiente completo.
  - Orden sugerido: fachada/acceso, living, comedor, cocina, cada dormitorio, cada baño, terraza/vista, áreas comunes, estacionamiento/bodega.
  - Fotos nítidas: limpiar el lente y no moverse al disparar.
- Contador "X de 10 fotos". La sección no se puede completar ni la captación enviar con menos de **10 fotos**.
- Usa la misma cámara de disparos múltiples y funciona sin conexión, como las demás fotos.

## Dónde quedan las fotos
- Se guardan aparte de las fotos de inspección, marcadas como "comercialización", con un orden y una carpeta identificables por inmueble, listas para que otra aplicación las consuma más adelante.
- No se envían a HubSpot ni a portales y no aparecen en el informe al propietario (por ahora no se hace nada más con ellas).

## Captaciones existentes
- Se agrega la sección a las captaciones de ambos países que todavía no fueron enviadas. Las ya enviadas no cambian.

## Detalles técnicos
- `inspection-generator.ts`: nueva sección `marketing_photos` (type `photo`) solo para `inspection_type = 'captacion'`, ubicada antes de `tenant_signature`, con un campo `photo_upload` `marketing_photos` requerido y `min_photos: 10`.
- Fotos guardadas en `inspection_photos` con `photo_stage = 'marketing'`, `visible_to_owner = false`, ruta `marketing/<property_id>/<inspection_id>/...` en el bucket actual.
- Regla de completitud de sección y gate global de fotos: exigir ≥ 10 fotos en esa sección (offline queue incluida para el conteo pendiente).
- Componente de recomendaciones dentro de la sección (texto estático).
- Excluir `photo_stage = 'marketing'` del informe público/PDF.
- Backfill por SQL: insertar la sección y su campo en captaciones con estado distinto de enviado/finalizado.
- Test: sección con 9 fotos no se completa; con 10 sí; check-in/check-out no reciben la sección.
