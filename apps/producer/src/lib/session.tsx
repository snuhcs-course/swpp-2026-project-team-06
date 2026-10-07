// 로그인 상태, 승인 상태에 따른 화면 관문(AC-01-3), 탭 바 숨김, 공통 토스트.
// 403 WRONG_APP(다른 앱 계정의 토큰)은 client가 토큰을 지우고 onAuthChange → refresh → user null → 관문이 /login(SCR-19)으로 보낸다(screens.md 7.1). 화면은 @farmclub/api 클라이언트만 쓴다.
import {
  ApiError,
  auth,
  configureApi,
  getToken,
  onAuthChange,
  type User,
} from "@farmclub/api";
import { Toast } from "@farmclub/ui";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

configureApi({ namespace: "producer" });

type Session = {
  user: User | null;
  ready: boolean;
  refresh: () => Promise<User | null>;
  tabBarHidden: boolean;
  setTabBarHidden: (v: boolean) => void;
  /** 화면을 옮겨도 남는 토스트(결정 37, D-19). 성공은 2초, 오류는 4초 + 다시 시도 */
  toast: (
    message: string,
    opts?: { tone?: "success" | "error"; onRetry?: () => void },
  ) => void;
  /** 쓰기 실패 공통 처리: 연결 문제(네트워크·5xx)면 '연결이 불안정해요' + 다시 시도 토스트를 띄우고 true */
  failToast: (e: unknown, retry: () => void) => boolean;
};

type ToastState = {
  message: string;
  tone: "success" | "error";
  onRetry?: () => void;
} | null;

/** 연결 문제(네트워크 끊김·서버 오류)인지. 검증·409 같은 오류는 화면 안에서 보여 준다 */
export const isConnectionError = (e: unknown) =>
  !(e instanceof ApiError) || e.status === 0 || e.status >= 500;

const Ctx = createContext<Session | null>(null);

/** 승인 상태별로 열 수 있는 화면. 나머지 주소로 오면 여기로 보낸다(screens.md SCR-05 버튼 동작). */
function homeFor(user: User | null): {
  allowed: (p: string) => boolean;
  home: string;
} {
  if (!user) return { allowed: (p) => p === "/login", home: "/login" };
  switch (user.farmStatus) {
    case "NONE":
      return { allowed: (p) => p === "/apply", home: "/apply" };
    case "PENDING":
      return { allowed: (p) => p === "/pending", home: "/pending" };
    case "REJECTED":
      return {
        allowed: (p) => p === "/pending" || p === "/apply",
        home: "/pending",
      };
    case "SUSPENDED":
      return { allowed: (p) => p === "/suspended", home: "/suspended" };
    default:
      return {
        allowed: (p) =>
          !["/login", "/apply", "/pending", "/suspended"].includes(p),
        home: "/",
      };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [tabBarHidden, setTabBarHidden] = useState(false);
  const [toastState, setToastState] = useState<ToastState>(null);

  const toast = useCallback<Session["toast"]>(
    (message, opts) =>
      setToastState({
        message,
        tone: opts?.tone ?? "success",
        onRetry: opts?.onRetry,
      }),
    [],
  );
  const failToast = useCallback<Session["failToast"]>(
    (e, retry) => {
      if (!isConnectionError(e)) return false;
      toast("연결이 불안정해요", { tone: "error", onRetry: retry });
      return true;
    },
    [toast],
  );
  const hideToast = useCallback(() => setToastState(null), []);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setReady(true);
      return null;
    }
    try {
      const u = await auth.me();
      if (getToken() !== token) return null;
      setUser(u);
      return u;
    } catch {
      if (getToken() === token) setUser(null);
      return null;
    } finally {
      if (getToken() === token) setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onAuthChange(() => void refresh());
  }, [refresh]);

  // 관문: 승인 전에는 다른 생산자 화면 주소로 가도 대기 화면으로(AC-01-3)
  useEffect(() => {
    if (!ready) return;
    const g = homeFor(user);
    if (!g.allowed(pathname)) router.replace(g.home as never);
  }, [ready, user, pathname, router]);

  const value = useMemo<Session>(
    () => ({
      user,
      ready,
      refresh,
      tabBarHidden,
      setTabBarHidden,
      toast,
      failToast,
    }),
    [user, ready, refresh, tabBarHidden, toast, failToast],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <Toast
        message={toastState?.message ?? null}
        tone={toastState?.tone}
        onRetry={toastState?.onRetry}
        onHide={hideToast}
      />
    </Ctx.Provider>
  );
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("SessionProvider 밖");
  return s;
}

/** 하단 고정 바에 주 행동이 있는 작업 화면은 탭 바를 숨긴다(docs/design 레이아웃 규칙) */
export function useHideTabBar() {
  const { setTabBarHidden } = useSession();
  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(true);
      return () => setTabBarHidden(false);
    }, [setTabBarHidden]),
  );
}
