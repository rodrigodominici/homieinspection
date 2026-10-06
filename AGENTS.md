# Architecture rules

- No app-shell service worker: installability is manifest-only (`public/manifest.webmanifest`); `public/sw.js` is a self-unregistering kill-switch. Why: the old offline worker trapped installed devices on stale builds.
