

# Plan: Remove Legacy `scheduled_at` from Admin UI + Add "Término contrato (ref.)"

## Summary

Remove the `editScheduledAt` state, UI field, and save logic from `AdminInspectionDetail`. Add `fecha_de_termino_real_de_contrato` to the summary bar. Update example payloads to include all 3 date fields with some `null` values for testability. 2 file changes, no migrations.

---

## File Changes

### 1. `src/pages/admin/AdminInspectionDetail.tsx`

**Remove legacy scheduled_at completely:**
- Line 111: Delete `const [editScheduledAt, setEditScheduledAt] = useState('');`
- Line 153: Delete `setEditScheduledAt(...)` initialization
- Line 264: Remove `scheduled_at: ...` from `handleSave` updates object
- Lines 782-786: Delete the "Fecha programada (legacy)" input block entirely

**Add "Término contrato (ref.)" to summary bar** (after line 578, inside the grid):
```tsx
{(() => {
  const snap = getEffectiveSnapshot(inspection);
  const terminoContrato = (snap?.fecha_de_termino_real_de_contrato as string) ?? null;
  return <SummaryItem label="Término contrato (ref.)" value={terminoContrato ?? 'No disponible'} muted={!terminoContrato} />;
})()}
```

**Relabel existing summary item** (line 578): Change `"Recolección llaves"` → `"Recolección de llaves"` for consistency with the refinement.

### 2. `src/lib/inspection-generator.ts`

**Add missing date fields to example payloads:**

| Example | `fecha_de_termino_real_de_contrato` | `fecha_recoleccion_llaves` | `fecha_de_recepcion_del_checkout_cl` |
|---|---|---|---|
| `studio` | `"2026-03-15"` | keep existing (`"2026-03-20"`) | `null` |
| `twoBedTwoBath` | `"2026-03-18"` | `null` (test coordination flow) | `null` |
| `houseWithYard` | `"2026-03-20"` | keep existing (`"2026-03-25"`) | `null` |
| `fullFeatures` | `"2026-03-22"` | keep existing (`"2026-03-28"`) | `null` |
| `unscheduled` | already has it | add `fecha_recoleccion_llaves: null` | `null` |

### R2 confirmation: No other active UI surfaces edit `scheduled_at`

From the search results, only `AdminInspectionDetail.tsx` uses `editScheduledAt`. The DB column and `inspection-service.ts` write remain for backward compat but no UI reads or edits it after this change.

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/pages/admin/AdminInspectionDetail.tsx` — remove legacy field, add término contrato |
| Edit | `src/lib/inspection-generator.ts` — add date fields to examples |

2 file changes. No migrations.

