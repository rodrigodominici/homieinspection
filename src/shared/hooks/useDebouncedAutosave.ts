/**
 * useDebouncedAutosave — debounced, drift-safe autosave for text fields.
 *
 * - Skips no-op saves (same as last persisted value).
 * - Drops stale responses via an in-flight token.
 * - Flushes pending writes on unmount and on `beforeunload`.
 *
 * Usage:
 *   const { status, flush } = useDebouncedAutosave(value, saveFn, 1200);
 *   <Textarea value={value} onChange={(e) => setValue(e.target.value)} />
 *   <AutosaveStatus status={status} />
 */
import { useEffect, useRef, useState, useCallback } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export function useDebouncedAutosave<T>(
  value: T,
  saveFn: (value: T) => Promise<void>,
  delay = 1200,
) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const lastSaved = useRef<T>(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(0);
  const valueRef = useRef(value);
  const saveFnRef = useRef(saveFn);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { saveFnRef.current = saveFn; }, [saveFn]);

  const doSave = useCallback(async () => {
    const v = valueRef.current;
    if (Object.is(v, lastSaved.current)) return;
    const token = ++inFlight.current;
    setStatus("saving");
    try {
      await saveFnRef.current(v);
      if (token !== inFlight.current) return; // stale
      lastSaved.current = v;
      setStatus("saved");
    } catch (err) {
      if (token !== inFlight.current) return;
      console.error("autosave failed", err);
      setStatus("error");
    }
  }, []);

  // Debounce on value change
  useEffect(() => {
    if (Object.is(value, lastSaved.current)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void doSave(); }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, delay, doSave]);

  // Flush on unmount + beforeunload
  useEffect(() => {
    const handler = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      // best-effort sync flush; we can't await in beforeunload
      if (!Object.is(valueRef.current, lastSaved.current)) {
        void saveFnRef.current(valueRef.current);
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      handler();
    };
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    await doSave();
  }, [doSave]);

  return { status, flush };
}
