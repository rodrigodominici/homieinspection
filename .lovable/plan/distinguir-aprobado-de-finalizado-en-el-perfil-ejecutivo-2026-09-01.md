# Distinguir "Aprobado" de "Finalizado" en el perfil Ejecutivo

## Problema confirmado

El badge de estado del ejecutivo se calcula con `getCombinedInspectionStatus`, que trata `status = 'sent'` (finalizada) exactamente igual que `published`: si el propietario aceptó, devuelve "Aprobado"; si no, "En gestión de aprobación". Nunca devuelve "Finalizado". El registro de estados sí tiene la etiqueta "Finalizado" para `sent`, pero la cola del ejecutivo no la usa.

Además, en la cola todas caen en el mismo grupo "Seguimiento", y el filtro de estado muestra etiquetas viejas ("Entregada", "Publicada", "Aprobada") que no coinciden con los nombres actuales.

## Cambios

1. **Estado combinado**: agregar la clave `finalized` con etiqueta **"Finalizado"** cuando `status = 'sent'`, con prioridad sobre el ciclo de feedback del propietario (igual que hace hoy la derivación de etapas de admin). Así el badge del ejecutivo muestra "Aprobado" solo para aprobadas/aceptadas y "Finalizado" para las cerradas.

2. **Cola del ejecutivo**: separar el grupo "Seguimiento" en dos grupos colapsables:
   - **Seguimiento** — publicadas y aprobadas (aún abiertas).
   - **Finalizadas** — `status = 'sent'`.

3. **Filtro de estado**: alinear las etiquetas del selector con el vocabulario actual:
   - Asignada → Coordinada
   - En progreso → En espera de Hallazgos
   - Lista para revisión / En revisión → En gestión de cotización
   - Aprobada / Publicada → En gestión de aprobación
   - Entregada → Finalizada

## Detalles técnicos

- `src/lib/inspection-combined-status.ts`: nueva rama para `status === 'sent'` que retorna `{ key: 'finalized', label: 'Finalizado', tone: 'neutral' }` antes de la lógica de `published`; agregar `'finalized'` a `CombinedStatusKey`. Los helpers `isWaitingOwner` / `requiresExecutiveOwnerFollowUp` mantienen su comportamiento actual para no alterar KPIs ni buckets de admin.
- `src/pages/executive/ExecutiveReviewQueue.tsx`: agregar bucket `finalized` en `getExecutiveBucket` (primer chequeo: `status === 'sent'`), su entrada en `grouped`, orden por `updated_at` descendente, y su `CollapsibleGroup`. Ajustar las etiquetas de los `SelectItem` del filtro de estado (los valores internos no cambian).

Sin cambios de lógica de negocio, migraciones ni transiciones de estado.
