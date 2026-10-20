/**
 * Makes sure the inspector screens can be opened without signal.
 *
 * Each screen is a separate file that the phone downloads the first time it is
 * opened. If the receptor never opened a screen with signal (or the offline
 * copy of a new version was still downloading), navigating to it in airplane
 * mode would wait forever. Preloading them while online — plus the runtime
 * asset cache in the service worker — keeps every inspector screen available.
 */

let preloadPromise: Promise<boolean> | null = null;

/** Downloads every screen the receptor can reach from an inspection. */
export function preloadInspectorScreens(): Promise<boolean> {
  if (preloadPromise) return preloadPromise;
  preloadPromise = Promise.all([
    import('@/pages/inspector/InspectorDashboard'),
    import('@/pages/inspector/InspectorInspectionDetail'),
    import('@/pages/inspector/InspectorSectionComplete'),
    import('@/pages/inspector/InspectorAllInspections'),
    import('@/pages/inspector/InspectorPastInspections'),
    import('@/pages/inspector/InspectorCalendar'),
    import('@/pages/inspector/InspectorProfile'),
  ])
    .then(() => true)
    .catch(() => {
      preloadPromise = null; // try again next time
      return false;
    });
  return preloadPromise;
}

/** True when the offline copy of the app is installed and controlling this page. */
export async function isAppShellReady(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    if (!navigator.serviceWorker.controller) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    // A new version still downloading its offline copy is not ready yet.
    return !reg.installing && !reg.waiting;
  } catch {
    return false;
  }
}
