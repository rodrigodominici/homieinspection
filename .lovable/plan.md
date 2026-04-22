

# Plan — Surface tenant/contact data in Admin inspection detail

## Step 1 — Diagnosis

**Tenant/contact fields shown to the Inspector**

The inspector view renders `PropertyBriefingCard`, whose Block D ("Datos de contacto") shows when any contact data is present:

- `tenant_name` (snapshot/overrides) — Inquilino
- `tenant_whatsapp` (snapshot/overrides) — WhatsApp call icon + bottom WhatsApp CTA
- `recipient_email` (snapshot/overrides) — Correo receptor
- `address` — "Cómo llegar" (Google Maps) CTA

**What's available to the Admin but not surfaced reliably**

The Admin detail (`AdminInspectionDetail.tsx` line 1012) already mounts the same `PropertyBriefingCard`, so technically the same Block D renders. **However**, that block is conditionally hidden when `tenant_name`, `tenant_whatsapp`, `recipient_email`, and `address` are all empty (`PropertyBriefingCard.tsx` line 137: `(hasContact || address) && …`). Confirmed against the current inspection (`ba73cc25-…`): all three tenant fields are `null` in `property_snapshot_json`, so the admin sees no tenant block at all and has no signal that the data is simply missing from REM/HubSpot.

So the gap is twofold:
1. When tenant data exists, it IS already shown to the admin via PropertyBriefingCard — but tucked at the bottom of "Datos del inmueble", easy to miss.
2. When tenant data is missing, the admin gets zero indication, making it impossible to spot "tenant info not synced" from the detail view.

**Best place to surface in the Admin UI**

A dedicated, always-visible **"Datos del arrendatario"** card placed immediately after the existing "Datos del inmueble" card and before "Firma del Inquilino". It must:
- Always render (so missing data is visible as "No disponible").
- Be read-only (no edits, no inspector-style action CTAs).
- Reuse the same source of truth (`getEffectiveSnapshot(inspection)` → snapshot + overrides merge), keeping inspector/admin aligned.

## Step 2 — Fix

### A. New component: `src/components/AdminTenantContactCard.tsx`

Read-only card, always rendered. Layout:

- Header: `User` icon + "Datos del arrendatario", with a one-line subtitle: "Sincronizado desde REM. Solo lectura."
- Three rows (always rendered, with "No disponible" muted placeholder when empty):
  - **Inquilino** — `tenant_name`
  - **WhatsApp** — `tenant_whatsapp` (rendered as a `tel:` link when present so admins can copy/click; no inspector-style WhatsApp message CTA, since admin context is coordination, not field outreach)
  - **Correo receptor** — `recipient_email` (rendered as a `mailto:` link when present)
- If all three are missing, append a small muted hint: "El inquilino no se ha sincronizado desde REM/HubSpot todavía."

Source: `getEffectiveSnapshot(inspection)` from `@/lib/inspection-utils` — exactly what `PropertyBriefingCard` uses, guaranteeing parity.

Styling matches the surrounding admin cards: `border-0 ring-1 ring-border shadow-sm`, `CardHeader` with `text-base` title + subtitle, `CardContent` with the read-only rows.

### B. Mount in Admin detail

In `src/pages/admin/AdminInspectionDetail.tsx`, insert `<AdminTenantContactCard inspection={inspection} />` immediately after the "Datos del inmueble" card (after line 1014) and before the signature card. No other changes to the page.

### C. Inspector view stays unchanged

The inspector continues to use `PropertyBriefingCard` Block D as today, which is the correct UX for the field role (action-oriented WhatsApp/Maps CTAs). The new admin card is intentionally separate because admin needs always-visible read-only context, not field actions.

## Files touched

- `src/components/AdminTenantContactCard.tsx` — new read-only card.
- `src/pages/admin/AdminInspectionDetail.tsx` — one import + one render line after the existing "Datos del inmueble" card.

## Verification

1. On an inspection with tenant data: admin sees a new "Datos del arrendatario" card with name, WhatsApp (clickable `tel:` link), email (clickable `mailto:` link).
2. On the current inspection (`ba73cc25-…`, no tenant data): admin sees the card with three "No disponible" rows + the muted hint about REM sync.
3. Inspector view is visually unchanged — Block D in `PropertyBriefingCard` still works as before.
4. Same source (`getEffectiveSnapshot`) used by both views → values stay consistent across roles.

## Summary deliverable

- **Fields added to Admin**: `tenant_name`, `tenant_whatsapp` (as `tel:` link), `recipient_email` (as `mailto:` link), with explicit "No disponible" placeholders.
- **Where**: a new dedicated read-only card titled "Datos del arrendatario", placed right under the existing "Datos del inmueble" card in the Admin inspection detail.
- **Alignment**: same data source as the inspector's PropertyBriefingCard Block D (`getEffectiveSnapshot`), so admin and inspector always see the same tenant values; admin variant is always visible and read-only, inspector variant keeps its action CTAs.

