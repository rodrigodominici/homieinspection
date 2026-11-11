# Simulador de avance de inspección (solo pruebas Rent Manager)

## Qué se ve
En el detalle de inspección del admin (`/admin/inspections/:id`), un panel **"Simular avance (solo pruebas)"**. Solo aparece si la inspección es de prueba, viene de Rent Manager y el usuario es admin. Tiene 7 botones y un botón **"Correr pasos 1 a 3 seguidos"**, con unos 20 segundos entre paso y paso y el progreso a la vista.

| Botón | Qué cambia (lo mismo que haría el usuario real) | Evento que sale |
|---|---|---|
| 1. Asignar | inspector y ejecutivo (por defecto, vos), estado assigned | inspection.created (status assigned) |
| 2. Programar llaves | fecha de llaves = hoy | inspection.keys_collection_scheduled |
| 3. Visita con fotos | sube 3 imágenes de prueba a la sección de fotos de comercialización, fecha de visita = hoy, disponibilidad inmediata o en 5 días | inspection.commercial_photos_ready |
| 4. Cambiar disponibilidad | fecha elegida | inspection.availability_updated |
| 5. Enviar inspección | envío con fecha de recepción = hoy | inspection.submitted |
| 6. Publicar reporte | publicable sí/no | inspection.report_published |
| 7. Fotos finales | 3 imágenes nuevas de fotos finales | inspection.final_photos_ready |

## Seguridad (validada en el servidor, no solo escondiendo botones)
- Una función nueva del servidor, `rm_simulate_step(inspection_id, step, params)`, que primero comprueba:
  - que quien la llama tenga rol admin (`has_role`), si no, la rechaza;
  - que la inspección tenga `is_test = true` y una referencia activa de Rent Manager; si no, la rechaza.
- No inserta nada en la cola directamente: solo cambia los mismos campos que hoy cambian las pantallas reales. Así los disparadores que ya existen hacen la encolada con el mismo formato, por el mismo despacho y con los mismos reintentos. No se tocan formato de eventos, despacho, reintentos ni HubSpot (las inspecciones de prueba ya se saltan HubSpot).
- Cada paso deja una fila en el historial de la inspección: "Simulado por <nombre del admin>: <paso>".
- Las fotos de prueba se suben con la sesión del admin al mismo bucket privado `inspection-photos`, en la misma estructura de ruta que las reales. Después, la función registra las filas de foto y completa la sección.

## Fotos: si se ven desde afuera
El despacho firma cada foto al enviarla. Los enlaces se pueden abrir desde afuera de HI sin sesión, pero **vencen a los 7 días**. El bucket sigue siendo privado.

## Tests (vitest, en la carpeta existente de tests de Rent Manager)
1. Se rechaza una inspección real (is_test = false).
2. Se rechaza a un usuario que no es admin.
3. Para cada uno de los 7 pasos, el cuerpo encolado tiene exactamente las mismas claves y tipos que el de un evento real, comparado con el armado actual de la cola.
Además hay una prueba de punta a punta en el preview: correr los pasos 1 a 7 sobre una captación de prueba y revisar la cola.

## Fuera de alcance
- No publico a producción hasta que lo confirmes.
- No se cambia el despacho ni el destino configurado.

## Detalles técnicos
- Migración: una función `SECURITY DEFINER` con `search_path` fijo, `REVOKE` de anon y `GRANT EXECUTE` a authenticated. Hace las validaciones antes de cualquier escritura y reutiliza las funciones de visita y disponibilidad que ya existen (`rm_save_visit_availability`, `rm_move_availability`) cuando corresponde.
- Frontend: `src/components/admin/RentManagerSimulatorPanel.tsx`, montado en `AdminInspectionDetail.tsx`; las imágenes de prueba se generan con un canvas en JPEG, sin agregar archivos al repo.
