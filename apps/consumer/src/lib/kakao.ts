// 카카오 로그인 왕복 저장 (FEAT-01 I2, ADR 0003) — 웹. iOS·Android는 kakao.native.ts(DEV-33).
// 카카오 인가 화면으로 나갔다 /auth/kakao 로 돌아오면 페이지가 새로 뜨므로, 돌아갈 화면과 이어서 할 행동을 sessionStorage에 잠깐 둔다.
// 앱에서 시작한 로그인(state가 app-으로 시작)이 이 웹 복귀 화면으로 떨어지면 코드를 앱 스킴으로 넘긴다(appReturnUrl).
import type { KakaoConfig } from "@farmclub/api";

import type { Resume } from "./session";

export const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
/** 복귀 경로. 서버 KAKAO_REDIRECT_PATH·카카오 콘솔 등록 값과 같다 */
export const KAKAO_REDIRECT_PATH = "/auth/kakao";
/** app.json scheme. 앱에서 시작한 로그인의 복귀 주소 */
export const APP_SCHEME = "farmclub-consumer";
/** 앱에서 시작한 인가 요청의 state 접두어 */
export const APP_STATE_PREFIX = "app-";
const RETURN_KEY = "farmclub-consumer:kakao-return";

export type KakaoReturn = {
  /** 인가 요청의 state. 돌아올 때 같아야 한다 */
  nonce: string;
  /** 로그인 뒤 갈 화면 */
  next: string;
  /** 관문 시트에서 왔으면 이어서 할 행동 */
  resume: Resume | null;
};

function store(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** 각 앱의 복귀 주소. 카카오 콘솔에 등록한 값과 같아야 한다 */
export function kakaoRedirectUri(config: Pick<KakaoConfig, "redirectPath">) {
  return `${window.location.origin}${config.redirectPath}`;
}

/** 복귀 화면이 서버에 보내는 redirectUri(인가 요청과 같은 값) */
export function kakaoCallbackUri() {
  return kakaoRedirectUri({ redirectPath: KAKAO_REDIRECT_PATH });
}

/**
 * 앱(iOS·Android)에서 시작한 로그인이면 코드를 그대로 넘길 앱 주소. 웹에서 시작했으면 null.
 * 카카오 콘솔 복귀 주소가 https뿐이라 앱도 이 웹 화면으로 돌아오고, 여기서 앱 스킴으로 한 번 더 넘긴다(DEV-33)
 */
export function appReturnUrl(params: {
  code?: string;
  state?: string;
  error?: string;
}): string | null {
  if (!params.state?.startsWith(APP_STATE_PREFIX)) return null;
  const q = new URLSearchParams();
  for (const k of ["code", "state", "error"] as const) {
    const v = params[k];
    if (v) q.set(k, v);
  }
  return `${APP_SCHEME}://auth/kakao?${q.toString()}`;
}

/** 웹 복귀 화면에서 앱으로 넘긴다(페이지 이동). 앱에서는 아무것도 하지 않는다 */
export function forwardToApp(url: string) {
  window.location.replace(url);
}

/** 돌아갈 곳을 저장하고 카카오 인가 주소를 돌려준다. 저장소를 못 쓰면 null */
export function beginKakaoLogin(
  config: KakaoConfig,
  next: string,
  resume: Resume | null,
): string | null {
  const s = store();
  if (!s || !config.clientId) return null;
  const nonce = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    s.setItem(RETURN_KEY, JSON.stringify({ nonce, next, resume } satisfies KakaoReturn));
  } catch {
    return null;
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: kakaoRedirectUri(config),
    response_type: "code",
    state: nonce,
    // 카카오계정 이메일만 요청(FEAT-01 FQ-01, 콘솔 동의 항목 ‘카카오계정(이메일)’ 필수 동의). 서버는 표시 이름으로만 쓴다
    scope: "account_email",
  });
  return `${KAKAO_AUTHORIZE_URL}?${params.toString()}`;
}

/** 저장해 둔 복귀 정보를 꺼내고 지운다(한 번만 쓴다) */
export function takeKakaoReturn(): KakaoReturn | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(RETURN_KEY);
    s.removeItem(RETURN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<KakaoReturn>;
    if (typeof v.nonce !== "string") return null;
    return {
      nonce: v.nonce,
      next: typeof v.next === "string" && v.next.startsWith("/") ? v.next : "/",
      resume: v.resume ?? null,
    };
  } catch {
    return null;
  }
}

/** 앱 주소(farmclub-consumer://auth/kakao?code=…)에서 code·state·error를 꺼낸다. 앱(kakaoAuth.native.ts)이 쓴다 */
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
