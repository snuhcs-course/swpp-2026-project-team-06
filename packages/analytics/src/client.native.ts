// PostHog 화면 이벤트(ADR 0005) — iOS·Android(posthog-react-native, DEV-33). 웹은 client.ts(posthog-js).
// - EXPO_PUBLIC_POSTHOG_KEY가 비면 아무것도 하지 않는다. 키는 EAS 환경 변수로 빌드 때 넣는다.
// - 세션 녹화·히트맵은 켜지 않는다(네이티브 녹화는 별도 검토). 허용 호스트 검사(DEV-125)는 웹 전용이라 여기엔 없다.
// - 사용자 구분은 내부 userId만(N-05). 이름·연락처·주소·메시지 본문은 보내지 않는다.
declare const process: {
  env: {
    EXPO_PUBLIC_POSTHOG_KEY?: string;
    EXPO_PUBLIC_POSTHOG_HOST?: string;
  };
};

import { usePathname } from "expo-router";
import { PostHog } from "posthog-react-native";
import { useEffect } from "react";

import {
  cleanProps,
  type AppEventName,
  type AppEvents,
  type AppName,
} from "./privacy";

const KEY = (process.env.EXPO_PUBLIC_POSTHOG_KEY || "").trim();
const HOST = (
  process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
).replace(/\/+$/, "");

let client: PostHog | null = null;
/** identify한 userId. reset하면 null */
let identifiedAs: string | null = null;

/** 키가 있으면 한 번 초기화한다. 꺼져 있으면 null */
function start(app: AppName): PostHog | null {
  if (client) return client;
  if (!KEY) return null;
  client = new PostHog(KEY, {
    host: HOST,
    // 앱 설치·열기·백그라운드 이벤트. 화면 전환은 Expo Router 경로로 직접 보낸다(useAnalytics)
    captureAppLifecycleEvents: true,
    enableSessionReplay: false,
    disableSurveys: true,
  });
  void client.register({ app });
  return client;
}

/** 새 익명 사용자로 다시 시작한다. reset은 공통 속성(app)도 지우므로 다시 넣는다 */
function restart(ph: PostHog, app: AppName) {
  ph.reset();
  identifiedAs = null;
  void ph.register({ app });
}

/** 화면 이벤트(트래킹 플랜). 꺼져 있으면 아무것도 하지 않는다 */
export function track<E extends AppEventName>(event: E, props: AppEvents[E]) {
  if (!client) return;
  client.capture(event, cleanProps(event, props));
}

type AnalyticsUser = {
  userId: string;
  role: string;
  isTestAccount: boolean;
} | null;

/**
 * SessionProvider 안에서 한 번 부른다.
 * 화면 전환마다 screen, 로그인하면 내부 userId로 identify, 로그아웃(토큰 만료 포함)하면 reset.
 */
export function useAnalytics(
  app: AppName,
  user: AnalyticsUser,
  ready: boolean,
) {
  const pathname = usePathname();

  useEffect(() => {
    const ph = start(app);
    if (!ph) return;
    void ph.screen(pathname);
  }, [app, pathname]);

  const userId = user?.userId ?? null;
  const role = user?.role;
  const isTestAccount = user?.isTestAccount;
  useEffect(() => {
    if (!ready) return;
    const ph = start(app);
    if (!ph) return;
    if (userId) {
      // 다른 계정으로 바뀌었으면 이전 사람과 섞이지 않게 먼저 끊는다
      if (identifiedAs && identifiedAs !== userId) restart(ph, app);
      ph.identify(userId, {
        app,
        role: role ?? "",
        isTestAccount: isTestAccount ?? false,
      });
      identifiedAs = userId;
    } else if (identifiedAs) {
      restart(ph, app);
    }
  }, [app, ready, userId, role, isTestAccount]);
}
