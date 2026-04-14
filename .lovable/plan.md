

# Plan: Pricing Matrix Tab for Repair Catalog

## Summary

Add a "Matriz de Precios" tab to AdminRepairCatalog with a spreadsheet-style table. Each row = repair item, dynamic columns per active contractor (price + margin). Inline editing with debounced save + feedback. Same filters as Reparaciones tab. 1 file changed, no migrations.

---

## Table layout

```text
┌──────────────────────┬───────────┬──────────┬─────┬─────┬──────────────────┬──────────────┬─────┐
│ Reparación (sticky)  │ Cat.      │ Base ($) │ Mon │ Mkt │ Max Soluc. ($)   │ Mg Homie     │ ... │
│ (sticky col 1)       │(sticky 2) │ editable │     │     │ editable         │ auto         │     │
├──────────────────────┼───────────┼──────────┼─────┼─────┼──────────────────┼──────────────┼─────┤
│ Pintura interior     │ Pintura   │ [500.00] │ MXN │ MX  │ [350.00]         │ $150 (30.0%) │     │
└──────────────────────┴───────────┴──────────┴─────┴─────┴──────────────────┴──────────────┴─────┘
```

- **Sticky**: Both Reparación (col 1) and Categoría (col 2) stick left
- **Sticky header**: thead uses `position: sticky; top: 0`
- **Contractor columns**: Grouped with a colored header band per contractor; name truncated with tooltip via `title` attr + `truncate` class
- **Margin display**: Two lines per cell — `$150` on top, `30.0%` below, green if positive, red if negative

## Margin formula

```
margin_amount = base_price - contractor_price
margin_pct = base_price > 0 ? ((base_price - contractor_price) / base_price * 100) : 0
```

## Data loading

On tab mount, bulk-fetch all `repair_catalog_item_contractor_prices` and index as `Map<item_id, Map<contractor_id, ContractorPrice>>` for O(1) lookups.

## Inline editing with save feedback

- Each editable cell uses local state + 500ms debounce
- Cell shows a subtle indicator: spinner while saving, green check on saved (fades after 1.5s), red dot on error
- Base price → `update repair_catalog_items.base_price`
- Contractor price → `upsert repair_catalog_item_contractor_prices` (insert if missing, update if exists)

## Filters

Reuse the existing `search`, `filterCategory`, `filterActive` state. The same filter bar renders above the matrix (shared across Reparaciones and Matriz tabs by lifting it above `TabsContent` or duplicating it inside both tabs).

## Desktop-first

No mobile-specific overrides. The table scrolls horizontally. Min column widths enforced. No responsive collapse.

---

## Implementation detail (single file)

| File | Change |
|---|---|
| `src/pages/admin/AdminRepairCatalog.tsx` | Add "Matriz de Precios" tab trigger + content. Add: bulk price fetch, `allContractorPrices` state (Map), `MatrixCell` inline-editing component with debounce + save status indicator, margin calculation, sticky CSS, contractor name tooltip truncation. Move filter bar above TabsContent so it applies to both tabs. |

1 file. No migrations.

