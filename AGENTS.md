# Architecture rules

- Offline app shell uses `vite-plugin-pwa` (generateSW → `/sw.js`, NetworkFirst for HTML and REST GETs) registered only from `src/lib/register-sw.ts`, which refuses dev/preview/iframe/`?sw=off`. Why: the old unguarded worker trapped installed devices on stale builds.
- Inspector writes (field values, section status, photos) go through `src/shared/lib/offline-queue.ts` (IndexedDB outbox replayed on reconnect); submitting is blocked while the outbox is non-empty. Why: receptors in México work without signal.
