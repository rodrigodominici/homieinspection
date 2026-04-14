

# Plan: Deprecate `typology` from business logic, make `property_type` sole driver

## Summary

Remove `typology` from all conditional logic. Normalize `property_type` in the incoming payload mapper. Update `isStudio()` to check only `property_type`. Fix example payloads. Update admin documentation. Add `@deprecated` to type definitions. Clean up display surfaces. 3 files, no migrations.

---

## Change 1: Normalize `property_type` in `normalizeIncomingPayload` (`src/lib/inspection-generator.ts`, lines 46-58)

Add canonical `property_type` derivation:

```typescript
function normalizeIncomingPayload(raw: PropertyPayload): PropertyPayload {
  // Derive canonical property_type
  let propertyType = raw.property_type?.toLowerCase()?.trim() || null;
  if (propertyType === 'estudio_loft') propertyType = 'estudio';

  // Last-resort fallback: derive from typology ONLY if property_type is absent
  if (!propertyType && raw.typology?.toLowerCase() === 'estudio') {
    propertyType = 'estudio';
  }

  return {
    ...raw,
    property_type: propertyType ?? raw.property_type,
    // existing legacy mappings unchanged...
  };
}
```

The `typology` fallback is explicitly a backward-compatibility escape hatch, not the ideal contract.

---

## Change 2: Simplify `isStudio()` (`src/lib/inspection-generator.ts`, lines 118-132)

Replace entire block:

```typescript
// ─── Studio detection ───────────────────────────────────────────────────
//
// Classification is based SOLELY on property_type (canonical).
// property_type is normalized upstream by normalizeIncomingPayload:
//   - 'estudio_loft' → 'estudio'
//   - missing property_type + typology='estudio' → 'estudio' (legacy fallback)
//
// typology is DEPRECATED — stored for reference only, never consumed.
// bedrooms_count is used only for bedroom repetition, never classification.

export function isStudio(payload: PropertyPayload): boolean {
  return payload.property_type?.toLowerCase() === 'estudio';
}
```

---

## Change 3: Fix example payloads (`src/lib/inspection-generator.ts`, lines 521-547)

The `studio` example currently has `property_type: "departamento"` with `typology: "Estudio"` — this is the exact contradiction that caused the bug. Fix:

```typescript
studio: {
  // ...
  typology: "Estudio",           // @deprecated — informational only
  property_type: "estudio",      // canonical source of truth
  // ...
}
```

Add `// @deprecated — informational only` comment next to all other `typology` fields in example payloads.

---

## Change 4: Mark `typology` as deprecated in types (`src/lib/types.ts`)

On line 99 (Inspection interface):
```typescript
/** @deprecated Informational only. Use property_type for classification. */
typology: string | null;
```

On line 197 (PropertyPayload interface):
```typescript
/** @deprecated Informational only. Use property_type for classification. */
typology?: string;
```

---

## Change 5: Update admin documentation (`src/pages/admin/AdminSettings.tsx`)

1. Move `typology` from `ACTIVE_DRIVERS` to `DEPRECATED_FLAGS`:
   ```typescript
   { field: 'typology', reason: 'Ya no controla generación. Solo referencia. property_type es la única fuente de verdad.' },
   ```

2. Update `property_type` driver description:
   ```
   'Única fuente de verdad para clasificación (estudio / departamento / casa). Determina Dormitorios, Walking Closet, Patio Delantero.'
   ```

3. Fix conditional sections table (line 167): replace `NOT estudio (typology ≠ Estudio AND bedrooms_count > 0)` with `property_type ≠ estudio`

4. Fix "Regla de Living" card (lines 206-216): replace `typology = Estudio` / `typology ≠ Estudio` with `property_type = estudio` / `property_type ≠ estudio`

---

## Change 6: Clean up display surfaces

**`src/pages/public/OwnerReport.tsx` (lines 122-124)**: Currently shows `{property.typology} · {property.property_type}`. Change to show `property_type` as the primary label. If `typology` is present, show it parenthetically as secondary info rather than leading:

```tsx
{property.property_type && (
  <span className="flex items-center gap-1">
    <Building className="h-3.5 w-3.5" /> {property.property_type}
    {property.typology && <span className="text-muted-foreground">({property.typology})</span>}
  </span>
)}
```

**`PropertyBriefingCard.tsx`**: Already uses `property_type` only — no change needed.

---

## Files affected

| File | Change |
|---|---|
| `src/lib/inspection-generator.ts` | Normalize `property_type` in payload mapper, simplify `isStudio()`, fix studio example payload |
| `src/lib/types.ts` | Add `@deprecated` JSDoc to `typology` in both interfaces |
| `src/pages/admin/AdminSettings.tsx` | Move `typology` to deprecated, update all rule references to `property_type` |
| `src/pages/public/OwnerReport.tsx` | Make `property_type` primary in display, `typology` secondary/parenthetical |

4 files. No migrations.

