## Problema

En `ExecutiveReviewQueue`, los KPIs **Esperando propietario**, **Feedback propietario** y **Aceptadas** aplican el filtro correctamente (los conteos son correctos y `ownerFeedbackFilter` cambia), pero los resultados caen dentro del grupo **"Seguimiento"**, que es un `CollapsibleGroup` cuyo `defaultOpen` sólo es `true` cuando hay ≤3 elementos. Con 7 inspecciones aceptadas o esperando propietario, el grupo queda colapsado y al usuario le parece que "no se puede visualizar".

Adicionalmente, el `defaultOpen` sólo se evalúa al montar el componente, así que aunque el usuario cambie el filtro después, el grupo no se re-abre.

## Cambio propuesto

Archivo único: `src/pages/executive/ExecutiveReviewQueue.tsx`.

1. **Forzar apertura de grupos colapsables cuando hay un filtro activo.**
   - Considerar "filtro activo" cualquiera de: `statusFilter !== 'all'`, `ownerFeedbackFilter !== 'all'`, `publishedFilter !== 'all'`, `inspectorFilter !== 'all'`, `marketFilter !== 'all'` o búsqueda con texto.
   - Pasar ese booleano como prop `forceOpen` a `CollapsibleGroup` para **Seguimiento** y **Pre-inspección**.

2. **`CollapsibleGroup`: respetar `forceOpen` sobre el estado local.**
   - Nueva prop opcional `forceOpen?: boolean`.
   - Render abierto si `forceOpen || open`.
   - El botón de toggle sigue funcionando cuando `forceOpen` es falso; cuando es verdadero, se muestra abierto y el chevron refleja el estado.

3. **Mejorar `defaultOpen` de Seguimiento.**
   - `defaultOpen={grouped.follow_up.length <= 3}` se mantiene para el caso sin filtros, pero al aplicar cualquier filtro `forceOpen` lo abrirá igualmente.

No se toca lógica de datos, ni buckets, ni KPIs — sólo presentación.

## Verificación

- Typecheck (`tsgo`) / build ya cubre regresión de tipos.
- Comprobación manual en preview: click en cada uno de los tres KPIs y confirmar que las filas aparecen sin necesidad de expandir manualmente.
