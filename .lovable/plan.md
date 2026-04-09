

# Plan: Mandatory Matrix Items + Property Summary Redesign

## Summary

Two changes: (1) enforce all status-matrix items as mandatory in validation logic, (2) redesign PropertyBriefingCard into grouped themed blocks for better hierarchy and readability.

---

## Change 1: Mandatory evaluation items

### File: `src/lib/section-completion.ts`

**Current**: `canCompleteSection` checks that *at least one* status field has a value (`someField.some(...)`).

**New**: Check that *every visible status field* has a non-null, non-empty value (`every` instead of `some`).

```typescript
// Change from:
const hasStatus = statusFields.some(f => f.value_text !== null && f.value_text !== '');
// To:
const allAnswered = statusFields.every(f => f.value_text !== null && f.value_text !== '');
```

Update the error message and add a count of unanswered items:
```typescript
if (!allAnswered) {
  const unanswered = statusFields.filter(f => !f.value_text).length;
  return {
    valid: false,
    reason: `${unanswered} elemento(s) sin respuesta. Selecciona un estado para cada uno.`,
  };
}
```

### File: `src/pages/inspector/InspectorSectionComplete.tsx`

Add visual feedback for unanswered items when validation fails:
- When `validationError` is set, highlight unanswered status-matrix items with a red ring/border
- Track which fields are unanswered and apply `ring-destructive` to their container

This requires:
- A new state `unansweredFields: Set<string>` populated when validation fails
- In `renderField` for status grid items, apply red ring when field.id is in the set
- Clear the set when user selects any option

---

## Change 2: PropertyBriefingCard redesign

### File: `src/components/PropertyBriefingCard.tsx` — full rewrite

Reorganize from flat grid of mini-cards into 4 themed blocks:

**Block A — Header (existing, enhanced)**
- Property name (large)
- Address with map pin
- Status badge + inspection type badge
- Inspector + Executive names (if available)

**Block B — Key Dates**
- Dedicated card with calendar icon accent
- `Recolección de llaves / inspección` — prominent
- `Término de contrato` — secondary
- Clear date formatting with relative context

**Block C — Property Details**
- Single compact card with icon+label+value rows
- ID propiedad, Tipo, Mercado, Torre, Nº Dpto/Casa
- Bodega / Estacionamiento if present in snapshot

**Block D — Contact & Actions**
- Tenant name + phone
- WhatsApp CTA button (prominent, green accent)
- "Cómo llegar" button
- Both as full-width action buttons

Layout uses `space-y-3` between blocks instead of a 2-col grid of identical mini-cards. Each block has clear visual hierarchy with section labels.

---

## Files affected

| File | Change |
|---|---|
| `src/lib/section-completion.ts` | `some` → `every` + better error message |
| `src/pages/inspector/InspectorSectionComplete.tsx` | Red ring on unanswered items when validation fires |
| `src/components/PropertyBriefingCard.tsx` | Full redesign into 4 themed blocks |

3 files. No migrations.

