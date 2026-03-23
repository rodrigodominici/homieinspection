

# Plan: Admin Editing, Auth Redesign, Public URL Perf, Executive UX, Tenant Signature

## Summary
5 deliverables across 14 file changes and 2 database migrations.

---

## 1. Auth UI Redesign + Pending Approval Model

### Database migration
- Add `approval_status` column to `profiles`: `text NOT NULL DEFAULT 'pending'`
- Update `handle_new_user()` trigger: set `role = 'pending'`, `is_active = false`, `approval_status = 'pending'`
- `'pending'` is a **non-functional technical placeholder** — `has_role()` already requires `is_active = true`, so pending users get zero access

### Auth.tsx — Full rewrite
- **Desktop (md+)**: Two-column split. Left white panel: compact "H" logo + "Homie Inspection" title + form. Right: dark branded panel with product tagline
- **Mobile**: Stacked — branded header strip + card form
- Remove role selector entirely from signup
- Post-signup message: "Tu cuenta está pendiente de aprobación por un administrador."

### AuthContext.tsx
- Remove `role` parameter from `signUp()`. Pass `role: 'pending'` in metadata

### types.ts
- Add `'pending'` to `UserRole` union (technical only — never shown as a business role in filters/dropdowns)
- Add `approval_status?: string` to `Profile`

### ProtectedRoute.tsx
- If `profile.role === 'pending'` or `profile.approval_status !== 'approved'`, show pending-approval screen

### Index.tsx
- Handle `role === 'pending'`: show pending-approval card instead of redirecting

---

## 2. AdminUsers — Explicit Approval Workflow

Expand the current edit dialog into a structured approval flow with 4 distinct actions:

| Action | Effect |
|---|---|
| **Aprobar** | Sets `approval_status = 'approved'`, `is_active = true` — requires role assignment first |
| **Asignar rol** | Sets `role` to admin/inspector/executive (dropdown) |
| **Rechazar** | Sets `approval_status = 'rejected'`, `is_active = false` |
| **Desactivar** | Sets `is_active = false` (for already-approved users) |

- Filter tabs: add "Pendientes" tab showing `approval_status = 'pending'`
- Hide `'pending'` from the role filter dropdown (it's not a business role)
- Pending users shown with amber badge; rejected with red

---

## 3. Admin Full Section Data Editing (Inspection Tab)

Replace the current collapsed 5-field preview with full inline editing per section.

### Editable fields (inspector-entered data):
- **Status fields** (`group_key === 'status'`): Clickable chip group (bueno/regular/malo/no_aplica) → updates `inspection_field_values.value_text`
- **Text/textarea fields**: Editable Input/Textarea, save on blur → updates `inspection_field_values.value_text`
- **Observation fields** (`group_key === 'observation'`): Editable Textarea
- **Section status**: "Marcar completada" / "Reabrir" → updates `inspection_sections.status`

### Photo controls:
- Full-size view on click (dialog lightbox)
- Visibility toggle (eye icon) → updates `inspection_photos.visible_to_owner`
- Delete button → deletes from `inspection_photos`

### Read-only fields (traceability):
- `field_key`, `field_label`, `field_type`, `group_key` — structural metadata, never editable
- `sort_order`, `created_at` — system fields
- `updated_by`, `updated_at` — set automatically on save

### Admin retains all existing capabilities:
- Internal notes, final observations, budget items, publish/republish, copy/open URL, delete inspection, force advance

---

## 4. Public URL Performance

### Diagnosis approach
- The RPC `get_published_report` is a single indexed lookup returning pre-built JSONB — likely fast
- Main suspects: image loading (Supabase storage), cold connection, render cost

### Optimizations:
- Add `loading="lazy"` + `decoding="async"` on all `<img>` tags
- **Verify actual storage host** from `inspection_photos.public_url` patterns before adding preconnect — add `<link rel="preconnect">` for the correct host in `index.html`
- Replace `Skeleton` loading with lightweight CSS shimmer `<div>`s
- Memoize `sectionsWithRepairs` / `sectionsWithObservations` with `useMemo`
- Add explicit `width`/`height` on images to prevent layout shift

---

## 5. Executive UI — Stage Nav, Share Tab, Mobile Tabs

### Desktop enhancements
- Add horizontal 3-stage indicator at top: **Revisión → Presupuesto → Compartir** with active state based on `current_stage`
- Left sidebar: add published state badge (green "Publicado v{N}" vs amber "Pendiente de publicación"), budget total, version info

### Mobile enhancements
- Add segmented tab navigation: **Revisión | Presupuesto | Compartir**
- Compact quick-actions card: Ver reporte, Copiar link, Publicar

### New Share tab with explicit state distinction:
- **Not published**: Amber "Pendiente de publicación" badge + prominent "Publicar Reporte" CTA
- **Published**: Green "Publicado v{N}" badge + final URL + copy + **"Abrir reporte propietario"** as a first-class prominent button (not buried) + budget total + version timestamp + "Republicar" secondary action

### "Abrir reporte propietario" prominence:
- Rendered as a full-width primary button with ExternalLink icon in the Share tab
- Also shown in the sticky bottom bar post-publication

---

## 6. Tenant Signature Step

### Database migration
```sql
CREATE TABLE public.inspection_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  signer_type text NOT NULL DEFAULT 'tenant',
  signer_name text,
  signature_data text,  -- nullable: only required when status = 'signed'
  signature_status text NOT NULL DEFAULT 'signed',
  skip_reason text,
  signed_at timestamptz DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inspection_signatures ENABLE ROW LEVEL SECURITY;
-- One active record per inspection (enforced in app code: delete old before insert)
```

- `signature_data` is **nullable** — only populated when `signature_status = 'signed'`
- When `signature_status = 'refused'` or `'unavailable'`, `skip_reason` is required instead

RLS: admin ALL, inspector INSERT/SELECT on assigned, executive SELECT on assigned.

### SignaturePad.tsx — New component
- HTML5 Canvas, touch-optimized, mouse fallback
- Clear / Confirm buttons
- "El inquilino no puede firmar" → reason selector (refused/unavailable) + note

### Business rules (MVP)
- **One active record per inspection**. Re-capture deletes previous record before inserting new one
- Three outcomes: `signed`, `refused`, `unavailable`
- Inspector must choose one before final submit

### Workflow placement
- After all operational sections completed, before final submit in InspectorInspectionDetail
- Admin: view signature image or skip reason in Overview tab
- Executive: signature status badge in review context

---

## Files Summary

| Action | File |
|---|---|
| Migration | Add `approval_status` to profiles, update `handle_new_user()` |
| Migration | Create `inspection_signatures` table with RLS |
| Rewrite | `src/pages/Auth.tsx` |
| Edit | `src/contexts/AuthContext.tsx` — remove role param |
| Edit | `src/lib/types.ts` — add `'pending'`, `approval_status` |
| Edit | `src/components/ProtectedRoute.tsx` — block pending users |
| Edit | `src/pages/Index.tsx` — handle pending role |
| Edit | `src/pages/admin/AdminUsers.tsx` — approval workflow |
| Edit | `src/pages/admin/AdminInspectionDetail.tsx` — full field editing, signature display |
| Edit | `src/pages/public/OwnerReport.tsx` — image optimization, lighter loading |
| Rewrite | `src/pages/executive/ExecutiveReviewDetail.tsx` — stage nav, share tab, mobile tabs |
| Create | `src/components/SignaturePad.tsx` |
| Edit | `src/pages/inspector/InspectorInspectionDetail.tsx` — signature step |
| Edit | `index.html` — preconnect hint |

14 changes total.

