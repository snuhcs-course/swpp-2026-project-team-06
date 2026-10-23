// 카카오 로그인 왕복 저장 (FEAT-01 I2, ADR 0003) — iOS·Android(DEV-33). 웹은 kakao.ts.
// 인가 화면은 kakaoAuth.native.ts가 인증 세션(expo-web-browser)으로 열고, 복귀 주소는 웹과 같은 https://farmclub.kr/auth/kakao다.
// 웹 복귀 화면이 state의 app- 접두어를 보고 코드를 앱 스킴으로 넘기면 /auth/kakao 화면이 여기 둔 복귀 정보로 이어 간다.
// 인증 세션이 열린 동안 앱 프로세스가 살아 있으므로 복귀 정보는 메모리에 둔다.
// 이 파일은 런타임 import가 없어 Node 테스트(scripts/test-native-config.mjs)가 그대로 읽는다.
declare const process: { env: { EXPO_PUBLIC_CONSUMER_URL?: string } };

import type { KakaoConfig } from "@farmclub/api";

import type { Resume } from "./session";

export const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
export const KAKAO_REDIRECT_PATH = "/auth/kakao";
export const APP_SCHEME = "farmclub-consumer";
export const APP_STATE_PREFIX = "app-";

export type KakaoReturn = {
  nonce: string;
  next: string;
  resume: Resume | null;
};

let saved: KakaoReturn | null = null;

/** 앱 웹 주소(빌드 변수). 서버가 허용하는 복귀 주소의 앞부분 */
export function appOrigin() {
  return (process.env.EXPO_PUBLIC_CONSUMER_URL || "https://farmclub.kr").replace(
    /\/+$/,
    "",
  );
}

/** 복귀 주소. 서버 검증값(<소비자 앱 주소>/auth/kakao)·카카오 콘솔 등록값과 같다 */
export function kakaoRedirectUri(config: Pick<KakaoConfig, "redirectPath">) {
  return `${appOrigin()}${config.redirectPath}`;
}

export function kakaoCallbackUri() {
  return kakaoRedirectUri({ redirectPath: KAKAO_REDIRECT_PATH });
}

/** 돌아갈 곳을 메모리에 두고 카카오 인가 주소를 돌려준다. state는 app- 접두어로 웹 복귀 화면에 앱임을 알린다 */
export function beginKakaoLogin(
  config: KakaoConfig,
  next: string,
  resume: Resume | null,
): string | null {
  if (!config.clientId) return null;
  const nonce = `${APP_STATE_PREFIX}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  saved = { nonce, next, resume };
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: kakaoRedirectUri(config),
    response_type: "code",
    state: nonce,
    scope: "account_email",
  });
  return `${KAKAO_AUTHORIZE_URL}?${params.toString()}`;
}

/** 저장해 둔 복귀 정보를 꺼내고 지운다(한 번만 쓴다) */
export function takeKakaoReturn(): KakaoReturn | null {
  const v = saved;
  saved = null;
  if (!v) return null;
  return {
    nonce: v.nonce,
    next: v.next.startsWith("/") ? v.next : "/",
    resume: v.resume,
  };
}

/** 앱에서는 이미 앱 안이다. 웹 복귀 화면 전용 */
export function appReturnUrl(_params: {
  code?: string;
  state?: string;
  error?: string;
}): string | null {
  return null;
}

export function forwardToApp(_url: string) {}

/** 인증 세션이 돌려준 앱 주소(farmclub-consumer://auth/kakao?code=…)에서 code·state·error를 꺼낸다 */
export function parseKakaoReturn(url: string): {
  code?: string;
  state?: string;
  error?: string;
} {
  const q = url.split("?")[1]?.split("#")[0] ?? "";
  const out: { code?: string; state?: string; error?: string } = {};
  for (const pair of q.split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    const key = decodeURIComponent(k);
    if (key === "code" || key === "state" || key === "error")
      out[key] = decodeURIComponent(v.replace(/\+/g, " "));
  }
  return out;
}
