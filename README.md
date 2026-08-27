# Homie Inspection

Internal operational OS for property inspections at Homie. Captures the
condition of a property (check-out or captación) and produces a versioned,
client-facing report, up to operational close.

- **Inspectors** complete inspections from a mobile-first interface.
- **Executives** review, price repairs, approve, publish and finalize from
  a desktop-first workstation.
- **Admins** ingest payloads (manual + HubSpot), assign users, manage
  catalogs, contractors, templates and monitor the platform.
- **Comercial** (read-only) consults and downloads published check-outs.

## Stack

- React 18 + Vite 5 + TypeScript 5 + Tailwind v3 (shadcn/ui)
- React Query for the data layer in the executive workstation
- Lovable Cloud backend: Postgres + Auth + Storage + Edge Functions
- RLS everywhere; public reports gated by the `get_published_report` RPC

## Key docs

- [`docs/PRODUCT_LOGIC.md`](docs/PRODUCT_LOGIC.md) — definitive entity model,
  statuses and workflow rules.
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
    admin/                    Admin console (users, integrations, catalog, schedule, monitoring)
    executive/                Executive workstation (queue + review detail)
      review-detail/          Sub-components for ExecutiveReviewDetail
    inspector/                Inspector mobile flow
    comercial/                Read-only check-out consultation
    public/                   Public owner/tenant report
  shared/                     Cross-cutting UI + hooks + libs
  lib/                        Generators, status guards, buckets, search, photo URLs, tax, types
  integrations/supabase/      Auto-generated client + types (do not edit)

supabase/
  functions/                  Edge functions (HubSpot intake/update, Slack, signed-photo, health, retries)
  migrations/                 SQL migrations
```

## Workflow stages

Strict sequential model: **inspection → review → budget → share → close**
(`Finalizado`, which requires the independent `quien_repara` flag).

## Local notes

- `src/integrations/supabase/client.ts`, `previewAuthStorage.ts`,
  `src/integrations/supabase/types.ts` and `.env` are auto-generated and
  must not be edited by hand.
- Edge functions deploy automatically with each commit.
- Status labels and visuals come only from
  `src/shared/ui/status-registry.ts`; list/KPI counters only from
  `src/lib/inspection-buckets.ts`.
- `version.json` is emitted at build time and drives the stale-bundle
  reload guard (`NewVersionPrompt`).
