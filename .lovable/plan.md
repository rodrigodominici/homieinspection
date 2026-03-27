

# Plan: warranty_deposit as Payload-Derived Read-Only Value

## Changes

### 1. `src/lib/types.ts`
Add `warranty_deposit?: number` to `PropertyPayload` interface.

### 2. `src/lib/inspection-generator.ts`

**`normalizePropertySnapshot()`** — add line:
```ts
warranty_deposit: payload.warranty_deposit ?? null,
```

**Example payloads** — add `warranty_deposit` to some, omit from others:
- `studio`: add `warranty_deposit: 350000`
- `twoBedTwoBath`: add `warranty_deposit: 850000`
- `fullFeatures`: add `warranty_deposit: 1500000`
- `houseWithYard`: omit (tests "not available" state)
- `unscheduled`: omit (tests "not available" state)

### 3. Executive workspace (future Phase 1 rewrite)
No code change now — document the contract: read via `getEffectiveSnapshot(inspection).warranty_deposit`. Display as "Depósito en garantía". Handle `null` as "No disponible".

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/lib/types.ts` — add `warranty_deposit` to `PropertyPayload` |
| Edit | `src/lib/inspection-generator.ts` — snapshot normalization + example payloads |

2 file changes. No migration.

