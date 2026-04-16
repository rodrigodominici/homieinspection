

# Plan: Final refinements to inspection flow corrections

## Summary

Refine the previously approved plan with 5 clarifications: reposition Introducción as a context briefing, verify `sent` status usage, harden read-only mode, keep Acceso photo validation single-bucket, and document scope of structural changes.

---

## Refinement 1 — Introducción as briefing screen

In `src/lib/inspection-generator.ts`, generate Introducción with:
- A single optional `intro_observation` textarea labeled **"Observación inicial (opcional)"** with helper text *"Pantalla de contexto. Continúa al siguiente paso cuando estés listo."*
- No mandatory fields → already auto-completable per `canCompleteSection` logic.

In `InspectorSectionComplete.tsx`, when `section_type === 'introduction'`, render a brief intro/briefing header above the field so it visually reads as a context screen, not an empty form.

In `AdminSettings.tsx`, update note: *"Pantalla de contexto/briefing. Solo observación inicial opcional."*

---

## Refinement 2 — Verify `sent` status

Audit before locking the read-only list. Per memory `logic/workflow-staged-model`, `sent` is **legacy/historical only**; `published` is the current terminal state. I will grep `inspection.status` writers to confirm. Expected final read-only set:

```ts
const READ_ONLY_STATUSES = ['submitted', 'reviewed', 'approved', 'published'];
// 'sent' included ONLY if grep confirms it is still written somewhere active.
```

Centralize in `src/lib/inspection-status-guard.ts` as `isInspectorReadOnly(status)` so both inspector pages share one source of truth.

---

## Refinement 3 — Truly non-editable read-only mode

In `InspectorSectionComplete.tsx` when `isReadOnly`:
- **Matrix buttons**: render as static badges (selected = filled, others hidden), not disabled buttons.
- **Textareas**: render as plain `<p>` text blocks (or empty-state "Sin observaciones"), not disabled inputs.
- **Photo grid**: thumbnails only, no upload tile, no delete buttons, no PhotoUploadSheet trigger.
- **Signature**: persisted image only, no "Obtener firma" CTA, no clear button.
- **Bottom bar**: single "Volver" button. No "Completar sección", no save indicator, no next/prev nav.
- **Section header**: small "Solo lectura" badge.

Add a top-level `<ReadOnlyBanner />` inline note: *"Inspección enviada — solo lectura."*

---

## Refinement 4 — Acceso keys grouping, single photo bucket

Field order in `access` section:
1. Access matrix
2. `access_observation` (textarea)
3. `access_photos` (photo_upload) ← **the only photo field validated for finalization**
4. `access_keys_observation` (textarea, grouped under "Llaves / Tarjeta" subheader)
5. `access_keys_photos` (photo_upload, informational — NOT counted for finalization gate)

Finalization message stays at section granularity: *"Faltan fotos en Acceso"* — not split between general/keys. The keys photo field is supplementary; only `access_photos` counts toward the photo-required gate (logic in `getPhotoCountsBySection` already aggregates by section, so we ensure validation reads only the primary `access_photos` field, OR accept either — simpler: any photo in the Acceso section satisfies the gate).

**Decision**: any photo uploaded within the Acceso section satisfies the gate (current section-level aggregation behavior). Keeps validation message simple and matches business intent.

---

## Refinement 5 — Document scope of changes

In `AdminSettings.tsx`, add an `Alert` at the top of the Generation Rules page:

> **Alcance de cambios estructurales:** Las reglas documentadas aplican a inspecciones **recién generadas**. Las inspecciones existentes conservan la estructura con la que fueron creadas. Para actualizar una inspección legacy a la nueva estructura se requerirá una herramienta administrativa de regeneración (pendiente).

Also annotate the new "Fotos al finalizar" column header with a tooltip explaining it's enforced only at submission, not between sections.

---

## Files touched (5, unchanged from prior plan)

| File | Refinement applied |
|---|---|
| `src/lib/inspection-generator.ts` | Introducción as context-only with optional observation; Acceso field ordering with keys subgroup |
| `src/lib/section-completion.ts` | Photo whitelist; section-level granularity for missing-photo labels |
| `src/lib/inspection-status-guard.ts` | New `isInspectorReadOnly(status)` helper (verified status set) |
| `src/pages/inspector/InspectorInspectionDetail.tsx` | Use shared read-only helper; persistent signature; per-section missing-photo list |
| `src/pages/inspector/InspectorSectionComplete.tsx` | True read-only rendering (static badges, plain text, no upload/delete affordances, no completion CTA); intro briefing header |
| `src/pages/admin/AdminSettings.tsx` | Scope alert; "Fotos al finalizar" column with tooltip; updated section notes |

No DB migrations. Existing inspections retain stored structure (documented).

