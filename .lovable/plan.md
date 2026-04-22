

## Plan: Editar mapping HubSpot existente

Cambios estrictamente en `src/pages/admin/AdminUsers.tsx`. Cero cambios en lógica de resolución, RPC, edge functions o BD.

### Cambios

**1. Estado nuevo** (junto a los otros mapping states, ~línea 56):
- `editingMapping: ExternalMapping | null`
- `editMapEmail: string`
- `editMapRoleHint: 'inspector' | 'executive'`
- `editMapIsActive: boolean`
- `editMapProfileId: string` (vacío = desvinculado)

**2. Handler `handleEditMappingOpen(m)`**: pre-popula los 4 estados desde la fila.

**3. Handler `handleEditMappingSave()`**:
- `UPDATE external_user_mappings SET hubspot_email, role_hint, is_active, profile_id WHERE id = editingMapping.id`
- `profile_id = editMapProfileId || null` (permite desvincular desde el mismo dialog).
- Toast de éxito/error, refrescar `mappings` en estado local, cerrar dialog.

**4. Botón "Editar" en la tabla "HubSpot Links"** (línea 356–360, celda de acciones):
- Insertar antes del botón `Unlink` un `<Button variant="ghost" size="icon" className="h-8 w-8">` con ícono `Pencil` (ya importado), `onClick={() => handleEditMappingOpen(m)}`.

**5. Dialog nuevo "Editar Mapping HubSpot"** (después del Link dialog, ~línea 495):
- `<Dialog open={!!editingMapping} onOpenChange={(o) => !o && setEditingMapping(null)}>`
- Campos:
  - **Email HubSpot**: `<Input>` controlado por `editMapEmail`.
  - **Rol sugerido**: `<Select>` con opciones `inspector` / `executive`, controlado por `editMapRoleHint`.
  - **Activo**: `<Switch>` (importar de `@/components/ui/switch`) controlado por `editMapIsActive`, con `<Label>` "Mapping activo".
  - **Vincular a usuario**: `<Select>` con `profiles.map(...)`, mismo patrón que Create dialog. Incluir un `SelectItem value="__none__">Sin vincular</SelectItem>` al tope para permitir desvincular; mapear `__none__` ↔ `''` al guardar.
- Botones: "Cancelar" (cierra) + "Guardar cambios" (llama `handleEditMappingSave`, deshabilitado mientras `saving`).

### Lo que NO se toca

- `external_user_mappings` columnas no editables (`id`, `provider`, `created_at`, `hubspot_user_id`, `updated_at`).
- Lógica de resolución en `hubspot-inspection-intake/index.ts`.
- Tab "Sin Vincular" (esa ya tiene su flujo de vincular).
- RLS / migraciones.

### Archivo tocado

- `src/pages/admin/AdminUsers.tsx` — 1 import (`Switch`), 5 estados, 2 handlers, 1 botón en tabla, 1 dialog nuevo.

