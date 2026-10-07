// 로그인 상태, 비로그인 관문 시트(design: s-05-gate), 탭 바 숨김. 화면은 @farmclub/api 클라이언트만 쓴다.
import {
  auth,
  configureApi,
  onAuthChange,
  getToken,
  type Recipient,
  type User,
} from "@farmclub/api";
import { Button, Sheet, T } from "@farmclub/ui";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

configureApi({ namespace: "consumer" });

export type GateAction = "follow" | "reserve" | "chat" | "like" | "tab";
const GATE_TITLE: Record<GateAction, string> = {
  follow: "로그인하고 팔로우해요",
  reserve: "로그인하고 예약해요",
  chat: "로그인하고 물어봐요",
  like: "로그인하고 좋아요를 눌러요",
  tab: "로그인이 필요해요",
};

/** 로그인 뒤 이어서 할 행동(screens.md 결정 25, D-17). next 화면이 다시 보이면 그 화면이 꺼내 쓴다 */
export type Resume = {
  action: GateAction;
  next: string;
  data?: Record<string, string>;
};

type Session = {
  user: User | null;
  ready: boolean;
  refresh: () => Promise<void>;
  /**
   * 로그인 필요 행동. 로그인돼 있으면 run을 바로 실행하고,
   * 아니면 관문 시트 → 로그인 → next 화면으로 돌아와 그 화면이 resume을 보고 행동을 잇는다.
   */
  requireLogin: (
    action: GateAction,
    next: string,
    run?: () => void,
    data?: Record<string, string>,
  ) => void;
  /** 로그인 뒤 이어서 할 행동(없으면 null) */
  resume: Resume | null;
  clearResume: () => void;
  /** 사용자가 직접 로그아웃(토큰 삭제 후 첫 화면). before는 토큰을 지우기 전에 실행(데모 초기화 등) */
  logout: (before?: () => void) => void;
  tabBarHidden: boolean;
  setTabBarHidden: (v: boolean) => void;
  /** 배송지 입력 → 주문서로 넘기는 값 */
  pendingRecipient: (Recipient & { saveAddress?: boolean }) | null;
  setPendingRecipient: (
    r: (Recipient & { saveAddress?: boolean }) | null,
  ) => void;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [gate, setGate] = useState<Resume | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [tabBarHidden, setTabBarHidden] = useState(false);
  const [pendingRecipient, setPendingRecipient] =
    useState<Session["pendingRecipient"]>(null);
  const hadUser = useRef(false);
  const here = useRef(pathname);
  here.current = pathname;

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setPendingRecipient(null);
      setReady(true);
      return;
    }
    try {
      const u = await auth.me();
      if (getToken() === token) setUser(u);
    } catch {
      if (getToken() === token) setUser(null);
    } finally {
      if (getToken() === token) setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onAuthChange(() => {
      // 401·403 WRONG_APP이면 클라이언트가 토큰을 지운다(screens.md 7.1) → 소비자 로그인(SCR-05)으로
      if (!getToken() && hadUser.current && here.current !== "/login") {
        hadUser.current = false;
        router.push({
          pathname: "/login",
          params: { next: here.current, reason: "signedout" },
        });
      }
      void refresh();
    });
  }, [refresh, router]);

  useEffect(() => {
    hadUser.current = !!user;
  }, [user]);

  const requireLogin = useCallback(
    (
      action: GateAction,
      next: string,
      run?: () => void,
      data?: Record<string, string>,
    ) => {
      if (getToken()) {
        run?.();
        return;
      }
      setGate({ action, next, data });
    },
    [],
  );

  const clearResume = useCallback(() => setResume(null), []);

  const logout = useCallback(
    (before?: () => void) => {
      hadUser.current = false;
      before?.();
      auth.logout();
      setResume(null);
      router.replace("/");
    },
    [router],
  );

  const value = useMemo<Session>(
    () => ({
      user,
      ready,
      refresh,
      requireLogin,
      resume,
      clearResume,
      logout,
      tabBarHidden,
      setTabBarHidden,
      pendingRecipient,
      setPendingRecipient,
    }),
    [
      user,
      ready,
      refresh,
      requireLogin,
      resume,
      clearResume,
      logout,
      tabBarHidden,
      pendingRecipient,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Sheet visible={!!gate} onClose={() => setGate(null)}>
        <T variant="heading">{gate ? GATE_TITLE[gate.action] : ""}</T>
        <T variant="body">
          팔로우·예약·채팅은 로그인이 필요해요. 로그인하면 지금 보던 화면으로
          돌아와요.
        </T>
        <Button
          label="로그인"
          onPress={() => {
            const g = gate;
            setGate(null);
            if (!g) return;
            setResume(g.action === "tab" ? null : g);
            router.push({
              pathname: "/login",
              params: { next: g.next, from: g.action },
            });
          }}
          style={{ marginTop: 8 }}
        />
        <Button
          label="나중에"
          variant="text"
          onPress={() => setGate(null)}
          style={{ alignSelf: "center" }}
        />
      </Sheet>
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

/** 현재 경로(쿼리 포함 안 함) */
export function useHere() {
  return usePathname();
}
