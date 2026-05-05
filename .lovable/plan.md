# Executive inspections list — role-based UX consistency pass

All edits in `src/pages/executive/ExecutiveReviewQueue.tsx`. No data, RLS, schema, or routing changes.

---

## Step 1 — Diagnosis

### 1.1 Competing visual signals today

Each card emits ~5 signals at similar weight:
- Main status badge (`En revisión`, `Asignada`…)
- A second warning pill `⚠ N obs. pendientes` rendered with the same `Badge` weight as the main status
- A full-card amber ring + dashed border + tinted background for `Por coordinar`
- A second amber inline `Término de contrato: …` line
- Progress bar + raw `13/13` fraction shown for every card with sections (even non-actionable ones)

The eye cannot tell which is the case state, which is the reviewer task, and which is just context.

### 1.2 Why the hierarchy is still noisy

- Two pills compete on row 1 (`En revisión` + `9 obs. pendientes`)
- `Por coordinar` cards visually shout louder than `En revisión` cards because of full-card ring+bg, even though the executive cannot act on them
- Progress fraction `0/11` doesn't say "secciones" — reads as a generic ratio
- Section grouping (`Requieren revisión`, `En curso`, `Publicadas recientemente`, `Otras inspecciones`) does not make the actionable / context split obvious; `En curso` and `Otras` both contain non-actionable items
- `viewMode` toggle (list vs calendar) duplicates the date grouping and overlaps with `/executive/schedule`

### 1.3 Why `Por coordinar` should be demoted for Executive

`Por coordinar` means: no key-collection date is set yet. The owner of that task is **admin** (coordination) — the executive cannot review, approve, or publish anything until it advances. Strong amber emphasis miscommunicates urgency to the wrong role. It should remain visible as context (the executive may want to know "X is still uncoordinated") but read as backlog, not as a task.

### 1.4 Calendar toggle redundancy

- The list already groups by date when sorted by key collection
- A dedicated `/executive/schedule` agenda exists in the sidebar (`ExecutiveLayout`)
- The executive's primary work is review/approval/publication, not calendar planning

→ Remove the toggle on this screen. Keep date context inside the list via grouping.

---

## Step 2 — Implementation

### 2.1 One main badge + secondary warning text

In `InspectionRow` (lines ~430–447):

- Row 1 contains **only** the property name + the main status badge.
  - For uncoordinated: main badge becomes a soft neutral `secondary` Badge `Por coordinar` (no amber). Not the strong amber pill.
  - Otherwise: `<InspectionStatusBadge />` as today.
- Drop the second `Badge` for `N obs. pendientes`.
- Add a new dedicated **secondary warning line** under the meta row (only when relevant):

  ```tsx
  {missingObs > 0 && (
    <p className="text-tiny text-[hsl(var(--status-regular))] flex items-center gap-1">
      <AlertTriangle className="h-3 w-3" />
      {missingObs} observaciones finales pendientes
    </p>
  )}
  ```

  Plain text, muted accent — clearly secondary to the badge.

### 2.2 Explicit progress wording + conditional bar

Replace `{progress.completed}/{progress.total}` with:

- `13 de 13 secciones revisadas` (when `bucket === 'review'` or `published`)
- `0 de 11 secciones completadas` (when `bucket === 'active'`)

Show the **progress bar only for actionable buckets** (`review`, `active`). Hide bar for `other` (backlog/uncoordinated/not-started); show only the wording line if useful, otherwise omit entirely.

### 2.3 Demote `Por coordinar` visually

In the card wrapper:
- Remove the `ring-2 ring-amber-300 border-dashed bg-amber-50/30` branch.
- All cards use the same neutral container: `ring-1 ring-border`.
- Inside the meta row, the contract-end inline pill becomes a plain muted line:
  `Término de contrato: 12 nov 2026` (no amber color, no key icon emphasis).
- "Por coordinar" badge style: `variant="secondary"` with `text-muted-foreground` — soft, not warning.

### 2.4 Reorganize sections by executive actionability

Replace the four current buckets with a clearer two-tier structure:

```text
ACCIONABLE AHORA
  • Para revisar           (status in submitted | in_review)
  • Listas para publicar   (status === 'approved' && !published_at)

CONTEXTO Y SEGUIMIENTO
  • Publicadas recientemente   (published in last 30 days)
  • En curso del inspector     (started_at && status in assigned|in_progress)
  • Sin coordinar              (no key date && contract end exists)
  • Otras                      (everything else)
```

Implementation:
- Replace `getBucket` with `getExecutiveBucket` returning one of: `to_review | to_publish | published | in_field | uncoordinated | other`.
- Render two visually distinct groups using a small `<GroupHeader tone="primary|muted">` heading:
  - `ACCIONABLE AHORA` — primary-tinted uppercase label
  - `CONTEXTO Y SEGUIMIENTO` — muted uppercase label
- Each subsection keeps the existing `BucketSection` but with the new labels.

### 2.5 State-aware CTA wording

Refine `getContextualCTA`:

| Condition | Label | Variant |
|---|---|---|
| published && missingObs === 0 | `Abrir reporte` | outline |
| published && missingObs > 0 | `Republicar` | secondary |
| status === 'approved' && !published | `Publicar` | default |
| status === 'in_review' | `Continuar revisión` | default |
| status === 'submitted' | `Revisar` | default |
| started_at (in_field) | `Ver progreso` | outline |
| uncoordinated / not started | `Ver detalle` | outline |

Only change vs today: split `submitted` vs `in_review` so the executive sees `Continuar revisión` once review is engaged.

### 2.6 Remove calendar toggle, keep date context

- Remove `viewMode` state, `persistViewMode`, the `List`/`CalendarDays` toggle UI (lines ~298–307), and the `viewMode === 'calendar'` branch.
- Drop the `localStorage` key `executive-queue-view`.
- Keep `sortKey` (including the key-collection sort options) — that already gives the executive a temporal lens without a separate calendar mode.
- When `sortKey` is one of `keys-asc | keys-desc`, render the list with **lightweight date dividers** (`Hoy`, `Mañana`, `Esta semana`, `Próximas`, `Sin coordinar`) inside the existing buckets — preserves date awareness without duplicating `/executive/schedule`.
- Keep imports for `isToday`, `isTomorrow`, etc.; drop `List`, `CalendarDays`.

### 2.7 Minor cleanup

- `KPICard` and filter bar unchanged.
- Inline code comment near `getExecutiveBucket` explaining the role-based grouping rationale (so future contributors don't reintroduce admin-style urgency).

---

## Files touched

- `src/pages/executive/ExecutiveReviewQueue.tsx` — `getBucket` → `getExecutiveBucket`, `InspectionRow` rendering, bucket sections, removal of calendar toggle, CTA refinements.

No new components extracted; no new dependencies; no DB / RLS changes.

---

## Resulting UX summary

- **Card hierarchy:** Row 1 = name + single main badge. Row 2 = address + market/type. Row 3 = relevant date / explicit progress wording. Row 4 = secondary warning text (only if applicable). CTA = state-aware action.
- **Still emphasized for executives:** `Para revisar`, `Continuar revisión`, `Listas para publicar`, pending final observations (as secondary warning text under an actionable card).
- **Demoted to context:** `Por coordinar` (no amber ring, soft secondary badge), `En curso del inspector`, `Publicadas` (>30d), generic `Otras`.
- **Calendar toggle removed** from this screen; the dedicated `/executive/schedule` page remains the calendar surface.
- **Date context preserved** via key-collection sort + lightweight date dividers (`Hoy`, `Mañana`, `Esta semana`, `Próximas`, `Sin coordinar`) inside the actionable/context groups.
