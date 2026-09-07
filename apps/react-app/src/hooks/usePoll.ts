import { useCallback, useEffect, useRef, useState } from "react";

export function usePoll(
  callback: () => Promise<void> | void,
  options: { enabled: boolean; intervalMs: number },
): { refresh: () => Promise<void>; refreshing: boolean } {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const inFlight = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async (manual = false) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    if (manual) {
      setRefreshing(true);
    }
    try {
      await callbackRef.current();
    } catch {
      return;
    } finally {
      inFlight.current = false;
      if (manual) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!options.enabled) {
      return;
    }
    let cancelled = false;
    void run(false);
    const timer = window.setInterval(() => {
      if (!cancelled) {
        void run(false);
      }
    }, options.intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [options.enabled, options.intervalMs, run]);

  const refresh = useCallback(async () => {
    await run(true);
  }, [run]);

  return { refresh, refreshing };
}
