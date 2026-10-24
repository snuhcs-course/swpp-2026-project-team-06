// PostHog 화면 이벤트·세션 녹화·히트맵(ADR 0005, DEV-71) — 웹(posthog-js). iOS·Android는 client.native.ts(posthog-react-native, DEV-33).
// 확정 사실(결제·취소 등)은 서버가 보낸다.
// - EXPO_PUBLIC_POSTHOG_KEY가 비면 아무것도 하지 않는다(로컬·Mock·CI·Playwright). 이 파일은 웹에서만 켠다.
// - 접속 호스트가 운영 도메인(privacy.ts PRODUCTION_HOSTS, EXPO_PUBLIC_POSTHOG_HOSTS로 덮어씀)이 아니면
//   켜지 않는다(DEV-125). Vercel 기본 주소·데모·localhost에서 연 운영 빌드가 실사용자 지표에 섞이지 않게.
// - 사용자 구분은 내부 userId만(N-05). 이름·연락처·주소·메시지 본문은 보내지 않는다.
// Expo가 빌드 때 process.env.EXPO_PUBLIC_* 를 값으로 바꾼다. 앱 tsconfig에 Node 타입이 없어 여기서만 선언한다.
declare const process: {
  env: {
    EXPO_PUBLIC_POSTHOG_KEY?: string;
    EXPO_PUBLIC_POSTHOG_HOST?: string;
    EXPO_PUBLIC_POSTHOG_HOSTS?: string;
  };
};

import { usePathname } from "expo-router";
import posthog from "posthog-js";
import { useEffect } from "react";
import { Platform } from "react-native";

import {
  cleanProps,
  isAllowedHost,
  maskText,
  parseHosts,
  scrubUrls,
  type AppEventName,
  type AppEvents,
  type AppName,
} from "./privacy";

const KEY = (process.env.EXPO_PUBLIC_POSTHOG_KEY || "").trim();
const HOST = (
  process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
).replace(/\/+$/, "");

const HOSTS = parseHosts(process.env.EXPO_PUBLIC_POSTHOG_HOSTS);

let started = false;

/** 키가 있고 웹이고 운영 도메인이면 한 번 초기화한다. 켜졌는지 돌려준다 */
function start(app: AppName): boolean {
  if (started) return true;
  if (!KEY || Platform.OS !== "web" || typeof window === "undefined")
    return false;
  if (!isAllowedHost(window.location.hostname, HOSTS)) return false;
  posthog.init(KEY, {
    api_host: HOST,
    defaults: "2026-08-30",
    // 화면 전환은 Expo Router 경로로 직접 보낸다(useAnalytics)
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: "identified_only",
    // 자동 수집·히트맵은 위치·요소 종류만. 버튼·카드의 글자와 속성(href 등)은 보내지 않는다
    mask_all_text: true,
    mask_all_element_attributes: true,
    enable_heatmaps: true,
    capture_performance: false,
    enable_recording_console_log: false,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    session_recording: {
      maskAllInputs: true,
      // 모든 글자를 maskTextFn에 넘기고, 개인정보 경로·영역이면 가린다
      maskTextSelector: "*",
      maskTextFn: (text, element) =>
        maskText(app, window.location.pathname, text, element),
      recordHeaders: false,
      recordBody: false,
    },
    before_send: (event) => {
      if (!event) return event;
      scrubUrls(event.properties);
      scrubUrls(event.$set as Record<string, unknown> | undefined);
      scrubUrls(event.$set_once as Record<string, unknown> | undefined);
      return event;
    },
  });
  posthog.register({ app });
  started = true;
  return true;
}

/** 새 익명 사용자로 다시 시작한다. reset은 공통 속성(app)도 지우므로 다시 넣는다 */
function restart(app: AppName) {
  posthog.reset();
  posthog.register({ app });
}

/** 화면 이벤트(트래킹 플랜). 꺼져 있으면 아무것도 하지 않는다 */
export function track<E extends AppEventName>(event: E, props: AppEvents[E]) {
  if (!started) return;
  posthog.capture(event, cleanProps(event, props));
}

type AnalyticsUser = {
  userId: string;
  role: string;
  isTestAccount: boolean;
} | null;

/**
 * SessionProvider 안에서 한 번 부른다.
 * 화면 전환마다 $pageview, 로그인하면 내부 userId로 identify, 로그아웃(토큰 만료 포함)하면 reset.
 */
export function useAnalytics(
  app: AppName,
  user: AnalyticsUser,
  ready: boolean,
) {
  const pathname = usePathname();

  useEffect(() => {
    if (!start(app)) return;
    posthog.capture("$pageview");
  }, [app, pathname]);

  const userId = user?.userId ?? null;
  const role = user?.role;
  const isTestAccount = user?.isTestAccount;
  useEffect(() => {
    if (!ready || !start(app)) return;
    const identified = posthog.get_property("$user_state") === "identified";
    if (userId) {
      // 다른 계정으로 바뀌었으면 이전 사람과 섞이지 않게 먼저 끊는다
      if (identified && posthog.get_distinct_id() !== userId) restart(app);
      posthog.identify(userId, { app, role, isTestAccount });
    } else if (identified) {
      restart(app);
    }
  }, [app, ready, userId, role, isTestAccount]);
}
