## Diagnóstico

Los ejecutivos aprueban la inspección desde Cotización → llegan al paso 4 "Publicación" con toda la lista de verificación en verde, pero **no aparece el botón "Publicar reporte"**.

### Causa raíz

El botón está condicionado en dos lugares (`PublishView.tsx:77` y `ReviewHeaderBar.tsx:135`) a:

```ts
inspection.current_stage === 'share' && inspection.status === 'approved'
```

La acción `approveInspection` (`src/modules/review/api/inspection-actions.service.ts`) solo actualiza `status = 'approved'` pero **nunca avanza `current_stage`** de `'budget'` a `'share'`. Resultado: la inspección queda `status='approved'` + `current_stage='budget'` y el botón nunca se renderiza.

Confirmado en la BD para la inspección visible en pantalla (`df64ca15…` — Nicasio Retamales 054 D 1103):

| status   | current_stage | published_at |
|----------|---------------|--------------|
| approved | budget        | null         |

Otras aprobadas quedaron atascadas en el mismo estado. Las que sí se publicaron en el pasado (`f32a2e14`, `64b5ad0f`) tienen `current_stage='share'` — probablemente se avanzaron manualmente vía el flujo admin (`AdminInspectionDetail` sí actualiza `current_stage`).

Las políticas RLS de `inspection_report_versions` e `inspections` son correctas — no bloquean al ejecutivo asignado. Es puramente un bug de UI/estado.

## Cambios propuestos

### 1. Corregir la acción de aprobar (código)

`src/modules/review/api/inspection-actions.service.ts` — en `approveInspection`, incluir `current_stage: 'share'` en el UPDATE:

```ts
.update({
  status: 'approved',
  current_stage: 'share',
  approved_at: now,
  approved_by: profileId,
})
```

Esto asegura que toda inspección recién aprobada pase automáticamente a la etapa "share" y muestre el botón "Publicar reporte".

### 2. Backfill de inspecciones ya aprobadas (migración)

Migración one-shot para desatascar las inspecciones que quedaron aprobadas sin poder publicarse:

```sql
UPDATE public.inspections
SET current_stage = 'share'
WHERE status = 'approved'
  AND current_stage <> 'share'
  AND published_at IS NULL;
```

## Verificación

- Abrir la inspección `df64ca15` (Nicasio Retamales 054 D 1103) como el ejecutivo asignado (David Chávez) → debe aparecer el botón "Publicar reporte" en el paso 4.
- Aprobar una inspección nueva desde Cotización → al llegar a Publicación el botón debe estar disponible.
- Verificar en BD: `SELECT status, current_stage FROM inspections WHERE id = '…'` → `approved / share`.

## Nota

Este cambio NO altera lógica de reparaciones ni RLS ni notificaciones Slack. Solo asegura que el avance de etapa `budget → share` ocurra automáticamente al aprobar, tal como ya ocurre en el flujo admin.