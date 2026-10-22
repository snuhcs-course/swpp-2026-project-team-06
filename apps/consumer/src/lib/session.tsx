// 로그인 상태, 비로그인 관문 시트(design: s-05-gate), 탭 바 숨김. 화면은 @farmclub/api 클라이언트만 쓴다.
import {
  auth,
  configureApi,
  onAuthChange,
  onOnboardingRequired,
  getToken,
  type Recipient,
  type User,
} from "@farmclub/api";
import { useAnalytics } from "@farmclub/analytics";
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
  /** 로그인 뒤 이어서 할 행동(없으면 null). 가입 온보딩이 남은 동안에는 null */
  resume: Resume | null;
  /** 숨겨 둔 것까지 포함해 이어서 할 행동이 있는가(온보딩 끝 화면이 돌아갈 곳을 고를 때) */
  hasResume: boolean;
  clearResume: () => void;
  /** 카카오 리다이렉트처럼 페이지가 새로 뜬 뒤 저장해 둔 행동을 되살린다(/auth/kakao) */
  restoreResume: (r: Resume) => void;
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
  const userRef = useRef<User | null>(null);
  userRef.current = user;
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

  // 관문을 거치지 않는 행동(소식 좋아요·답장, 채팅 보내기 등)이 403 ONBOARDING_REQUIRED를 받으면
  // 온보딩을 연다. 끝나면 보던 화면으로 돌아온다(AC-01-12)
  useEffect(
    () =>
      onOnboardingRequired(() => {
        void refresh();
        if (here.current.startsWith("/onboarding")) return;
        router.push({ pathname: "/onboarding", params: { next: here.current } });
      }),
    [refresh, router],
  );

  // 약관·처리방침 버전이 바뀌었거나 필수 동의가 없으면(DEV-113) 앱을 열 때 한 번 동의 화면을 띄운다.
  // 닫아도 주문·팔로우·채팅은 서버가 403 ONBOARDING_REQUIRED로 막고 그때 다시 이 화면이 열린다
  const askedConsent = useRef(false);
  useEffect(() => {
    if (!ready || !user?.consentRequired || askedConsent.current) return;
    if (/^\/(onboarding|login|auth|privacy|terms)(\/|$)/.test(pathname)) return;
    askedConsent.current = true;
    router.push({ pathname: "/onboarding", params: { next: pathname } });
  }, [ready, user, pathname, router]);

  const requireLogin = useCallback(
    (
      action: GateAction,
      next: string,
      run?: () => void,
      data?: Record<string, string>,
    ) => {
      if (getToken()) {
        // 카카오로 가입만 하고 온보딩을 안 마쳤으면 온보딩(SCR-06)부터. 끝나면 이 화면으로 돌아와 행동을 잇는다
        // 탭 열기(소식·채팅·내 정보 둘러보기)는 그대로 둔다
        if (userRef.current?.needsOnboarding && action !== "tab") {
          setResume({ action, next, data });
          router.push({ pathname: "/onboarding", params: { next } });
          return;
        }
        run?.();
        return;
      }
      setGate({ action, next, data });
    },
    [router],
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

  // 화면 전환 pageview, 로그인 identify(내부 userId만), 로그아웃 reset (DEV-71)
  useAnalytics("consumer", user, ready);

  // 가입 온보딩이 남았거나 온보딩 화면(1/2, 2/2)에 있는 동안에는 이어서 할 행동을 숨긴다.
  // 스택 아래의 원래 화면이 먼저 행동을 실행하지 않게 하고, 온보딩을 마치고 돌아가면 보인다
  const onboarding = pathname.startsWith("/onboarding");
  const visibleResume = user?.needsOnboarding || onboarding ? null : resume;
  const value = useMemo<Session>(
    () => ({
      user,
      ready,
      refresh,
      requireLogin,
      resume: visibleResume,
      hasResume: !!resume,
      clearResume,
      restoreResume: setResume,
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
      visibleResume,
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
