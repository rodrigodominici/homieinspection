# shared/ui — Homie Inspection Design System

Canonical primitives aligned with the **Homie Admin Portal** DS (source of truth).

## Tokens

All colors in `src/index.css` are HSL. Use semantic tokens — never inline hex.

| Token group | Examples |
|---|---|
| Brand | `primary`, `accent`, `primary-soft`, `secondary` |
| Surfaces | `background` (#F4F7FE), `card`, `muted`, `popover` |
| Borders | `border` (#DBD1CA warm), `input`, `ring` |
| Status | `--status-{pending,in-progress,needs-changes,approved,published,blocked}-{bg,fg}` |
| Homie extended | `homie-{green,orange,yellow,pink,taupe,soft-green,soft-blue,neutral-warm}` |

## Semantic color rules

| Color | Meaning |
|---|---|
| Green (`accent` / `homie-soft-green`) | success / approved |
| Orange (`homie-orange`) | warning — action *may* be needed |
| Red (`destructive`) | blocked / error — action impossible or critical |
| Blue (`primary` / `homie-soft-blue`) | informational / pending |
| Neutral (`muted`) | draft / not started |

## Badge variants

| Variant | Use |
|---|---|
| `solid`   | state of the system (e.g. `submitted`, `approved`) |
| `soft`    | attribute of the item (e.g. property type) |
| `outline` | active filter |

## Layout rules

- One primary CTA per screen. Everything else `secondary` / `ghost`.
- `DetailSheet`: **never stack** two open at once.
- Use `StickyActionBar` for primary CTAs on long forms / detail pages.
- `PageHeader` is the single source for page titles. No ad-hoc `<h1>` in pages.

## Components

| Component | Purpose |
|---|---|
| `PageHeader` | Title + description + breadcrumb + actions slot |
| `FiltersBar` | Filter container; supports `sticky` |
| `KpiCard` | Metric card with optional trend chip |
| `StatusBadge` | Backed by `StatusRegistry` — replaces 14+ ad-hoc maps |
| `EmptyState` | Empty list / no results |
| `AlertCallout` | Inline alert: `info / success / warning / danger` |
| `LoadingState` | Skeleton rows |
| `ErrorState` | Standardized error w/ retry |
| `StickyActionBar` | Sticky CTA bar (mobile + desktop) |
| `ConfirmDialog` | Replaces `window.confirm()` |
| `DetailSheet` | Side drawer with size variants |
| `DataTable` | Composed table with sortable headers + clickable rows |

## Status registry

`status-registry.ts` is the single source of truth for status visuals and
semantics. Any new status must be added there — never invent labels/colors
inside a component.
