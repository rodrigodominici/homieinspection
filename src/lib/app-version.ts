/**
 * Build identity.
 *
 * `__APP_VERSION__` is injected at build time (see `vite.config.ts`). Sending it
 * with every diagnostic event tells us whether a user hitting a blank screen is
 * running a stale build (typical after a deploy, when a long-lived tab or the
 * installed PWA still references chunk files that no longer exist).
 */
declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
