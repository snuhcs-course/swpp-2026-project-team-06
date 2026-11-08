import { useEffect, useRef, useState } from "react";

/** Ignore repeated clicks immediately; the server also enforces run/idempotency guards. */
export function useRetryGate() {
  const until = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [cooling, setCooling] = useState(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    cooling,
    enter() {
      if (Date.now() < until.current) return false;
      until.current = Date.now() + 3000;
      setCooling(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCooling(false), 3000);
      return true;
    },
  };
}
