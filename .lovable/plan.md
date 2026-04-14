

# Plan: Fix 1D Dormitorio bug, restore Bodega, add Estacionamiento

## Summary

Fix studio detection so 1D properties show Dormitorio. Add new photo-only Estacionamiento section conditioned on `has_parking`. Update documentation with studio detection precedence and `bedrooms_count` clarification. 2 files, no migrations.

---

## Change 1: Fix `isStudio()` (`src/lib/inspection-generator.ts`, line 120)

Remove `if (payload.bedrooms_count === 0) return true`. The function becomes:

```typescript
export function isStudio(payload: PropertyPayload): boolean {
  if (payload.property_type?.toLowerCase() === 'estudio_loft') return true;
  if (payload.typology?.toLowerCase() === 'estudio') return true;
  return false;
}
```

**Precedence**: `property_type` checked first (primary source of truth), `typology` second (backward compatibility). `bedrooms_count` is never used for studio classification — only for bedroom repetition.

---

## Change 2: Add Estacionamiento section (`src/lib/inspection-generator.ts`, after line 450)

Insert between Bodega and Firma de inquilino:

```typescript
// ── 14. Estacionamiento (conditional: has_parking) ──────────────────
if (payload.has_parking) {
  sections.push({
    section_key: 'estacionamiento',
    section_title: 'Estacionamiento',
    section_type: 'space_secondary',
    sort_order: order++,
    fields: [
      makePhotoField('estacionamiento', 'Fotos Estacionamiento', 0),
    ],
  });
}
```

Update line 126 header comment to say `15-Screen Generation`. Renumber Firma comment to `15`.

---

## Change 3: Documentation (`src/pages/admin/AdminSettings.tsx`)

- Add row `{ n: 14, key: 'estacionamiento', title: 'Estacionamiento', visibility: 'has_parking = true', note: 'Solo fotos — evidencia de estacionamiento' }`
- Bump Firma to n: 15
- Add `{ field: 'has_parking', type: 'boolean', usage: 'Visibilidad de sección Estacionamiento' }` to ACTIVE_DRIVERS
- Update `property_type` driver description: `'Fuente primaria para detección de estudio (estudio_loft). También determina Patio Delantero (casa)'`
- Update `typology` driver description: `'Compatibilidad retroactiva para detección de estudio. Secundario a property_type'`
- Update `bedrooms_count` driver description: `'Cantidad de Dormitorios repetidos. NO se usa para clasificar estudio'`
- Update page header comment to `V4 — 15-screen model`

---

## Final section order

```text
 #  Section                    Condition
 1  Introducción               Always
 2  Datos del Inmueble         Always
 3  Datos del Inquilino        Always
 4  Acceso                     Always
 5  Living                     Always
 6  Cocina / Electrodomésticos Always
 7  Dormitorio 1..N            NOT estudio (includes 1D)
 8  Walking Closet             NOT estudio
 9  Baño 1..N                  Always (min 1)
10  Terraza / Patio Trasero    Always
11  Patio Delantero            property_type = casa
12  Otros Generales            Always
13  Bodega                     has_storage = true
14  Estacionamiento            has_parking = true
15  Firma de Inquilino         Always (final)
```

## Files affected

| File | Change |
|---|---|
| `src/lib/inspection-generator.ts` | Fix `isStudio()`, add Estacionamiento, update comments |
| `src/pages/admin/AdminSettings.tsx` | Add Estacionamiento row, `has_parking` driver, update studio detection docs |

2 files. No migrations.

