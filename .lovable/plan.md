

# Plan — Admin-created users + Admin Inspections list improvements

Scope strictly limited to: (A) admin-driven user creation/edit with new fields, (B) Inspections list sort label/options + Cards/Table toggle. No other admin/dashboard/detail rework.

---

## Part A — Admin-created users

### A1. Schema (migration)
Add 2 columns to `profiles`:
- `country_code text` — always stored with leading `+` (e.g. `+56`, `+52`)
- `phone text` — digits only, no spaces / hyphens / parentheses

`market` already exists; constrained at app level to `CL` / `MX`. No DB CHECK constraint added.

### A2. Canonical role values (confirmed)
The codebase consistently uses **lowercase string values**: `'admin'`, `'inspector'`, `'executive'` (plus `'pending'`, never assignable). Verified against:
- `UserRole` type in `src/lib/types.ts`
- `BUSINESS_ROLES` in `AdminUsers.tsx`
- `has_role()` SQL function (text comparison, lowercase)
- `external_user_mappings.role_hint` (`'inspector'` / `'executive'`)
- RLS policies (`has_role(auth.uid(), 'executive'::text)`)

The Create User role dropdown will use exactly: `admin` / `inspector` / `executive` — labels in UI: `Admin` / `Inspector` / `Executive`.

### A3. Edge Function `admin-create-user`
Required because the client SDK cannot create auth users with a chosen password.

Flow:
1. Validate caller JWT in code, fetch caller profile, check `role === 'admin'`. Reject 403 otherwise.
2. Validate body with Zod: `email`, `password` (min 8), `full_name`, `role` ∈ {admin, inspector, executive}, `market` ∈ {CL, MX}, `country_code` (regex `^\+\d{1,4}$`), `phone` (regex `^\d{6,15}$`), `is_active` (bool).
3. Use service-role client → `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, role } })`. The `handle_new_user` trigger seeds a `profiles` stub.
4. Update `profiles` row with `role`, `market`, `country_code`, `phone`, `is_active`, `approval_status='approved'`.
5. Return `{ id }` or structured error: `email_exists`, `weak_password`, `forbidden`, `validation`.

CORS handled, function deployed at default settings.

### A4. AdminUsers UI (`src/pages/admin/AdminUsers.tsx`)

