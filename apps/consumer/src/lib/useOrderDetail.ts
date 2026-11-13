// SCR-14 active refresh and mutation ordering (FEAT-10 AC-10-9, DEV-318).
import { ApiError, orders, type Order } from "@farmclub/api";
import { inBackground } from "@farmclub/ui";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { chatViewState } from "./chatViewState";
import { useSession } from "./session";

const denied = (error: unknown) =>
  error instanceof ApiError && [401, 403, 404].includes(error.status);

export function useOrderDetail(orderId: string) {
  const { ready, user, chatViewScope } = useSession();
  const scope = ready && user && chatViewScope
    ? `${chatViewScope.generation}:${user.userId}:${orderId}`
    : "";
  const [result, setResult] = useState<{
    scope: string;
    data: Order | null;
    error: unknown;
  }>({ scope, data: null, error: null });
  const control = useMemo(() => ({
    active: false,
    epoch: 0,
    readLease: null as number | null,
    writing: false,
  }), [scope]);
  const current = useRef(control);
  current.current = control;
  // The session store invalidates synchronously on logout, before React renders.
  const authorized = useCallback(() =>
    !!scope && current.current === control && !!chatViewScope &&
    chatViewState.isCurrent(chatViewScope),
  [scope, control, chatViewScope]);

  const reload = useCallback(async (replace = true): Promise<void> => {
    if (!authorized() || !control.active || inBackground()) return;
    if (control.writing || (control.readLease !== null && !replace)) return;
    // Focus/retry replaces an old lease immediately, even if its network call
    // never settles. Polling alone does not start overlapping reads.
    const lease = ++control.epoch;
    control.readLease = lease;
    const accepts = () => authorized() && control.active &&
      !inBackground() && lease === control.epoch;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const data = await Promise.race([
        orders.get(orderId),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new ApiError(0, {
            message: "주문 내용을 불러오지 못했어요. 다시 시도해 주세요.",
          })), 15000);
        }),
      ]);
      if (accepts()) setResult({ scope, data, error: null });
    } catch (error) {
      if (accepts()) setResult((prev) => ({
        scope,
        data: denied(error) || prev.scope !== scope ? null : prev.data,
        error,
      }));
    } finally {
      clearTimeout(timeout);
      // An invalidated read must never release a newer read's lease.
      if (control.readLease === lease) control.readLease = null;
    }
  }, [authorized, control, orderId, scope]);

  useFocusEffect(useCallback(() => {
    control.active = true;
    void reload();
    const timer = setInterval(() => void reload(false), 8000);
    const subscription = AppState.addEventListener("change", (state) => {
      // Invalidate a GET started before the app/tab was hidden.
      control.epoch++;
      control.readLease = null;
      if (state === "active") void reload();
    });
    return () => {
      control.active = false;
      control.epoch++;
      control.readLease = null;
      clearInterval(timer);
      subscription.remove();
    };
  }, [control, reload]));

  const mutate = useCallback(async (write: () => Promise<Order>) => {
    if (!authorized() || !control.active || control.writing) return false;
    // A GET may finish while the write is running. It must not restore old data.
    control.writing = true;
    control.epoch++;
    control.readLease = null;
    try {
      const data = await write();
      if (!authorized() || !control.active) return false;
      setResult({ scope, data, error: null });
      return true;
    } catch (error) {
      if (!authorized() || !control.active) return false;
      if (denied(error))
        setResult({ scope, data: null, error });
      throw error;
    } finally {
      control.epoch++;
      control.readLease = null;
      control.writing = false;
      // A fresh read starts after the write, independently of invalidated GETs.
      if (authorized()) void reload();
    }
  }, [authorized, control, reload, scope]);

  const shown = result.scope === scope && authorized()
    ? result
    : { data: null, error: null };
  return { ...shown, reload, mutate };
}
