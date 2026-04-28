# Executive Review Workspace — UI/UX Cleanup Pass (Refined)

Scope is strictly **hierarchy + saturation reduction**. No business logic, no feature removal — every existing capability stays accessible.

## Step 1 — Diagnosis

Sources of visual noise in the current Executive workspace:

1. **Top header** — three dense rows in one strip mixing identity, actions, deposit, owner totals, tenant totals, two `Cotización` ghost buttons, total general, deposit diff, contractor selector, contractor cost, utility, inspector progress, and warning badges. Every chip carries similar weight and `bg-border` separators compete with the data.
2. **Repair cards** — `border-2` containers with header + oversized `Textarea` + a bordered/tinted `Responsable / Tipo` pill block + 3-or-5 column input grid + notes input + subtotal divider. Each card reads like a mini-form.
3. **`Responsable` / `Tipo` pills feel too dominant** — they sit inside a visible `border` + `bg-muted/40` chip container before pricing, occupying horizontal space the pricing grid should own. Visually they read as primary controls instead of metadata.
4. **Left rail** — duplicate signals per row: red dot + `SectionStatusBadge` + photo count + repair count + a second red dot for the same missing-observation condition.
5. **Right rail** — uppercase tracking-wider photo header + featured image with `ring-2` thumbnails + a separate `Card` with `ring-1 shadow-sm` for the section subtotal. Two visually heavy boxes stacked.
6. **Center column** — observations use two different colored backgrounds, then the repairs `Card` re-asserts strong color emphasis with `border-l-4 border-l-primary`.

---

## Step 2 — Fix Plan

### 2.1 Header — split identity from finance, demote secondary actions