**Create User dialog** (new "Crear Usuario" button in Usuarios Internos tab):
- Nombre completo (required)
- Email (required, unique)
- Contraseña inicial (password, min 8, with show/hide toggle)
- Rol (Select: Admin / Inspector / Executive — values lowercase)
- Mercado (Select: Chile=`CL` / México=`MX`)
- Código de país (Select: `+56 Chile` / `+52 México`, defaults to selected market)
- Teléfono (input; on change, strip everything that isn't a digit)
- Activo (Switch, default on)
- Submit → `supabase.functions.invoke('admin-create-user', …)` → toast + refetch + close.

**Edit User dialog** (extended):
- Nombre completo — editable
- **Email — visible, disabled (read-only)** with helper text `"Cambiar el email requiere actualización de auth y no está soportado en esta iteración."` (Refinement #2)
- Rol — editable
- Mercado — editable (CL/MX dropdown)
- Código de país — editable
- Teléfono — editable (digit-stripped on input)
- Activo — Switch
- Saves directly to `profiles` (no auth changes).

**Users table** (Usuarios Internos tab): add `Teléfono` column (renders `country_code phone`); display `Mercado` as `Chile` / `México` instead of raw code.

### A5. Auth flow alignment (`src/pages/Auth.tsx`)
Phrasing per Refinement #4:
> Admin-created users become the **primary supported path**. Self-signup is **removed from the UI**. The backend `signUp` capability in `AuthContext` and the `handle_new_user` trigger remain as a safety net for future flows or direct admin Cloud-panel creation.

Concretely:
- Remove the "¿Necesitas una cuenta? Crear una" toggle and the sign-up form branch.
- Remove `signUpComplete` state and post-signup screen from the UI.
- Keep `signUp()` exported from `AuthContext` (untouched).
- Keep the `handle_new_user` DB trigger unchanged.

### A6. Types & shared constants
- Update `Profile` in `src/lib/types.ts`: add `country_code: string | null`, `phone: string | null`.
- New `src/lib/markets.ts` exporting:
  - `MARKET_OPTIONS = [{value:'CL',label:'Chile'},{value:'MX',label:'México'}]`
  - `COUNTRY_CODE_OPTIONS = [{value:'+56',label:'+56 Chile'},{value:'+52',label:'+52 México'}]`
  - Helpers `marketLabel(code)`, `normalizePhone(raw)` (strips non-digits), `normalizeCountryCode(raw)` (ensures leading `+`).

---

## Part B — Admin Inspections list improvements

All edits in `src/pages/admin/AdminInspections.tsx`. No dashboard/detail logic touched.

### B1. Sort label rename
`priority` option label `"Prioridad operativa"` → **`"Más urgente primero (recomendado)"`**. Underlying logic unchanged.

### B2. Creation-date sort
Add to `SORT_OPTIONS`:
- `created_desc` → "Más recientes primero"
- `created_asc` → "Más antiguos primero"

Sort by `new Date(insp.created_at).getTime()` (already on the row, no extra fetch).

Final order:
1. Más urgente primero (recomendado)
2. Última actividad
3. Más recientes primero
4. Más antiguos primero
5. Término contrato ↑ / ↓
6. Recolección llaves ↑ / ↓

### B3. Cards / Table toggle
- `viewMode: 'cards' | 'table'` persisted in URL via `?view=`, default `cards`.
- Toggle (icon group: `LayoutGrid` / `Table2`) inside the controls Card.
- Both views consume the same `filteredInspections` — single source of truth.

### B4. Table columns
Using existing `Table` primitives:
| Propiedad (name + address) | ID | Estado (bucket badge) | Asignación (missing label or dash) | Inspector | Ejecutivo | Mercado | Tipo | Creada | Término contrato | Recolección llaves | Acción (Ver) |

- Estado uses `priorityBucketLabel` (same as cards).
- Asignación uses `missingAssignmentLabel` when bucket=0.
- Row + "Ver" both Link to `/admin/inspections/:id`.
- Horizontal scroll on narrow viewports via existing wrapper.

### B5. Preserved
Search, bucket chips, advanced filters, result count, Pendientes & Crear Nueva tabs — untouched.

---

## Technical details

- Migration: `ALTER TABLE profiles ADD COLUMN country_code text, ADD COLUMN phone text;`
- New: `supabase/functions/admin-create-user/index.ts` (uses `SUPABASE_SERVICE_ROLE_KEY`, already in secrets).
- New: `src/lib/markets.ts`.
- Edited: `src/lib/types.ts`, `src/pages/admin/AdminUsers.tsx`, `src/pages/admin/AdminInspections.tsx`, `src/pages/Auth.tsx`.
- RLS: `profiles` already has "Admins can manage all profiles" — covers edit dialog updates.

---

## Out of scope
Workload/dashboard tiles, HubSpot intake, AdminInspectionDetail, briefing card, signatures, photos, existing Pendientes approval flow, auth email update.

---

## Final summary (after implementation)
- Admin-created users via dialog → edge function → auth user + profile row.
- New profile fields: `country_code` (with `+`), `phone` (digits only).
- Market: stored `CL`/`MX`, displayed `Chile`/`México`.
- Phone: structured, normalized (digits only + leading `+`), WhatsApp-ready.
- Roles: canonical lowercase `admin`/`inspector`/`executive`.
- Auth: admin creation = primary supported path; self-signup removed from UI; backend signUp + trigger preserved as safety net.
- Edit dialog: email read-only this iteration.
- Inspections: added `Más recientes primero` / `Más antiguos primero`; renamed `Prioridad operativa` → `Más urgente primero (recomendado)`.
- Cards/Table toggle persisted in `?view=`, sharing the same filtered+sorted dataset.
- Table columns: Propiedad, ID, Estado, Asignación, Inspector, Ejecutivo, Mercado, Tipo, Creada, Término contrato, Recolección llaves, Acción.

