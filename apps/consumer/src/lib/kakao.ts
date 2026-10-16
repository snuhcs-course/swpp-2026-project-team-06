// 카카오 로그인 왕복 저장 (FEAT-01 I2, ADR 0003)
// 카카오 인가 화면으로 나갔다 /auth/kakao 로 돌아오면 페이지가 새로 뜨므로, 돌아갈 화면과 이어서 할 행동을 sessionStorage에 잠깐 둔다.
import type { KakaoConfig } from "@farmclub/api";

import type { Resume } from "./session";

export const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
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
export function kakaoRedirectUri(config: KakaoConfig) {
  return `${window.location.origin}${config.redirectPath}`;
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
