

# Plan: Walking Closet reorder + Otros Generales + Documentation sync (Refined)

## Summary

Three changes in 2 files: (1) move Walking Closet after Dormitorios and before Baños, (2) add "Otros Generales" section, (3) rewrite AdminSettings to reflect real logic. No migrations.

---

## Change 1: Walking Closet reorder (`src/lib/inspection-generator.ts`)

Move the Walking Closet generation block to immediately after the Dormitorio loop and before the Baño block. The `sort_order` counter naturally enforces the new position.

**Before**: Dormitorios → Baños → Walking Closet
**After**: Dormitorios → Walking Closet → Baños

---

## Change 2: Add "Otros Generales" section (`src/lib/inspection-generator.ts`)

New section with `section_type: 'space_secondary'`, placed after Patio Delantero and before Bodega (or Firma if no Bodega). Always visible.

Matrix items with business rationale:

| Item | Why here |
|---|---|
| Llaves entregadas | Cross-cutting property handover item, not tied to any specific room |
| Control de acceso | Building-level access, not room-specific |
| Mando estacionamiento | Parking accessory — even if no Bodega section, this is a handover item |
| Cortinas generales | Shared across multiple rooms, evaluated once globally |
| Otros elementos | Catch-all for items that don't fit any room section |

Plus standard observation text field and photo upload field.

---

## Change 3: Rewrite AdminSettings (`src/pages/admin/AdminSettings.tsx`)

Full rewrite to reflect the real implemented logic. Key refinements requested:

### Baño description
Document as: "Baño 1..N — always at least one instance, repeatable by `bathrooms_count` (min 1)". Not listed as simply "always visible" — its repeatable nature is explicit.

### Active vs deprecated field distinction

**Active generation drivers** (currently used in code):
- `property_type` → drives Patio Delantero (`casa`), studio detection
- `typology` → drives `isStudio()` helper (studio/loft detection)
- `bedrooms_count` → drives Dormitorio repetition + Walking Closet visibility
- `bathrooms_count` → drives Baño repetition (min 1)
- `has_storage` → drives Bodega visibility

**Deprecated flags** (still in DB/payload but no longer drive generation):
- `has_walking_closet` — now inferred from non-studio
- `has_front_yard` — now inferred from `property_type = casa`
- `has_terrace_living` — Terraza is always visible
- `has_terrace_bedroom` — merged into single Terraza section
- `has_logia` — Logia always inside Kitchen with NA option

### Otros Generales documentation
Each matrix item includes a short rationale note so business can validate the grouping directly in the settings page.

---

## Final section order

```text
#   Screen                        Visibility                          Note
1   Introducción                  Always                              Cleaning, fumigation, removal
2   Datos del Inmueble            Always                              Meters, admin contact
3   Datos del Inquilino           Always                              Handover person
4   Acceso                        Always
5   Living                        Always
6   Cocina / Electrodomésticos    Always                              Logia sub-group inside, NA allowed
7   Dormitorio 1..N               NOT estudio; repeat bedrooms_count
8   Walking Closet                NOT estudio                         After last Dormitorio
9   Baño 1..N                     Always; repeat bathrooms_count      Min 1 instance always
10  Terraza / Patio Trasero       Always
11  Patio Delantero               property_type = casa
12  Otros Generales               Always                              Cross-cutting handover items
13  Bodega                        has_storage = true
14  Firma de Inquilino            Always (final)                      Observations + signature
```

---

## Files affected

| File | Change |
|---|---|
| `src/lib/inspection-generator.ts` | Reorder Walking Closet, add Otros Generales with rationale-ready fields |
| `src/pages/admin/AdminSettings.tsx` | Full rewrite: real order, Baño as repeatable, active vs deprecated fields, Otros Generales rationale |

2 files. No migrations.

