# Sacar varias fotos seguidas sin volver a abrir la cámara

## Qué pasa hoy

Al tocar "Añadir" → "Tomar foto", la app abre la cámara del celular. Esa cámara solo devuelve **una foto por vez**: después de cada foto el receptor vuelve a la sección, toca "Añadir", elige "Tomar foto" otra vez... Son 3 toques y una espera por cada foto. En secciones con 30–100 fotos eso es mucho tiempo. (La opción "Elegir de galería" sí permite varias, pero obliga a sacarlas antes con la cámara del teléfono.)

## Cambio propuesto: cámara continua dentro de la app

1. "Tomar foto" abre una cámara a pantalla completa dentro de la misma app.
2. El receptor toca el botón de disparo cuantas veces quiera; cada foto queda en una tira de miniaturas abajo, con contador ("12 fotos").
3. Puede borrar una miniatura si salió mal antes de terminar.
4. Toca "Listo" y todas se suben juntas a la sección, con la misma compresión y reintento que hoy.
5. Si el celular no permite usar la cámara (permiso denegado o navegador antiguo), se usa la cámara actual como respaldo, sin cambiar nada.
6. "Elegir de galería" y "Seleccionar archivo" quedan igual.

Además, en el menú de "Añadir" se ahorra un toque: "Tomar fotos" queda como botón principal grande.

## Detalle técnico

- Nuevo `src/components/photos/ContinuousCamera.tsx`: diálogo fullscreen con `getUserMedia({ video: { facingMode: 'environment' } })`, captura vía `<canvas>` → `toBlob('image/jpeg')` → `File`; tira de previews con eliminar; al cerrar detiene los tracks.
- `PhotoUploadSheet.tsx`: "Tomar fotos" abre `ContinuousCamera`; al "Listo" llama `onFiles` con los archivos (construyendo un `DataTransfer` para mantener la firma `FileList`). Fallback al `<input capture>` actual si `getUserMedia` falla.
- Sin cambios en subida, compresión ni base de datos.
- Verificación: probar en celular (Android y iPhone) sacar 10 fotos seguidas y confirmar que se suben todas a la sección.
