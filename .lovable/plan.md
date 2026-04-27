# Plan — Budget responsibility classification (Propietario/Inquilino · Obligatoria/Opcional)

Inspection-level only. The repair catalog stays neutral.

## 1. Data model (migration)

Add two columns to `public.inspection_repair_items`:

- `payer_role text NOT NULL DEFAULT 'owner'` — values: `'owner' | 'tenant'` (CHECK constraint)
- `payment_nature text NOT NULL DEFAULT 'required'` — values: `'required' | 'optional'` (CHECK constraint)

Defaults backfill existing rows to **Propietario + Obligatoria**, matching today's implicit behavior.

No changes to `repair_catalog_items`, `repair_catalog_categories`, or contractor pricing tables.

## 2. Types

Extend `InspectionRepairItem` in `src/lib/types.ts`:

```ts
payer_role: 'owner' | 'tenant';
payment_nature: 'required' | 'optional';
```

## 3. Executive editor UI (`ExecutiveReviewDetail.tsx`)

Inside each repair card in `SectionWorkspace` (lines 1064–1125), add a compact pill row directly under the title/description, before the qty/price grid:

- **Responsable**: `Propietario` | `Inquilino`
- **Tipo**: `Obligatoria` | `Opcional`

Implementation: pill-style toggle buttons styled with existing tokens (no new dependencies). Each click calls the existing `onUpdateRepair(repair.id, 'payer_role' | 'payment_nature', value)` — generic update path already persists and refetches.

Update `addRepairFromCatalog` (line 264) to insert explicit defaults (`payer_role: 'owner'`, `payment_nature: 'required'`).

## 4. Grouped totals — internal operational scope

The new grouped totals are **internal operational totals**: they aggregate **all** repair items in the inspection, regardless of `visible_to_owner`. Rationale: this is a budget management view for the executive; hiding items from the owner-facing public report should not distort the executive's true budget breakdown by payer/nature.

`visible_to_owner` continues to gate only:
- the published `inspection_report_versions.normalized_payload`
- the existing public-facing `clientTotal` used inside that payload

Replace the single `clientTotal` aggregation (lines 178–184) with a memoized `budgetBreakdown`:

```
ownerRequired, ownerOptional, tenantRequired, tenantOptional,
ownerTotal, tenantTotal, grandTotal
```

Plus a parallel set computed over `contractor_unit_price` for internal margin display.

### Sticky summary bar (lines 538–600)

Reorganize into two business-facing groups:

- **Propietario**: `Obligatorio $X · Opcional $Y · Total $Z`
- **Inquilino**: `Obligatorio $X · Opcional $Y · Total $Z`
- **Total general**: emphasized chip
- **Diferencia vs depósito**: compares `ownerRequired` against `warrantyDeposit` (only mandatory owner items are deposit-relevant)

Contractor cost / utility chips remain, computed over the same internal operational set.

## 5. Independent quotations

Add one `QuotationDialog` parametrized by payer, triggered from the top bar via two buttons:

- `Cotización Propietario`
- `Cotización Inquilino`

Reuses the same in-memory `allRepairs` — **no duplicated budgets, no extra DB writes**.

Each quotation renders:

- Property header (name, address)
- **Reparaciones obligatorias** — items with `payment_nature='required'` for the selected payer
- **Reparaciones opcionales** — items with `payment_nature='optional'` for the selected payer
- Per-item: title, description, qty × unit_price, subtotal
- Footer: `Subtotal obligatorias`, `Subtotal opcionales`, `Total`
- Actions: `Imprimir` (print stylesheet on the dialog body), `Copiar resumen` (plain text)

All copy stays business-facing in Spanish; no internal jargon (no "owner_required", no enum names) surfaces in the UI.

## 6. Published payload — model preparation only

`inspection_report_versions.normalized_payload` is enriched so each repair carries `payer_role` and `payment_nature`. This is **model preparation only** for this iteration.

`OwnerReport.tsx` is **not modified** in this iteration — the public report continues to render all visible repairs grouped by section as it does today. Future work can split the public report by payer without another schema change.

## 7. Scope boundaries (explicit)

- No changes to `repair_catalog_items`, `repair_catalog_categories`, or contractor pricing.
- No new tenant report route. Owner/tenant quotations are derived dialog views over the same inspection budget.
- No backfill beyond the column defaults (`owner` + `required`).
- Admin Inspection Detail repair listing (read-only summary) gets the same two read-only chips for parity, no editing UI.

## Technical summary

- **DB**: migration adds `payer_role` + `payment_nature` to `inspection_repair_items` with CHECK constraints and safe defaults.
- **Types**: `InspectionRepairItem` extended with the two unions.
- **Editor**: two pill toggles per repair card, persisted via existing `updateRepairItem`.
- **Totals**: `budgetBreakdown` memo aggregates over **all** repair items (internal operational totals); sticky bar reorganized into Propietario / Inquilino / Total general; deposit comparison rebased on `ownerRequired`.
- **Quotations**: single `QuotationDialog` parametrized by payer, business-facing copy, no DB duplication.
- **Published payload**: enriched with `payer_role` + `payment_nature` for future use; `OwnerReport.tsx` behavior unchanged this iteration.
