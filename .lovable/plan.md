

# Inspection Form Flow — Full Structural Refactor Proposal (Refined)

## A. Final Screen Structure (13 screens)

```text
#   Screen                        Visibility Rule              Section Type
──  ────────────────────────────  ───────────────────────────  ────────────────
1   Introducción                  Always                       introduction
2   Datos del inmueble            Always                       reception_meta
3   Datos del inquilino/entrega   Always                       handover_meta
4   Acceso                        Always                       space_standard
5   Living                        Always                       space_standard
6   Cocina / Electrodomésticos    Always (Logia always inside) space_kitchen
7   Dormitorio 1..N               NOT estudio; repeat N        space_standard
8   Baño 1..N                     Always; repeat N (min 1)     space_standard
9   Walking Closet                NOT estudio                  space_secondary
10  Terraza / Patio Trasero       Always                       space_secondary
11  Patio Delantero               property_type = casa         space_secondary
12  Bodega                        has_storage = true (pending)  space_secondary
13  Firma de inquilino            Always (final)               signature
```

### Always-visible sections (9 total)
Introducción, Datos del inmueble, Datos del inquilino/entrega, Acceso, Living, Cocina/Electrodomésticos (with Logia sub-group always present, NA allowed), Baño (min 1), Terraza/Patio Trasero, Firma de inquilino.

### Conditional sections (4 rules)
- **Dormitorio**: only if NOT estudio (repeat by `bedrooms_count`)
- **Walking Closet**: only if NOT estudio (always after last Dormitorio)
- **Patio Delantero**: only if `property_type = casa`
- **Bodega**: only if `has_storage = true` (pending business confirmation)

### Resolution of "Otros General" / "Closing" inconsistency

The old Closing/Cierre section (step 7 in the 7-step model) is **dissolved**. Its contents are explicitly redistributed:

| Old Closing content | New location | Rationale |
|---|---|---|
| Fecha/Hora recolección llaves | **Introducción** (read-only context) | Operational date, set before inspection starts |
| Estado de Aseo | **New sub-group in Introducción** (group_key: `cleaning`) | Inspector captures on arrival |
| Observaciones Aseo | Same as above | |
| Retiro de Enseres | **New sub-group in Introducción** (group_key: `removal`) | Inspector captures on arrival |
| Fumigación observaciones + fotos | **New sub-group in Introducción** (group_key: `fumigation`) | Inspector captures on arrival |
| Lectura Electricidad/Agua/Gas + fotos | **New sub-group in Datos del inmueble** (group_key: `meters`) | Property-level data |
| Nombre/Teléfono/Email Administrador | **New sub-group in Datos del inmueble** (group_key: `admin_contact`) | Property-level data |
| Observaciones Generales | **New field in Firma de inquilino** (before signature) | Final inspector notes |
| Fotos Adicionales | **New field in Firma de inquilino** | Catch-all evidence |

This eliminates the ambiguous "Otros General" / "Closing" concept entirely. No orphaned content.

---

## B. Conditional Rules (consolidated)

| Rule | Old trigger | New trigger |
|---|---|---|
| Skip Dormitorio + Walking Closet | `bedrooms_count = 0` OR `typology = Estudio` | `property_type` value (see note below) |
| Repeat Dormitorios | `bedrooms_count` | Same |
| Repeat Baños | `bathrooms_count` | Same, min 1 |
| Patio Delantero | `has_front_yard AND casa` | `property_type = 'casa'` only |
| Terraza | `has_terrace_living` / `has_terrace_bedroom` | Always shown |
| Logia | `has_logia` flag | Always inside Kitchen (NA option per field) |
| Bodega | `has_storage` flag | `has_storage` flag (kept pending confirmation) |

**Note on `property_type = estudio_loft`**: This is treated as a **pending business decision**. Implementation will use a helper function `isStudio(payload)` that currently checks `bedrooms_count === 0 || typology === 'Estudio'`. When business confirms whether `estudio_loft` becomes a `property_type` value, only this helper changes. The rest of the codebase is insulated.

---

## C. Date Label Resolution

The label `Fecha de inspección` in Datos del inmueble is **replaced** with `Recolección de llaves / inspección` to align with the corrected date model:

- **`Recolección de llaves / inspección`** → `fecha_recoleccion_llaves` (operational)
- **`Término de contrato (ref.)`** → `fecha_de_termino_real_de_contrato` (contextual, read-only)
- **`Fecha real de cierre`** → `fecha_de_recepcion_del_checkout_cl` (audit, read-only)

No field is labeled "Fecha de inspección" in the new structure.

---

## D. New Payload Contract

### Kept fields
`hubspot_property_id`, `property_id`, `market`, `property_name`, `address`, `property_type`, `inspection_type`, `bedrooms_count`, `bathrooms_count`, `tower`, `unit_number`, `has_storage`, `has_parking`, `parking_number`, `storage_number`, `tenant_name`, `tenant_whatsapp`, `recipient_email`, `warranty_deposit`, `fecha_de_termino_real_de_contrato`, `fecha_recoleccion_llaves`, `hora_recoleccion_llaves`, `fecha_de_recepcion_del_checkout_cl`, `inspector`, `executive`

