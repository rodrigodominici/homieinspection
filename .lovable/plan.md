

# Plan: Card Enrichment, Sorting, and Executive Consistency Pass

## Summary

Enrich Admin and Inspector inspection list cards with explicit date lines and "Por coordinar" as a distinct card pattern. Add sorting with null-safe behavior. Update Executive schedule for full consistency. 4 file changes, no migrations.

---

## File Changes

### 1. `src/pages/admin/AdminInspections.tsx`

**Add date computation to data model** (after line 74):
- Build an inspector name map from `profiles`
- For each inspection, compute `scheduleDatetime` and `contractEndDate` from `getScheduleDatetime` / `getContractEndDate`

**Add sort dropdown** (after filters, line 204):
- Options: `Última actividad` (default), `Término contrato ↑`, `Término contrato ↓`, `Recolección llaves ↑`, `Recolección llaves ↓`
- Null-safe: valid dates first, nulls last (for both ascending and descending)

**Enrich card rendering** (lines 218-239):
- Add explicit date line below address:
  - If no `scheduleDatetime` but has `contractEndDate`: amber "Por coordinar" badge + `Término de contrato: <date>` line
  - If has `scheduleDatetime`: `Inspección: <date>` line
- Add inspector name on card
- For "Por coordinar" cards: use `ring-amber-200 border-dashed` ring style, no progress/status badge swap needed since Admin uses `InspectionStatusBadge`

### 2. `src/pages/inspector/InspectorAllInspections.tsx`

**Extend `InspectionWithProgress`** with `scheduleDatetime: Date | null` and `contractEndDate: Date | null` (computed in data load via `getScheduleDatetime`/`getContractEndDate`).

**Differentiated card patterns** (lines 118-145):
- **Por coordinar** (no `scheduleDatetime`, has `contractEndDate`, active): amber ring, "Por coordinar" badge from `InspectorStatusBadge`, `Término de contrato: <date>` line, NO progress bar
- **Programmed** (has `scheduleDatetime`): standard card, `Inspección: <date>` line, progress bar, status badge

**Default sort**: active inspections sorted by `contractEndDate` nearest first (nulls last), then by `scheduleDatetime` nearest first (nulls last).

### 3. `src/pages/executive/ExecutiveSchedule.tsx`

**Add explicit date line to programmed grid items** (line 270):
- Below property name, add `Inspección: <time>` text so coordinated items also have an explicit label, not just color

**Verify bottom cards**: "Por coordinar" cards already show `Término de contrato: <date>` — confirmed. "Sin programar" cards already show status badge — confirmed.

No structural changes needed; only add the explicit time label to grid items.

### 4. `src/pages/inspector/InspectorInspectionDetail.tsx`

**Fix mobile CTA layout** (line 429): Change `<div className="flex gap-2">` to `<div className="flex flex-col sm:flex-row gap-2">` so WhatsApp + Cargar fecha stack vertically on mobile.

---

## Null-Safe Sort Logic

```typescript
function nullSafeSort(a: Date | null, b: Date | null, asc: boolean): number {
  if (!a && !b) return 0;
  if (!a) return 1;  // nulls last always
  if (!b) return -1;
  return asc ? a.getTime() - b.getTime() : b.getTime() - a.getTime();
}
```

---

## Card Pattern Reference

| State | Ring | Badge | Date line | Progress |
|---|---|---|---|---|
| Por coordinar | amber-200 dashed | "Por coordinar" (amber) | Término de contrato: date | Hidden |
| Programmed | standard border | Status badge | Inspección: date | Shown |

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/pages/admin/AdminInspections.tsx` — date lines, sorting, inspector name |
| Edit | `src/pages/inspector/InspectorAllInspections.tsx` — dual card pattern, sorting |
| Edit | `src/pages/executive/ExecutiveSchedule.tsx` — add time label to grid items |
| Edit | `src/pages/inspector/InspectorInspectionDetail.tsx` — mobile CTA fix |

4 file changes. No migrations.

