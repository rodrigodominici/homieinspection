## Objetivo

Eliminar la lógica de `external_user_mappings`. La asignación de inspector/ejecutivo se hará SIEMPRE por match directo entre el email del JSON y `profiles.email` (con `role = slot`). Si el email no viene, queda sin asignar.

## Cambios

### 1. Edge function `hubspot-inspection-intake`

Simplificar `resolveAssignment` (líneas 70-155):
- Eliminar Paso 1 (`external_user_mappings`).
- Quitar el tipo de outcome `'mapping'` de `SlotResolution.resolved_via`.
- Conservar Paso 2 (`profiles` por email + `role = slot`, `is_active = true`, case-insensitive).
- Resultado:
  - `email` nulo/vacío → `resolved_via: 'absent'`, `id: null`.
  - hit en `profiles` → `resolved_via: 'profile'`, `id: profile.id`.
  - miss → `resolved_via: 'unresolved'`, warning.
- Mantener el bloque `__assignment__.steps` para trazabilidad (solo con un step `profiles_fallback`, o renombrado a `profiles_lookup`).

### 2. Admin UI — `src/pages/admin/AdminUsers.tsx`

- Quitar los tabs **HubSpot Links** y **Sin Vincular** y todo su contenido (TabsContent, tabla, diálogos crear/editar/vincular/desvincular mapping).
- Eliminar estado y handlers asociados: `mappings`, `linkedMappings`, `unresolvedMappings`, `linkingMapping`, `editingMapping`, `handleCreateMapping`, `handleLinkProfile`, `handleEditMapping*`, `handleUnlink`, interfaz `ExternalMapping`.
- Quitar el `select` a `external_user_mappings` del fetch inicial.
- Quedarán dos tabs: **Pendientes** y **Usuarios Internos**.

### 3. Admin UI — `src/pages/admin/AdminIntegrationHubSpot.tsx`

- Actualizar el copy de `FIELD_MAPPING` para `inspector_email` / `executive_email`: reemplazar la mención a `external_user_mappings` por la nueva regla: "match directo contra `profiles.email` con `role = inspector|executive` (case-insensitive). Si no hay match o el email no viene, la inspección queda en `pending_assignment` para asignación manual".

### 4. Migración SQL — drop de la tabla

Nueva migración: `DROP TABLE public.external_user_mappings CASCADE;` (irreversible). Esto también limpia policies, grants e índices asociados.

### 5. Tipos generados

`src/integrations/supabase/types.ts` se regenera automáticamente tras la migración; sin acción manual.

### 6. Documentación

Actualizar `docs/PRODUCT_LOGIC.md` y la memoria `mem://tech/identity-resolution-mapping`: documentar la nueva regla "email-only" y marcar `external_user_mappings` como eliminada.

## Implicaciones operativas (recordatorio)

- Los 2 mappings con email desalineado (`ejecutivo@hubspot.ocm`, `tomas.alvarez@homierent.com`) dejarán de resolver. Las próximas inspecciones con esos emails entrarán en `pending_assignment` hasta que un admin las asigne manualmente o se corrija el `profiles.email` correspondiente.
- Regla operativa nueva: **el email en HubSpot debe ser idéntico al `profiles.email` en Homie**.

## Fuera de alcance

- UI de asignación manual desde Admin (ya existe).
- Backfill de inspecciones existentes que estén `pending_assignment` por mappings rotos.
