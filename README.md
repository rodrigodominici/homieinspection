# Homie Inspection

Internal operational OS for property inspections at Homie. Captures the
condition of a property at check-in / check-out and produces a versioned,
client-facing report.

- **Inspectors** complete inspections from a mobile-first interface.
- **Executives** review, price repairs, approve and publish from a
  desktop-first workstation.
- **Admins** ingest payloads (manual + HubSpot), assign users, manage
  catalogs, contractors and templates.

## Stack

- React 18 + Vite 5 + TypeScript 5 + Tailwind v3 (shadcn/ui)
- React Query for the data layer in the executive workstation
- Supabase (Lovable Cloud): Postgres + Auth + Storage + Edge Functions
- RLS everywhere; public reports gated by the `get_published_report` RPC

## Key docs

- [`docs/PRODUCT_LOGIC.md`](docs/PRODUCT_LOGIC.md) — definitive entity model
  and workflow rules.
- [`docs/ADR-001-canonical-architecture.md`](docs/ADR-001-canonical-architecture.md) —
  canonical decisions: `property_type` as sole classifier, private
  storage bucket, signed URLs, intake stabilization.

## Project layout

```
src/
  modules/
    inspection/api/           Inspector-facing data hooks + services
    review/api/               Executive workstation data layer (React Query)
    review/components/        Shared executive dialogs/sheets
  pages/
    admin/                    Admin console (users, integrations, catalog, schedule)
    executive/                Executive workstation (queue + review detail)
      review-detail/          Sub-components for ExecutiveReviewDetail
    inspector/                Inspector mobile flow
    public/                   Public owner/tenant report
  shared/                     Cross-cutting UI + hooks + libs
  lib/                        Generators, status guards, photo URL helpers, tax, types
  integrations/supabase/      Auto-generated client + types (do not edit)

supabase/
  functions/                  Edge functions (HubSpot intake/update, signed-photo, retries)
  migrations/                 SQL migrations
```

## Workflow stages

Strict 4-stage sequential model: **inspection → review → budget → share**.

## Local notes

- `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`
  and `.env` are auto-generated and must not be edited by hand.
- Edge functions deploy automatically with each commit.