Two clean rows, no vertical `bg-border` separators:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ←  Property name · status badge      [Devolver] [Aprobar] [Publicar] │  Row 1 (h-14)
│    address · inspector progress (Clock 11/15 · 2h ago)               │
├──────────────────────────────────────────────────────────────────────┤
│ ┌Depósito┐ ┌Propietario┐ ┌Inquilino┐ ┌Total general┐  Cotización ▾  │  Row 2
│ │ $X     │ │ $X         │ │ $X      │ │ $X           │ Contratista ▾ │
│ │        │ │ +Opc $X    │ │ +Opc $X │ │ vs depósito  │               │
│ └────────┘ └────────────┘ └─────────┘ └──────────────┘               │
└──────────────────────────────────────────────────────────────────────┘
```

**Summary blocks (refinement #2 — keep extremely concise):**
- Each block is rounded with very subtle `bg-muted/40`, no shadow, no rings.
- Exactly **three lines max** per block:
  - tiny uppercase label (`text-[10px] text-muted-foreground tracking-wide`)
  - one main value (`text-sm font-mono font-semibold`)
  - at most one short secondary line (`text-[10px] text-muted-foreground`) — e.g. `+Opc $X` for owner/tenant blocks, `vs depósito ±$X` for total
- Owner/tenant blocks: `Oblig. $X` is the main value; `+Opc $X` is the secondary line. Never put `Oblig./Opc./Total` on one inline string.
- **Total general** is the only block tinted with `bg-primary/10 text-primary` — single strong emphasis per region.

**Quotation actions:** consolidate the two ghost buttons into a single `DropdownMenu`: `[FileText] Cotización ▾` → items `Propietario`, `Inquilino`. Calls existing `setQuotationDialog({ open: true, payer })`.

**Contractor selector (refinement #3):** Used once per inspection then mostly static — qualifies as infrequent. Use a `Popover` trigger that **stays visible at all times in a quiet compact form**:
- When unset: ghost button `[Wrench] Asignar contratista` (`text-xs text-muted-foreground`).
- When set: ghost button `[Wrench] {contractorName}` with the same quiet styling — still visible, never hidden behind a state.
- Popover content holds the `Select`, plus contractor cost + utility readouts (only meaningful once a contractor is assigned). Defaults closed; opens on click.

**Row 3 blocker indicators:** keep functionality, but render as **a single muted strip** — one `AlertTriangle` icon + a single sentence (`text-tiny text-muted-foreground`) that concatenates active warnings (e.g. `2 observaciones finales pendientes · sin contratista · sin publicar`). Replaces the multiple colored Badge variants.

### 2.2 Repair card — simplify and demote classification

Repairs `Card` parent: drop `border-l-4 border-l-primary`. Plain `Card` with `border` only and `p-3`.

Each repair item becomes:

```text
┌─────────────────────────────────────────────────────┐
│ Title                                       👁  🗑   │
│ category · subdued                                  │
│                                                     │
│ Descripción (rows=1, autogrow, text-xs)             │
│                                                     │
│ Cant.[__]  Cliente[___]  Contratista[___]  Sub $X  │
│                                                     │
│ Notas [_______________]                             │
│ ─────────────────────────────────────────────────── │
│ Propietario ▾   ·   Obligatoria ▾                   │  ← inline secondary
└─────────────────────────────────────────────────────┘
```

- Container: `rounded-md border border-border/60 bg-card p-3 space-y-2.5`. Hidden items: `opacity-60 border-dashed`.
- Title `text-sm font-medium`; category `text-xs text-muted-foreground`.
- Icon buttons: `text-muted-foreground hover:text-foreground` (lower visual weight).
- Description `Textarea`: `rows={1}` with `min-h-[36px] resize-none text-xs` plain border.
- Pricing grid: `gap-2`, all inputs `h-8 text-xs font-mono`, labels become `text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5`. Subtotal and Utilidad are read-only spans with `h-8` aligned right.
- Notes input stays as a single compact `h-8 text-xs` row (kept, just demoted in size) — preserves functionality.

**`Responsable` / `Tipo` controls (refinement #1) — secondary but clearly interactive:**
- Render as **two `DropdownMenu` triggers** at the bottom of the card, separated by a thin `border-t border-border/40 pt-2`.
- Each trigger is a small button: `text-xs text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted/40 transition-colors`.
- Each shows the current value followed by a **visible `ChevronDown` caret** (`h-3 w-3 opacity-60`): e.g. `Propietario ▾`, `Obligatoria ▾`.
- Subtle but unmistakably interactive: pointer cursor, hover background, hover text-color shift, visible caret. Removes the bordered/tinted pill container entirely so they read as metadata, not CTAs.
- Same business calls: `onUpdateRepair(id, 'payer_role'|'payment_nature', value)`.

Section subtotal at bottom of repairs card: `text-sm` (not `text-body font-semibold`) with `border-t border-border/40` divider.

### 2.3 Left sidebar — one signal per row

Each section button:
- Single line: `section name … SectionStatusBadge`.
- Optional muted counter on the right *only when meaningful*: `· 3` for repair count (`text-[10px] text-muted-foreground`). Photo count icon is dropped here (photos are visible in the right panel).
- Drop the second indicator row and the duplicate red dot. Status badge already encodes "missing observation" via section status; the bottom aggregate "Faltan observaciones en N secciones" stays as the single rollup signal.
- Signature block: drop tinted backgrounds. Plain `border` card with the icon colored by status; text stays neutral.

### 2.4 Right sidebar — flatten

- `PhotoPanel`: drop the uppercase tracking-wider label. Header becomes `Fotos · {count}` in `text-xs text-muted-foreground`. Active thumbnail uses `border` (not `ring-2`), inactive uses `border-transparent`.
- Section subtotal Card → plain inline block, no Card / ring / shadow:
  ```
  Subtotal sección
  $X     ·   N reparaciones
  ```
  Implemented with `space-y-1 pt-3 border-t border-border/40`.

### 2.5 Center column — calmer observations

- Both observation panels (Inspector + Final): single shared `border border-border/60 rounded-lg p-3` look. Drop `bg-accent/30` and `bg-status-good/5 ring-1`. Differentiate via small label only.
- "Pública" Badge → plain `text-[10px] text-muted-foreground` (no Badge).
- Internal note: keep, with `text-xs` label and matching neutral container.

### 2.6 Saturation principles applied throughout the file

- Replace `ring-1 ring-border shadow-sm` on inner cards with plain `border border-border/60`.
- Soft dividers: `border-border/40`. Containers: `border-border/60`.
- Limit strong tints to one element per region (header total chip; status badges; the consolidated blocker strip).
- Standardize repair editor sizing: inputs `h-8`, labels `text-[10px] uppercase`, body `text-xs`.

---

## Refinements summary

1. **`Responsable ▾` / `Obligatoria ▾`** — `DropdownMenu` triggers with pointer cursor, hover bg + text shift, and a visible `ChevronDown` caret. Secondary in weight, unmistakably interactive.
2. **Header summary blocks** — strict 3-line ceiling: label / main value / one short secondary line. No inline `Oblig. · Opc. · Total` strings.
3. **Contractor selector** — kept always visible in a quiet compact ghost-button form (`[Wrench] {contractorName}` or `Asignar contratista`); the heavier select + cost + utility readouts live inside its `Popover`.
4. **Scope** — purely hierarchy/saturation; every feature (return mode, approve, publish, contractor select, contractor cost, utility, deposit diff, blockers, photo visibility, classification) stays fully accessible.

---

## Files to modify

- `src/pages/executive/ExecutiveReviewDetail.tsx` — header, sidebars, `SectionWorkspace`, `PhotoPanel`.
- New imports from existing UI primitives only: `DropdownMenu*` (`@/components/ui/dropdown-menu`), `Popover*` (`@/components/ui/popover`), `ChevronDown` from `lucide-react`.

## Out of scope (unchanged)

- Business logic: `budgetBreakdown`, totals, `onUpdateRepair`, contractor pricing, deposit diff math.
- Section completion, approval/return, publish flow.
- Mobile fallback layout (no structural rework).
- `QuotationDialog` content.
- Database schema, RLS, types.

## Final summary will cover

- Header: two rows, 4 concise summary blocks (3-line max), single `Cotización ▾`, contractor as quiet always-visible popover, blocker badges consolidated.
- Repair cards: lighter container, compact description, tighter pricing row, classification demoted to `Propietario ▾ · Obligatoria ▾` dropdown triggers.
- `Responsable` / `Tipo`: secondary metadata look with caret + hover state — clearly interactive without competing with primary content.
- Left rail: one status signal per row + optional repair counter.
- Right rail: flat photo header, plain inline subtotal.
- Overall: one strong emphasis per region; soft borders replace rings/shadows; tinted backgrounds removed except where they communicate the single most important value in a region.
