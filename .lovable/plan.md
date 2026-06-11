
# Plan: cerrar el ciclo post-publicación con claridad

## Problema

Hoy `inspection.status` se queda en `published` y el ciclo real (propietario revisa → da feedback → ejecutivo ajusta → propietario acepta) vive escondido en `owner_feedback_status`. Resultado:

- El dashboard y la lista muestran "Publicada" tanto si el propietario aún no abrió el link, como si pidió cambios, como si ya aceptó.
- El ejecutivo no se entera de que tiene que volver a una inspección publicada salvo que entre al detalle.
- Las KPIs no reflejan el trabajo real pendiente después de publicar.

## Decisión

**No mover datos en la base.** Mantenemos `inspection.status` y `owner_feedback_status` como están (son dimensiones distintas: "el reporte está publicado" y "el propietario respondió"). En su lugar derivamos un **estado combinado** en frontend y lo usamos consistentemente en badges, filtros, KPIs y orden.

Esto evita migración de enum, no rompe el RPC `submit_owner_feedback` ni `executive_force_close_owner_feedback`, y es reversible.

## Estados combinados (nuevos, solo UI)

Reemplazan al badge "Publicada / Aprobada" en listas y dashboard:

| Combinado | Condición | Tono | Significado |
|---|---|---|---|
| Publicada · esperando propietario | `status=published` + `owner_feedback_status` en (`none`, null) | published (azul) | Link enviado, sin respuesta |
| Propietario pidió cambios | `status=published` + `owner_feedback_status='pending_executive_review'` | needs-changes (ámbar) | **Acción del ejecutivo** |
| Aceptada por propietario | `status='approved'` + `owner_feedback_status='accepted'` | approved (verde) | Cierre real del ciclo |
| Aprobada (cierre manual) | `status='approved'` sin loop de propietario | approved (verde tenue) | Ejecutivo cerró manualmente sin feedback |

Los estados anteriores (`pending_assignment` → `assigned` → `in_progress` → `submitted` → `in_review`) quedan igual.

## Cambios concretos

### 1. Nueva función derivadora
`src/lib/inspection-combined-status.ts` (nuevo) — `getCombinedInspectionStatus(inspection)` devuelve `{ key, label, tone, requiresExecutiveAction }`. Único lugar donde se cruzan ambos campos.

### 2. StatusBadge / registry
Extender `src/shared/ui/status-registry.ts` con las 4 claves combinadas y un helper `getCombinedStatus()`. `StatusBadge` acepta `inspection` opcional para resolver automáticamente.

### 3. KPIs (`src/lib/inspection-buckets.ts`)
Reemplazar `published` por dos contadores y agregar uno nuevo:

- **Esperando propietario** — published sin feedback
- **Requiere tu revisión** — published + pending_executive_review (destacado)
- **Aceptadas** — approved + accepted

Aplica a `AdminDashboard`, `ExecutiveReviewQueue` y `AdminInspections`.

### 4. Bucket de prioridad (`priorityBucket`)
Agregar bucket nuevo "Feedback de propietario" entre "En progreso" y "Completada" para que estas inspecciones suban en la lista del ejecutivo y no queden mezcladas con las cerradas.

### 5. Filtros de queue
En `ExecutiveReviewQueue` y `AdminInspections` agregar opción "Feedback del propietario" en el filtro de estado, que mapea a la condición combinada.

### 6. Dashboard del ejecutivo
Card destacada arriba: "N inspecciones con feedback de propietario pendiente" con CTA directo al filtro.

### 7. Detalle (ya existente)
`OwnerFeedbackPanel` ya muestra el panel. Solo asegurar que el badge del header (`ReviewHeaderBar`) use `getCombinedInspectionStatus` en vez del status crudo.

## Diagrama del flujo unificado (vista de usuario)

```text
Sin asignar → Asignada → En progreso → Lista para revisión → En revisión →
   → Publicada · esperando propietario
        ├─ (propietario acepta todo)        → Aceptada por propietario [FIN]
        ├─ (propietario pide cambios)       → Propietario pidió cambios
        │     → ejecutivo ajusta y republica → Publicada · esperando propietario (loop)
        └─ (ejecutivo cierra manualmente)   → Aprobada (cierre manual)    [FIN]
```

## Fuera de alcance

- Migración del enum `inspection_status` (no se toca DB).
- Cambios en RPCs (`submit_owner_feedback`, `executive_force_close_owner_feedback`) — su lógica ya deja los campos correctos.
- Notificaciones al ejecutivo cuando llega feedback (se puede hacer en una iteración posterior; este plan solo cierra el gap visual).

## Detalles técnicos

Archivos a tocar (solo frontend):

- `src/lib/inspection-combined-status.ts` (nuevo)
- `src/shared/ui/status-registry.ts`
- `src/shared/ui/StatusBadge.tsx`
- `src/lib/inspection-buckets.ts`
- `src/lib/inspector-operational.ts` (extender `priorityBucket`)
- `src/pages/admin/AdminDashboard.tsx`, `AdminInspections.tsx`
- `src/pages/executive/ExecutiveReviewQueue.tsx`
- `src/pages/executive/review-detail/ReviewHeaderBar.tsx`
- Lugares que renderizan `StatusBadge` con `inspection.status` en listas (auditar con `rg`)
