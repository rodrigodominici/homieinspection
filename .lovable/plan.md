

# Plan: Inspection Form Structural Refactor — Final Refined

## Summary

Rewrite the 7-step grouped generation model with all 8 refinements applied. 7 file changes, no migrations.

---

## Refinement Details Applied

### R1. Legacy payload field mapping
Add a `normalizeIncomingPayload()` helper at the top of `inspection-generator.ts` that maps legacy/alternative field names to canonical ones before generation:
```ts
function normalizeIncomingPayload(raw: PropertyPayload): PropertyPayload {
  return {
    ...raw,
    recipient_email: raw.recipient_email ?? (raw as any).correo_receptora ?? null,
    tenant_name: raw.tenant_name ?? (raw as any).nombre_inquilino ?? null,
    tenant_whatsapp: raw.tenant_whatsapp ?? (raw as any).whatsapp_inquilino ?? null,
    unit_number: raw.unit_number ?? (raw as any).numero_depto ?? null,
    fecha_inspeccion: raw.fecha_inspeccion ?? (raw as any).inspection_date ?? null,
  };
}
```
Both `generateSections()` and `normalizePropertySnapshot()` call this first. Safe for new and old payloads.

### R2. Storage & Parking — explicit sub-blocks
`storage_and_parking` section keeps its grouped key but uses distinct `group_key` prefixes:
- `parking_status`, `parking_observation`, `parking_photos` (group_key: `parking`)
- `storage_status`, `storage_observation`, `storage_photos` (group_key: `storage`)

Fields are conditionally included based on `has_parking` / `has_storage` individually. When both exist, both sub-blocks appear. When only one exists, only that sub-block renders.

### R3. Key collection fields prominence in closing
In the `closing` section, `fecha_recoleccion_llaves` and `hora_recoleccion_llaves` are placed at sort_order 0-1 (top of the section) with group_key `key_collection` so the UI can render them with visual prominence (e.g. highlighted card or distinct sub-header).

### R4. WhatsApp CTA in broader surfaces
- `PropertyBriefingCard`: read `tenant_whatsapp` and `tenant_name` from `getEffectiveSnapshot()`. If whatsapp exists, render a `Contactar por WhatsApp` button alongside the existing `Cómo llegar` button.
- `InspectorInspectionDetail`: show a small WhatsApp pill/button in the property header area when tenant_whatsapp is available.
- Inside `reception_data` section: also render the CTA inline (existing plan).

### R5. Visual separation in reception_data
Use two distinct `group_key` families:
- Payload-derived context fields: `group_key: 'context'` — rendered with a muted/read-only visual style
- Inspector-entered fields: `group_key: 'inspector_input'` — rendered with standard editable input style

The `InspectorSectionComplete` renderer checks `group_key` to apply different visual treatment within the same step.

### R6. Kitchen status matrix scope
The kitchen status matrix includes exactly these status fields:
- `kitchen_general_status` — "Estado General Cocina"
- `kitchen_countertop_status` — "Estado Mesón"
- `kitchen_sink_status` — "Estado Lavaplatos"
- `kitchen_faucet_status` — "Estado Grifería"

Appliance fields use group_key `appliance`:
- `appliances_status` — "Estado General Electrodomésticos"

Technical selectors use group_key `technical`:
- `encimera_type`, `platos_count`, `horno_type`

Logia fields use group_key `logia` (conditional).

Shared observation/photos use group_key `observation`/`photo`.

### R7. Pest control naming
Use a single canonical label: **"Fumigación"** with field key `fumigation_observation` and `fumigation_photos`. No duplicate "pest_control" / "control de plagas" naming.

### R8. Rollout behavior
- **New inspections**: generated with the new 7-step grouped model immediately.
- **Existing inspections**: NOT automatically migrated. They retain their existing `generated_structure_json` and section records. The UI continues to render whatever sections exist.
- **Demo/test inspections**: if identifiable (e.g. using example payload property IDs), can be safely regenerated. But no forced migration of production data.
- Document this in a code comment at the top of `generateSections()`.

---

## File Changes

### 1. `src/lib/types.ts`
- Add to `PropertyPayload`: `tenant_name?`, `tenant_whatsapp?`, `unit_number?`, `parking_number?`, `storage_number?`, `fecha_inspeccion?`
- Add to `SectionType`: `'reception_meta' | 'space_kitchen'`

### 2. `src/lib/inspection-generator.ts` — Full rewrite of `generateSections()`
- Add `normalizeIncomingPayload()` helper (R1)
- Implement 7-step structure with all field definitions per refinements above
- `normalizePropertySnapshot()` — add new fields, call normalizer first
- Update all 5 example payloads (add `tenant_name`, `tenant_whatsapp`, `fecha_inspeccion`, `unit_number` to some; keep `unscheduled` without tenant data)
- Add rollout comment (R8)

### 3. `src/lib/section-completion.ts`
- `PHOTO_REQUIRED_KEYS`: replace `'kitchen'` with `'kitchen_appliances'`, keep others
- `PHOTO_REQUIRED_PATTERNS`: add `/^bathroom_studio$/`
- `EXEMPT_FROM_FINAL_OBS`: add `'reception_meta'`

### 4. `src/lib/inspection-utils.ts`
- `NON_OPERATIONAL_TYPES`: replace `'property_meta'` with `'reception_meta'`

### 5. `src/pages/inspector/InspectorSectionComplete.tsx`
- For `reception_meta` sections: render context fields (group_key `context`) with muted read-only style; render inspector_input fields with editable style (R5)
- Render WhatsApp CTA when `tenant_whatsapp` field has value (R4)
- For `space_kitchen` sections: render kitchen sub-groups, appliance sub-group, conditional logia, shared obs/photos (R6)
- For `closing_summary` with key `closing`: render key collection fields prominently at top (R3), fumigation as single concept (R7)
- For `storage_and_parking`: render parking/storage sub-blocks conditionally based on which group_key fields exist (R2)

### 6. `src/components/PropertyBriefingCard.tsx`
- Read `tenant_whatsapp`, `tenant_name`, `unit_number`, `fecha_inspeccion` from `getEffectiveSnapshot()`
- Show WhatsApp CTA button when available (R4)
- Show `unit_number` as "Nº Dpto/Casa", `fecha_inspeccion` as "Fecha de inspección"

### 7. `src/pages/inspector/InspectorInspectionDetail.tsx`
- Show small WhatsApp pill in property header when `tenant_whatsapp` available (R4)

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/lib/types.ts` — new payload fields, new section types |
| Rewrite | `src/lib/inspection-generator.ts` — 7-step generation + legacy normalizer + examples |
| Edit | `src/lib/section-completion.ts` — updated photo/completion rules |
| Edit | `src/lib/inspection-utils.ts` — updated non-operational types |
| Edit | `src/pages/inspector/InspectorSectionComplete.tsx` — grouped rendering, WhatsApp, visual separation |
| Edit | `src/components/PropertyBriefingCard.tsx` — new context fields + WhatsApp CTA |
| Edit | `src/pages/inspector/InspectorInspectionDetail.tsx` — WhatsApp pill |

7 file changes. No migrations.

