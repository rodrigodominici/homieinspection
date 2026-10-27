# Architecture rules
- Rent Manager listing lookup maps location.unit to unit_number without parsing street addresses. Why: the upstream response includes apartments separately from the address.
- Chilean HubSpot captación intake recovers missing unit_number from the verified deal property numero_de_departamento before saving the normalized snapshot, while retaining the raw webhook. Why: incoming deal events omit the apartment even when HubSpot has it.

- Offline app shell uses `vite-plugin-pwa` (generateSW → `/sw.js`, NetworkFirst for HTML and REST GETs) registered only from `src/lib/register-sw.ts`, which refuses dev/preview/iframe/`?sw=off`. Why: the old unguarded worker trapped installed devices on stale builds.
- Opening an inspection online must save its snapshot and preload every inspector screen (`src/lib/offline-readiness.ts`) before showing "Lista para usar sin conexión"; `/assets/` also has a CacheFirst runtime cache. Why: screen files never fetched online made offline navigation hang on iPhone.
- Inspector writes (field values, section status, photos) go through `src/shared/lib/offline-queue.ts` (IndexedDB outbox replayed on reconnect); submitting is blocked while the outbox is non-empty. Why: receptors in México work without signal.
- Inspection address/property_name always include the unit (", D <unit>") via DB trigger apply_unit_to_inspection_address, skipping if already present. Why: receptors must see the apartment on every screen without per-screen changes.
