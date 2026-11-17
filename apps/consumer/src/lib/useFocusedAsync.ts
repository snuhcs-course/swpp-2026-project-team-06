import { useAsync } from "@farmclub/ui";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

/** useAsync owns the first/resource load; subsequent screen visits refresh it.
 * Keep its request-generation guard so a slow older response cannot win.
 */
export function useFocusedAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const state = useAsync(load, deps);
  const visited = useRef(false);
  useFocusEffect(useCallback(() => {
    if (visited.current) void state.reload();
    visited.current = true;
  }, [state.reload]));
  return state;
}
