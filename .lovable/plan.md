## Objetivo
Alinear el comportamiento de los dos grupos prioritarios en la cola ejecutiva para que siempre se muestren, mostrando un `0` en el contador cuando no tengan inspecciones.

## Cambios

### `src/pages/executive/ExecutiveReviewQueue.tsx`

1. **Feedback del propietario**: eliminar la condición `grouped.owner_feedback.length > 0 &&` para que el grupo se renderice siempre. El `GroupHeader` ya recibe `total={grouped.owner_feedback.length}`, que será `0` cuando corresponda.

2. **Requieren tu acción**: simplificar el bloque para que siempre renderice el `GroupHeader` y el `BucketSection` directamente, eliminando el mensaje de estado vacío (`<p>No hay inspecciones esperando tu acción.</p>`). El `BucketSection` manejará naturalmente una lista vacía.

## Resultado esperado
Ambos grupos son visibles permanentemente. Si no tienen inspecciones, el header muestra `· 0` y la sección de tarjetas aparece vacía. Los grupos `Seguimiento` y `Pre-inspección` mantienen su comportamiento colapsable actual (solo se muestran si tienen contenido).