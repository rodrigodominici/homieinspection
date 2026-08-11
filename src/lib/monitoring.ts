/**
 * Production monitoring (PostHog).
 *
 * Web Vitals, session replay, exceptions and custom performance timings.
 * Nothing runs in development — the PROD guard keeps local work clean and
 * avoids polluting the analytics project with dev noise.
 *
 * The project token comes from the Lovable PostHog connector
 * (`VITE_LOVABLE_CONNECTOR_POSTHOG_*`) with a manual `VITE_POSTHOG_*`
 * fallback so the module works either way.
 */
import posthog from 'posthog-js';

const env = import.meta.env as Record<string, string | boolean | undefined>;

const PROJECT_TOKEN =
  (env.VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY as string | undefined) ??
  (env.VITE_POSTHOG_KEY as string | undefined) ??
  undefined;

const REGION = ((env.VITE_LOVABLE_CONNECTOR_POSTHOG_REGION as string | undefined) ?? 'eu').toLowerCase();

const API_HOST =
  (env.VITE_POSTHOG_HOST as string | undefined) ??
  (REGION === 'us' ? 'https://us.i.posthog.com' : 'https://eu.i.posthog.com');

/** Only send telemetry from real deployments. */
export const monitoringEnabled = Boolean(import.meta.env.PROD && PROJECT_TOKEN);

let initialized = false;

/**
 * Routes that render tenant personal data (names, phones, signatures,
 * inspection evidence). Session replay is stopped while the user is here.
 */
const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /^\/inspector\/inspection\//,
  /^\/executive\/inspection\//,
  /^\/admin\/inspections\/[^/]+/,
  /^\/comercial\/check-out\//,
  /^\/reportes\//,
  /^\/public\//,
];

export function isSensitivePath(pathname: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((re) => re.test(pathname));
}

export function initMonitoring(): void {
  if (!monitoringEnabled || initialized) return;
  initialized = true;

  posthog.init(PROJECT_TOKEN as string, {
    api_host: API_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    // Web Vitals: LCP, CLS, INP, FCP, TTFB
    capture_performance: true,
    person_profiles: 'identified_only',
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-sensitive]',
    },
    // Replay is opt-in per route (see syncSessionRecording).
    disable_session_recording: true,
  });

  syncSessionRecording(window.location.pathname);
}

/**
 * Enables replay on safe routes and stops it on routes with tenant data.
 * Call on every navigation.
 */
export function syncSessionRecording(pathname: string): void {
  if (!monitoringEnabled || !initialized) return;
  if (isSensitivePath(pathname)) posthog.stopSessionRecording();
  else posthog.startSessionRecording();
}

/**
 * Associates events with a user. Deliberately no email / full name —
 * only the opaque id and the role, which is what the analysis needs.
 */
export function identifyUser(userId: string, role: string | null): void {
  if (!monitoringEnabled || !initialized) return;
  posthog.identify(userId, { role: role ?? 'unknown' });
}

export function resetUser(): void {
  if (!monitoringEnabled || !initialized) return;
  posthog.reset();
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  console.error(error);
  if (!monitoringEnabled || !initialized) return;
  posthog.capture('$exception', {
    $exception_message: error.message,
    $exception_type: error.name,
    ...context,
  });
}

const SLOW_THRESHOLD_MS = 3000;

/** Measures a critical async operation and reports its duration. */
export async function measureOperation<T>(
  name: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>,
): Promise<T> {
  const start = performance.now();
  let ok = true;
  try {
    return await fn();
  } catch (err) {
    ok = false;
    throw err;
  } finally {
    const duration = performance.now() - start;
    if (monitoringEnabled && initialized) {
      posthog.capture('performance_operation', {
        operation: name,
        duration_ms: Math.round(duration),
        succeeded: ok,
        ...extra,
      });
    }
    if (duration > SLOW_THRESHOLD_MS) {
      console.warn(`[PERF] ${name} took ${duration.toFixed(0)}ms — over threshold`);
    }
  }
}

/** Fire-and-forget custom event (no PII). */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (!monitoringEnabled || !initialized) return;
  posthog.capture(name, props);
}

/** Sends a single event to verify PostHog ingestion is working. */
export function sendTestEvent(): void {
  if (!monitoringEnabled || !initialized) return;
  posthog.capture('monitoring_test_event', { timestamp: new Date().toISOString() });
}

/**
 * Supabase auth-js may throw an `AbortError: Lock broken by another request
 * with the 'steal' option` when multiple tabs or rapid re-renders race for the
 * localStorage lock. It is benign and should not surface as a crash to users.
 */
function isAuthLockError(err: unknown): err is Error {
  return (
    err instanceof Error &&
    err.name === 'AbortError' &&
    /Lock broken by another request with the 'steal' option/.test(err.message)
  );
}

/**
 * Catches unhandled errors and promise rejections that escape React's error boundary.
 * The auth lock race is swallowed silently; everything else is reported to monitoring.
 */
export function initGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    const err = event.error instanceof Error ? event.error : new Error(event.message);
    captureError(err, { source: 'window.onerror', filename: event.filename });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (isAuthLockError(reason)) {
      // Swallow silently — no console noise, no toast. A later auth state
      // change will reconcile the session automatically.
      if (monitoringEnabled && initialized) {
        posthog.capture('auth_lock_warning', { message: reason.message });
      }
      return;
    }
    const err = reason instanceof Error ? reason : new Error(String(reason));
    captureError(err, { source: 'unhandledrejection' });
  });
}
