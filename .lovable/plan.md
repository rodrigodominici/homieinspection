

## Plan: Inspector flow corrections (final)

### 1. Dashboard — 4 operational tiles

Replace 2×2 stats in `InspectorDashboard.tsx` with:

| Tile | Computation | Route |
|---|---|---|
| Total asignadas | status in (`assigned`, `in_progress`, `needs_changes`) — excludes `pending_assignment` | `/inspector/all?filter=active` |
| Por coordinar | `isToCoordinate(i)` | `?state=to_coordinate` |
| Por iniciar | display key === `assigned` (coordinated + 0 progress + not started) | `?state=assigned` |
| En progreso | display key === `in_progress` | `?state=in_progress` |

**Check #1**: Audit `InspectorAllInspections.tsx` to confirm `?state=assigned` filter currently uses the same `getInspectorDisplayState(...).key === 'assigned'` predicate. If not, align it so the tile count and the filtered list match exactly. If the page filter is missing/different, add the matching predicate so navigation from the tile produces the identical set.

### 2. Kitchen / Logia ordering (new inspections only)

Reorder `kitchenFields` in `inspection-generator.ts`: kitchen matrix → appliances → technical → kitchen observation → kitchen photos → logia matrix → logia observation → logia photos. Add comment: "applies only to inspections generated after this change; existing `generated_structure_json` preserved as-is."

Mirror order in `renderKitchenSection` with two distinct photo cards scoped by `field_key`.

### 3. Per-bucket photos with safe degradation

`handlePhotoUpload(files, fieldKey?)` — `fieldKey` optional; when omitted, photos saved with `field_key: null` (today's behavior).

**Check #2**: Render rule for photo cards:
- If section declares scoped buckets (kitchen → `kitchen_photos` + `logia_photos`; access → `access_photos` + `keys_photos`), each card filters by its `field_key`.
- For older kitchen inspections where existing rows have `field_key: null`, those legacy photos render in the **first** (primary) bucket card (kitchen), so nothing disappears. New uploads from either card get tagged correctly going forward.
- Single-bucket sections (Baño, Living, etc.) ignore `field_key` entirely and show all section photos in one card — unchanged behavior.

### 4. Contextual photo labels

Replace hardcoded `"Fotos"` with `` `Fotos ${section.section_title}` ``. Multi-bucket cards use explicit titles ("Fotos Cocina y Electrodomésticos", "Fotos Logia", "Fotos Acceso", "Fotos Llaves / Tarjeta").

### 5. Signature persistence (3 scenarios)

**Check #3**:
- **Scenario A — immediate return to detail**: `InspectorSectionComplete.handleSigConfirm` calls `setPersistedSignature({...})` after insert → signature visible without leaving page; navigating back to detail sees fresh `location.key` → effect refetches.
- **Scenario B — reopen later (new navigation)**: `InspectorInspectionDetail` adds `location.key` to the signature fetch effect dep array → every route entry refetches `inspection_signatures` for this inspection.
- **Scenario C — full browser refresh**: covered by component mount (existing `[id]` dep already triggers initial fetch). The hook fires on mount regardless of `location.key`, so refresh works without extra logic.

DB write path verified: existing delete-then-insert in `inspection_signatures` is correct and persistent.

### Files touched

| File | Change |
|---|---|
| `src/pages/inspector/InspectorDashboard.tsx` | 4 operational tiles |
| `src/pages/inspector/InspectorAllInspections.tsx` | Confirm/align `?state=assigned` filter to match tile predicate |
| `src/lib/inspection-generator.ts` | Reorder kitchen fields + comment about legacy preservation |
| `src/pages/inspector/InspectorSectionComplete.tsx` | Optional `fieldKey` upload param; multi-bucket render with legacy fallback to primary bucket; per-section labels; local signature state on save |
| `src/pages/inspector/InspectorInspectionDetail.tsx` | Add `location.key` to signature fetch effect deps |

No DB changes. No migrations.

### Summary

- **Tile/list parity**: `Por iniciar` tile and `?state=assigned` list both use `getInspectorDisplayState(...).key === 'assigned'`; aligned during implementation.
- **Photo degradation**: legacy null-`field_key` rows render in the section's primary bucket card; new uploads tag correctly; single-bucket sections unchanged.
- **Signature persistence**: covered for in-page save, route reopen (`location.key`), and full refresh (mount effect).

