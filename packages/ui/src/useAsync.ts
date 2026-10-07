import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncState<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (fn: (prev: T | null) => T | null) => void;
};

/** 화면 데이터 불러오기. deps가 바뀌면 다시 부른다. 실패해도 이미 보인 값은 지우지 않는다. */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const alive = useRef(true);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const v = await fnRef.current();
      if (alive.current && current === requestId.current) setDataState(v);
    } catch (e) {
      if (alive.current && current === requestId.current) setError(e);
    } finally {
      if (alive.current && current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    setDataState(null);
    void reload();
    return () => {
      alive.current = false;
      requestId.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback(
    (f: (prev: T | null) => T | null) => setDataState((p) => f(p)),
    [],
  );
  return { data, error, loading, reload, setData };
}
