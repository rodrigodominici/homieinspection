## Diagnóstico

La inspección `RE0004350` (Carlos Pezoa Véliz, creada 2026-06-24) tiene:
- `inspector_id`: Mercedes Sánchez ✅
- `executive_id`: Emily Quintana ✅
- `status`: **`pending_assignment`** ❌ (no se transicionó a `assigned` al asignar)

La UI muestra "Sin asignar" porque `priorityBucket` (en `src/lib/inspector-operational.ts`) considera bucket 0 cuando **cualquiera** de estas tres condiciones se cumple:

```ts
const missingAssign =
  !insp.inspector_id || !insp.executive_id || insp.status === 'pending_assignment';
```

El check por `status` está de más: si ambos IDs existen, la inspección **no está sin asignar**, aunque el status legacy no se haya actualizado. Además, en ningún flujo de asignación (Admin detail, intake HubSpot cuando faltaba uno y luego se completa) hay una transición explícita `pending_assignment → assigned` cuando se completan ambos IDs.

## Plan

### 1. Corregir la regla de "Sin asignar" (fuente de la verdad = IDs)
`src/lib/inspector-operational.ts`, función `priorityBucket`:

```ts
const missingAssign = !insp.inspector_id || !insp.executive_id;
```

Se quita el `|| insp.status === 'pending_assignment'`. Los IDs son la verdad operativa; el status es derivado. Esto ya resuelve el caso visible sin tocar datos.

### 2. Auto-normalizar status al asignar (evitar recaídas)
En `src/pages/admin/AdminInspectionDetail.tsx` (handler de guardado de asignaciones): tras el `update` de `inspector_id`/`executive_id`, si el resultado deja **ambos IDs no nulos** y `status === 'pending_assignment'`, escribir `status = 'assigned'` en el mismo flujo. Igualmente en cualquier otro sitio que asigne (revisar `AdminInspections.tsx` bulk assign si existe — verifico en implementación).

### 3. Backfill de datos históricos
Migración one-shot:

```sql
UPDATE public.inspections
   SET status = 'assigned', updated_at = now()
 WHERE status = 'pending_assignment'
   AND inspector_id IS NOT NULL
   AND executive_id IS NOT NULL;
```

Sin efectos colaterales: no toca `started_at`, `completed_at`, ni fechas operativas. Solo alinea el enum al estado real.

### 4. Verificación
- Re-abrir la bandeja: la card de Carlos Pezoa Véliz debe pasar de "Sin asignar" al bucket que corresponda por fecha (Por coordinar / Programada).
- El KPI "Sin asignar" debe bajar de 1 → 0.
- `tsgo --noEmit` limpio.

### Fuera de alcance
- No se cambia la vista del ejecutivo (`ExecutiveReviewQueue`) porque su agrupación no depende de este bucket (sí depende del status; con el backfill queda coherente).
- No se toca el intake de HubSpot ni la lógica de creación (mantiene `pending_assignment` cuando falta alguno, que es correcto).
- No se renombran enums ni campos.
