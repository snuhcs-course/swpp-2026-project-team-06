// 성공·오류 토스트(screens.md 3장 토스트, D-19). 성공은 2초, 오류는 '연결이 불안정해요' + 다시 시도.
import { ApiError } from "@farmclub/api";
import { Toast } from "@farmclub/ui";
import { useCallback, useState } from "react";

export const NETWORK_ERROR = "연결이 불안정해요";

/** 네트워크·서버 오류(응답 못 받음, 5xx)면 true. 화면 안 오류 상자로 보일 검증·409는 false */
export const isNetworkError = (e: unknown) =>
  !(e instanceof ApiError) || e.status === 0 || e.status >= 500;

type State = {
  message: string;
  tone: "success" | "error";
  retry?: () => void;
} | null;

export function useToast(bottom?: number) {
  const [t, setT] = useState<State>(null);
  const hide = useCallback(() => setT(null), []);
  const show = useCallback(
    (message: string) => setT({ message, tone: "success" }),
    [],
  );
  /** 공통 오류 토스트. 서버가 준 문구가 있는 4xx는 그 문구, 그 밖은 '연결이 불안정해요' + 다시 시도 */
  const fail = useCallback((e: unknown, retry?: () => void) => {
    if (isNetworkError(e))
      setT({ message: NETWORK_ERROR, tone: "error", retry });
    else setT({ message: (e as ApiError).message, tone: "error" });
  }, []);
  const node = (
    <Toast
      message={t?.message ?? null}
      tone={t?.tone}
      onRetry={t?.retry}
      onHide={hide}
      bottom={bottom}
    />
  );
  return { show, fail, node };
}
