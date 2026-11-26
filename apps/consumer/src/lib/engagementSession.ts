import { useCallback, useEffect, useRef } from "react";
import { chatViewState } from "./chatViewState";
import { useSession } from "./session";

/** Reuse the app's verified session generation; equal tokens are not equal logins. */
export function useEngagementSession() {
  const { user, ready, chatViewScope } = useSession();
  const key = ready && user && chatViewScope ? `${user.userId}:${chatViewScope.generation}` : "";
  const current = useRef(key);
  current.current = key;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const valid = useCallback(() => Boolean(key && alive.current && current.current === key &&
    chatViewScope && chatViewState.isCurrent(chatViewScope)), [key, chatViewScope]);
  return { key, valid };
}
