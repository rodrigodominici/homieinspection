import { useCallback, useEffect, useRef, useState } from "react";

const HEALTH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/health-check`;

export type BackendHealth = "ok" | "degraded" | "checking";

const NETWORK_ERROR_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "load failed",
  "timeout",
  "504",
  "502",
  "503",
  "upstream",
  "refresh_token",
  "network request failed",
];

function looksLikeBackendOutage(message: string): boolean {
  const m = message.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((p) => m.includes(p));
}

/**
 * Detects backend outages: listens to global network failures (fetch rejections,
 * unhandled query errors, browser offline events) and confirms with a ping to the
 * public health endpoint before reporting a problem. Keeps polling while degraded.
 */
export function useBackendHealth() {
  const [health, setHealth] = useState<BackendHealth>("ok");
  const [offline, setOffline] = useState(!navigator.onLine);
  const checking = useRef(false);
  const pollRef = useRef<number | null>(null);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${HEALTH_URL}?t=${Date.now()}`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(t);
      setHealth(res.ok ? "ok" : "degraded");
    } catch {
      setHealth("degraded");
    } finally {
      checking.current = false;
    }
  }, []);

  // Confirm outage when a global network error shows up
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message ?? e.reason ?? "");
      if (msg && looksLikeBackendOutage(msg)) void check();
    };
    const onError = (e: ErrorEvent) => {
      if (e.message && looksLikeBackendOutage(e.message)) void check();
    };
    const onOffline = () => setOffline(true);
    const onOnline = () => {
      setOffline(false);
      void check();
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [check]);

  // While degraded, keep re-checking every 15s so the banner clears itself
  useEffect(() => {
    if (health !== "degraded") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(() => void check(), 15000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [health, check]);

  const retry = useCallback(() => {
    setHealth("checking");
    void check();
  }, [check]);

  return { health, offline, retry, check };
}
