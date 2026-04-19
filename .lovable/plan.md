

## Plan: Email-based assignment resolution — final refinements

### 1. Status semantics (no implicit "auto assigned")

The intake function only **injects resolved ids** into the normalized payload before persisting:

```ts
normalized.inspector = { id: resolvedInspectorId, email: inspectorEmail };
normalized.executive = { id: resolvedExecutiveId, email: executiveEmail };
```

The final `inspections.status` is decided **exclusively by the existing RPC rule** in `create_inspection_from_event`:

```sql
v_status := CASE
  WHEN v_inspector_id IS NOT NULL AND v_executive_id IS NOT NULL THEN 'assigned'
  ELSE 'pending_assignment'
END;
```

No new status logic in the edge function. Documented inline + in admin config: "Resolution writes ids; status is computed by the RPC."

### 2. Profile fallback uses canonical role values

Confirmed against schema: `profiles.role` is a free `text` column populated from `handle_new_user` and admin assignment. Canonical values currently in use across the codebase: `admin`, `executive`, `inspector`, `pending`. Lookup uses exactly:

```ts
.eq('role', slot === 'inspector' ? 'inspector' : 'executive')
.eq('is_active', true)
```

Pre-implementation check: a single `supabase--read_query` against `select distinct role from profiles` to confirm no drift (e.g. `inspectora`, `Inspector`) before wiring the filter. If drift exists, normalize to lowercase on both sides.

### 3. Mapping table column name confirmed

Per `<supabase-tables>`: `external_user_mappings` exposes `hubspot_email text` (not `email`). Lookup uses exactly:

```ts
.eq('provider', 'hubspot')
.eq('is_active', true)
.ilike('hubspot_email', email)   // case-insensitive
```

`role_hint` (also `text`, nullable) is matched with `OR role_hint IS NULL` so unscoped mappings still apply.

### 4. Explicit assignment panel in Logs detail

The `__assignment__` block written by intake has a per-slot structured shape so the UI can render every relevant fact:

```jsonc
"__assignment__": {
  "inspector": {
    "input_email": "inspectora@homie.cl",
    "resolved_via": "mapping" | "profile" | "unresolved" | "absent",
    "resolved_profile_id": "uuid | null",
    "steps": [
      { "step": "external_user_mappings", "outcome": "miss",   "detail": "no active mapping for hubspot_email" },
      { "step": "profiles_fallback",       "outcome": "hit",    "detail": "matched profiles.email + role=inspector" }
    ],
    "warnings": []
  },
  "executive": { /* same shape */ }
}
```

`AdminIntegrationHubSpotLogs.tsx` detail drawer renders, per slot:
- **Email recibido**: `input_email` (or "—" if absent)
- **Resuelto vía**: badge (`mapping` / `profile` / `unresolved` / `absent`)
- **Profile resuelto**: id + link to user (when present)
- **Pasos de resolución**: ordered list of `{step, outcome, detail}` so ops sees exactly which lookup hit/missed
- **Warnings**: bullet list (empty when none)

Table-level signal: yellow `Asignación parcial` chip when any slot's `resolved_via` is `unresolved` (email present, no match). Absent emails do not produce the chip.

### Files

| File | Change |
|---|---|
| `supabase/functions/hubspot-inspection-intake/index.ts` | Add `inspector_email`/`executive_email` to validator (optional). Add `resolveAssignment(email, slot)` returning the structured per-slot record above. Inject ids into normalized payload only; let RPC decide status. |
| `src/pages/admin/AdminIntegrationHubSpot.tsx` | Sample payload + mapping rows for the two new fields; note that status is RPC-computed. |
| `src/pages/admin/AdminIntegrationHubSpotLogs.tsx` | Detail drawer: explicit per-slot assignment panel (email, resolved_via, profile id, steps, warnings). Table chip for partial. |

No DB migration. No RPC change.

### Summary

1. Intake injects ids; status remains RPC-driven (`assigned` iff both ids present).
2. Profile fallback filters on canonical `role IN ('inspector','executive')` + `is_active`, verified against live data before wiring.
3. Mapping lookup uses the real column `hubspot_email` (case-insensitive) plus `provider='hubspot'`, `is_active=true`, with optional `role_hint`.
4. Logs panel surfaces input email, resolved-via, resolved profile id, the ordered resolution steps with hit/miss detail, and any warnings — making unresolved cases self-explanatory.

