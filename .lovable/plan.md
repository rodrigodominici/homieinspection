

# Plan: Tenant Signature as Prerequisite Workflow Step

## Problem

Currently, the signature step is triggered AFTER the "Revisar y enviar" confirmation dialog. The correct flow requires it to be a **prerequisite** before submit becomes available.

## Current flow (wrong)
1. All sections complete → "Revisar y enviar" CTA
2. Click → confirmation dialog → confirm → signature overlay → then submit

## Target flow (correct)
1. All sections complete → "Firma del inquilino" CTA
2. Click → signature overlay
3. After signature resolved → "Revisar y enviar" CTA appears
4. Click → confirmation dialog → submit

---

## Changes

### 1. `src/pages/inspector/InspectorInspectionDetail.tsx`

**Add signature status fetch on mount**: Query `inspection_signatures` for existing record to determine if signature step is already resolved.

**New state**: `signatureResolved: boolean` — true if an `inspection_signatures` record exists for this inspection.

**Three-state bottom bar logic**:
- `!allCompleted` → "Continuar/Iniciar Inspección"
- `allCompleted && !signatureResolved` → "Firma del inquilino" (opens signature overlay)
- `allCompleted && signatureResolved` → "Revisar y enviar" (opens submit dialog)

**After signature confirmed**: Set `signatureResolved = true`, close overlay. Do NOT auto-submit.

**Submit dialog**: Only accessible when `signatureResolved === true`. On confirm, calls `doSubmit()` directly (no signature step).

Remove the current `handleSubmit` → `setShowSignature(true)` pattern.

### 2. `src/pages/executive/ExecutiveReviewDetail.tsx`

Add signature status display. Fetch `inspection_signatures` record. Show a small badge/card in the review context:
- "Firmado" (green) with signer name
- "Se negó a firmar" (red) with reason
- "No disponible" (amber) with reason

### 3. No other file changes needed

- `SignaturePad.tsx` — already correct, no changes
- `AdminInspectionDetail.tsx` — already shows signature, no changes
- `OwnerReport.tsx` — already excludes signature, no changes
- Database — `inspection_signatures` table already exists with correct schema

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/pages/inspector/InspectorInspectionDetail.tsx` — restructure flow to gate submit on signature |
| Edit | `src/pages/executive/ExecutiveReviewDetail.tsx` — add signature status display |

2 file changes.

