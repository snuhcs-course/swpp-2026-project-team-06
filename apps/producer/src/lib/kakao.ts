// 생산자 앱 카카오 로그인 왕복 저장 (FEAT-01 I2, ADR 0003·0010, DEV-74) — 웹. iOS·Android는 kakao.native.ts(DEV-33).
// 카카오 인가 화면으로 나갔다 /auth/kakao 로 돌아오면 페이지가 새로 뜨므로 state 일회용 값만 sessionStorage에 둔다.
// 돌아온 뒤 갈 화면은 세션 관문이 농가 상태(없음·확인 중·반려·승인·정지)로 정한다.
// 앱에서 시작한 로그인(state가 app-으로 시작)이 이 웹 복귀 화면으로 떨어지면 코드를 앱 스킴으로 넘긴다(appReturnUrl).
import type { KakaoConfig } from "@farmclub/api";

export const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
/** 복귀 경로. 서버 KAKAO_REDIRECT_PATH·카카오 콘솔 등록 값과 같다 */
export const KAKAO_REDIRECT_PATH = "/auth/kakao";
/** app.json scheme. 앱에서 시작한 로그인의 복귀 주소 */
export const APP_SCHEME = "farmclub-producer";
/** 앱에서 시작한 인가 요청의 state 접두어 */
export const APP_STATE_PREFIX = "app-";
const RETURN_KEY = "farmclub-producer:kakao-return";

function store(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** 생산자 앱의 복귀 주소. 카카오 콘솔에 등록한 값과 같아야 한다 */
export function kakaoRedirectUri(config: Pick<KakaoConfig, "redirectPath">) {
  return `${window.location.origin}${config.redirectPath}`;
}

/** 복귀 화면이 서버에 보내는 redirectUri(인가 요청과 같은 값) */
export function kakaoCallbackUri() {
  return kakaoRedirectUri({ redirectPath: KAKAO_REDIRECT_PATH });
}

/** 앱(iOS·Android)에서 시작한 로그인이면 코드를 그대로 넘길 앱 주소. 웹에서 시작했으면 null(DEV-33) */
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

/** 앱 주소(farmclub-producer://auth/kakao?code=…)에서 code·state·error를 꺼낸다. 앱(kakaoAuth.native.ts)이 쓴다 */
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

/** state를 저장하고 카카오 인가 주소를 돌려준다. 저장소를 못 쓰면 null */
export function beginKakaoLogin(config: KakaoConfig): string | null {
  const s = store();
  if (!s || !config.clientId) return null;
  const nonce = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    s.setItem(RETURN_KEY, nonce);
  } catch {
    return null;
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: kakaoRedirectUri(config),
    response_type: "code",
    state: nonce,
    // 소비자 앱과 같은 동의 항목(카카오계정 이메일). 대표자 이름·연락처는 가입 신청(SCR-20)에서 받는다
    scope: "account_email",
  });
  return `${KAKAO_AUTHORIZE_URL}?${params.toString()}`;
}

/** 저장해 둔 state를 꺼내고 지운다(한 번만 쓴다) */
export function takeKakaoNonce(): string | null {
  const s = store();
  if (!s) return null;
  try {
    const v = s.getItem(RETURN_KEY);
    s.removeItem(RETURN_KEY);
    return v;
  } catch {
    return null;
  }
}
