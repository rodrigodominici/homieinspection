import { useState, useEffect } from 'react';

/**
 * Browser's install event — not yet part of the standard TypeScript lib.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface UsePWAInstallResult {
  /** Android/Chrome: a native install dialog can be triggered. */
  canInstall: boolean;
  /** Trigger the browser's native install dialog. */
  install: () => Promise<void>;
  /** True after the user accepted the install prompt or the `appinstalled` event fired. */
  installed: boolean;
  /** True on iOS Safari — no native prompt available, show manual instructions instead. */
  isIOS: boolean;
  /** True when the app is already running in standalone (installed) mode. */
  isStandalone: boolean;
}

/**
 * Hook that captures the browser's `beforeinstallprompt` event so any
 * component (e.g. InspectorProfile) can render a contextual install button.
 *
 * Works for Android/Chrome. On iOS Safari the `beforeinstallprompt` event is
 * not fired; `isIOS` is set so the UI can show manual "Add to Home Screen" steps.
 */
export function usePWAInstall(): UsePWAInstallResult {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  const isStandalone =
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches;

  const isIOS =
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase()) &&
    !isStandalone;

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing automatically on mobile
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  };

  return { canInstall: !!prompt, install, installed, isIOS, isStandalone };
}
