# Executive repair workflow — UI/UX consistency pass (refined)

## Diagnosis

1. **Global vs section repairs collide semantically.** Top bar shows `Reparaciones · N` and each section has `Reparaciones de esta sección`. Same word at two hierarchy levels — executive can't tell if the top button is a summary, alternate view, or duplicate. The top button currently just opens the section drawer of the first section with repairs.
2. **Contractor selector is unlabeled.** Renders only the contractor name (e.g. `Remodeling ▾`) as a ghost button. No label, same Wrench icon as the global Reparaciones button, no helper text explaining it sets the active contractor whose prices drive cost/utility.
3. **Section-level repairs block reads as informational.** A single full-width button with soft tint and a tiny "Editar →" — looks navigational, not operational. Count and subtotal are buried.
4. **Mobile per-section "Agregar reparación" CTA is detached.** Sits at the bottom of each section card, separated from any "Reparaciones" group.
5. **Mixed vocabulary at the top bar.** `Cotización`, `Reparaciones`, contractor name all coexist with no semantic distinction.

---

## Plan

All edits in `src/pages/executive/ExecutiveReviewDetail.tsx`. No data, RLS, or schema changes.

### 1. Top bar — relabel global button (lines ~673–696)

- Rename `Reparaciones` → **`Presupuesto`**.
- **Keep label concise.** `Total general` is already shown in the bar, so the button only carries an item count when present:
  - With items: `Presupuesto · N`
  - Empty: `Presupuesto`
- Do not add money to the button label.
- Behavior unchanged: opens the section drawer of the active section (or first section with repairs). This is a **temporary UX compromise** until a true global budget view exists — added as an inline code comment so future iterations can revisit.

### 2. Make the contractor selector explicit (lines ~698–740)

Replace the bare `Remodeling ▾` ghost trigger with an inline labeled control:

```text
Contratista activo:  [ Remodeling ▾ ]
```

- Inline `Label` ("Contratista activo") before the trigger.
- Trigger uses `outline` style (not ghost) so it reads as a control.
- Popover header helper copy: `Define los costos base del presupuesto`.
- Existing popover content (selector + cost/utility breakdown) kept as-is.
- When unset, trigger shows `Asignar contratista` with a subtle warning dot.

### 3. Strengthen section-level repairs block (lines ~1187–1220, in `SectionWorkspace`)

Convert the single-button strip into a real card:

```text
┌──────────────────────────────────────────────────────────┐
│ 🔧 Reparaciones de esta sección                          │
│    N reparaciones · Subtotal $XXX     [+ Agregar reparación] │
├──────────────────────────────────────────────────────────┤
│ • Repair title 1                       $YYY  ›          │
│ • Repair title 2                       $YYY  ›          │
└──────────────────────────────────────────────────────────┘
```

- Real card (border + bg), not a giant `<button>`.
- Header: title (semibold) + `N reparaciones · Subtotal $X` muted.
- Primary CTA `+ Agregar reparación` lives in the header (right side), `default size="sm"`, clearly belongs to the block.
- Body: **extremely compact** repair rows — `title · amount · chevron` only. No badges, descriptions, or extra metadata.
- Clicking a row opens the existing drawer focused on that repair (`setExpandedRepairId` + `setRepairsDrawerSectionId`).
- Empty state: muted line `Sin reparaciones. Agrega desde el catálogo.` plus the same `+ Agregar reparación` button.

### 4. Reorder section content for clear narrative (lines ~1180–1297)

Reflow `SectionWorkspace` top-to-bottom:

1. Section title + status badge
2. Status fields + other inspector data
3. Observación del Inspector (read-only)
4. Observación Final / Pública (editable)
5. Comentario Interno
6. **Reparaciones de esta sección** (now last — operational outcome of the review)

Currently the repairs block is rendered first; moving it to the end makes it read as the consequence.

### 5. Mobile / tablet alignment (lines ~896–1010)

- Mobile global summary card: rename header `Reparaciones` → `Presupuesto · N` to match the top bar.
- Section cards (mobile): wrap the repair list + `Agregar reparación` button in a clearly bordered subgroup with the same header pattern.
- **Header may stack across multiple lines on narrow widths** to avoid crowding:
  - line 1: `Reparaciones de esta sección`
  - line 2: `N reparaciones · Subtotal $X`
  - line 3: `[+ Agregar reparación]` (full-width on mobile)
- Use `flex-col sm:flex-row sm:items-center sm:justify-between` so it collapses gracefully.

### 6. Vocabulary unification

| Level | Term |
|---|---|
| Top-bar export | `Cotización` |
| Top-bar global repair entry | `Presupuesto · N` (temporary entry to first section drawer) |
| Active contractor control | `Contratista activo: <name>` |
| Section sub-block | `Reparaciones de esta sección` |
| Drawer title | `Reparaciones — <section name>` |

The bare word "Reparaciones" no longer appears at the top-bar level.

---

## Files touched

- `src/pages/executive/ExecutiveReviewDetail.tsx` — top bar (~655–740), `SectionWorkspace` (~1170–1298), mobile section cards (~896–1010).

No new dependencies, no extracted components, no DB / RLS changes.

## Resulting UX summary

- **Top bar:** `Total general` · `Cotización ▾` · `Presupuesto · N` · `Contratista activo: Remodeling ▾`. No duplicate "Reparaciones" word at two levels; `Presupuesto` label kept lean (count only).
- **Contractor selector:** explicitly labeled `Contratista activo`, framed as an `outline` control with helper copy.
- **Section repairs block:** real card with header (title + count + subtotal) + integrated `+ Agregar reparación` CTA + ultra-compact repair rows; placed last as the operational outcome. Header stacks vertically on narrow widths to avoid crowding.
- **Workflow clarity:** three distinct concepts — `Presupuesto` (global entry, temporary), `Contratista activo` (cost context), `Reparaciones de esta sección` (per-section editor).