### Removed flags (5)
`has_walking_closet`, `has_front_yard`, `has_terrace_living`, `has_terrace_bedroom`, `has_logia`

### Kept conditionally (pending business)
`has_storage`, `has_parking`, `typology` (descriptive only, not a conditional driver)

---

## E. DB / Model Impact

**Cautious statement**: No schema migrations are expected for this phase, since the DB tables (`inspection_sections`, `inspection_field_values`) are payload-driven and store whatever the generator produces. However:

- If business requires formal versioning of inspection structures (e.g., a `generator_version` column on `inspections`), a small migration may be needed.
- Existing inspections retain their stored `generated_structure_json` and are unaffected.
- New inspections use the new generator output.
- The `property_snapshot_json` will stop including removed flags for new inspections. Old snapshots retain them.

---

## F. Photo Validation Rule

Photos are **not required** to move between sections. They **are required** to finalize/submit the inspection.

Sections requiring at least 1 photo to finalize (proposed default — pending business confirmation):
- Acceso, Living, Cocina/Electrodomésticos, each Dormitorio, each Baño, Terraza/Patio Trasero

Exceptions (no photo required):
- Introducción, Datos del inmueble, Datos del inquilino/entrega, Walking Closet (pending), Bodega (pending), Patio Delantero (pending), Firma de inquilino

Implementation: new `canFinalizeInspection()` function in `section-completion.ts` checks photo counts globally at submission time.

---

## G. Data Source Distinction

| Data type | Source | Editable by Inspector? |
|---|---|---|
| Context fields (group_key: `context`) | JSON payload / HubSpot | No (read-only, muted UI) |
| Operational dates | JSON payload | No (admin/coordination sets) |
| Inspector input fields (group_key: `inspector_input`) | Inspector during inspection | Yes |
| Status matrix fields | Inspector during inspection | Yes |
| Observations / photos | Inspector during inspection | Yes |
| Meter readings | Inspector during inspection | Yes |
| Admin contact | Inspector during inspection | Yes |
| Property overrides | Admin before start | Admin only |

---

## H. Open Business Questions

| # | Question | Default assumption |
|---|---|---|
| 1 | Bodega: fixed or conditional? | Conditional (`has_storage`) |
| 2 | Estacionamiento: separate section or contextual? | Context field only |
| 3 | `Estudio/Loft` as `property_type` value? | Pending — using `isStudio()` helper for now |
| 4 | Bedroom/bathroom count: payload only or admin-overridable? | Payload (admin can override via `property_overrides_json`) |
| 5 | Photo finalization: which sections require photos? | Access, Living, Kitchen, Bedrooms, Bathrooms, Terraza |
| 6 | Logia: always inside Kitchen with NA allowed? | Yes |
| 7 | Where do cleaning/fumigation/meters/admin contact live? | Cleaning/fumigation → Introducción; Meters/admin → Datos del inmueble |
| 8 | Should a `generator_version` be stored for coexistence? | Recommended but not blocking |

---

## I. Implementation Sequence

### Phase 1: Generator Refactor (core logic, no UI)
1. Update `PropertyPayload` type — remove 5 flags
2. Rewrite `generateSections()` with 13-screen structure + per-item field matrices
3. Update `normalizePropertySnapshot()` — stop propagating removed flags
4. Update `normalizeIncomingPayload()` — backward compat for old payloads
5. Update `EXAMPLE_PAYLOADS` to new contract
6. Update `section-completion.ts` — decouple photo validation, add `canFinalizeInspection()`

### Phase 2: Inspector UI
7. Add Introduction screen renderer
8. Add per-item status matrix renderer
9. Convert Signature from dialog to final section screen
10. Update section navigation for new order
11. Update finalization flow with global photo check

### Phase 3: Admin/Executive Alignment
12. Update Admin detail for new section keys and removed flags
13. Update payload editor/examples
14. Verify Executive review renders new sections correctly

### Phase 4: Cleanup
15. Remove dead flag references across codebase
16. Update documentation

### Files affected (estimated ~8-10)
- `src/lib/types.ts` — payload type cleanup
- `src/lib/inspection-generator.ts` — complete rewrite
- `src/lib/section-completion.ts` — photo validation decoupling
- `src/pages/inspector/InspectorInspectionDetail.tsx` — new flow
- `src/pages/inspector/InspectorSectionComplete.tsx` — matrix renderer
- `src/pages/admin/AdminInspectionDetail.tsx` — flag removal
- `src/pages/executive/ExecutiveReviewDetail.tsx` — compatibility check
- `src/components/PropertyBriefingCard.tsx` — label alignment

No database migrations in Phase 1-3. Possible small migration in Phase 4 if `generator_version` is confirmed.

