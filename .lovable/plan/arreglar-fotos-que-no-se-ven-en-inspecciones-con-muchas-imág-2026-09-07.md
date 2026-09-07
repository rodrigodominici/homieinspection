# Arreglar fotos que no se ven en inspecciones con muchas imágenes

## Qué pasa en esta inspección

Arturo Prat 4327 D 302 (Raquel Martínez) tiene **429 fotos** cargadas y todas están correctamente guardadas y asociadas a su sección (Cocina 134, Dormitorio 78, Living 61, Baño 2 44, Acceso 36, Terraza 33, Baño 1 32, Bodega 7, Estacionamiento 4). No falta ninguna foto en la base.

El problema es de **visualización**: al abrir la inspección la app pide los enlaces temporales de las 429 fotos (y además una versión miniatura de cada una), pero la memoria interna que guarda esos enlaces sólo admite 300. Al pasarse del límite, los enlaces más antiguos se descartan y esas fotos quedan en blanco. Con ~858 enlaces pedidos contra un tope de 300, en inspecciones grandes se cae la mayoría.

## Cambios

1. Ampliar el límite de enlaces guardados en memoria y contar por separado las miniaturas, de modo que una inspección completa (incluso de 500+ fotos) quepa sin descartar nada.
2. No descartar un enlace que se está usando en pantalla: la limpieza de memoria se hará sólo sobre enlaces vencidos o de inspecciones ya cerradas.
3. Si un enlace igual falla o queda vacío, mostrar la foto con un reintento automático en lugar de un recuadro vacío silencioso.
4. En el detalle admin, cargar las fotos por sección en bloques (igual que ya hace la vista de ejecutivo con "Ver más fotos"), para no pedir 429 enlaces de una vez.

## Detalle técnico

- `src/lib/photo-urls.ts`: subir `MAX_CACHE_SIZE` (p. ej. 1200), separar caché de originales y de thumbs, y cambiar la poda FIFO por poda de entradas expiradas primero; nunca podar paths incluidos en la petición actual.
- `src/pages/admin/AdminInspectionDetail.tsx`: paginar la grilla de fotos por sección (bloques de 24 con botón "Ver más"), pasando a `useSignedPhotoUrls` sólo las fotos visibles.
- Añadir reintento por imagen en el `onError` del `<img>` (invalidar caché de ese path y volver a firmar).
- Verificación: abrir esta inspección y confirmar que las 429 fotos se ven en todas las secciones, y revisar que no queden errores en consola.
