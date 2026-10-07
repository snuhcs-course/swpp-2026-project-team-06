import { useCallback, useEffect, useState } from "react";

/** Scoped, focus-aware polling. Ignore responses after account/filter changes. */
export function useLiveList<T>(
  load: (cancelled: () => boolean) => Promise<T[]>,
  scope: string,
  active: boolean,
  interval = 2000,
) {
  const [result, setResult] = useState<{
    scope: string;
    data: T[] | null;
    error: string;
  }>({ scope, data: null, error: "" });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    if (!active) return;
    let cancelled = false,
      busy = false;
    const refresh = async () => {
      if (busy || (typeof document !== "undefined" && document.hidden)) return;
      busy = true;
      try {
        const data = await load(() => cancelled);
        if (!cancelled) setResult({ scope, data, error: "" });
      } catch (e) {
        if (!cancelled)
          setResult((prev) => ({
            scope,
            data: prev.scope === scope ? prev.data : null,
            error: e instanceof Error ? e.message : "불러오지 못했어요",
          }));
      } finally {
        busy = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), interval);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load, scope, active, revision, interval]);
  const current = result.scope === scope ? result : { data: null, error: "" };
  return {
    ...current,
    loading: current.data === null && !current.error,
    retry,
  };
}
