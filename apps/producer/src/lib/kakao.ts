// 생산자 앱 카카오 로그인 왕복 저장 (FEAT-01 I2, ADR 0003·0010, DEV-74)
// 카카오 인가 화면으로 나갔다 /auth/kakao 로 돌아오면 페이지가 새로 뜨므로 state 일회용 값만 sessionStorage에 둔다.
// 돌아온 뒤 갈 화면은 세션 관문이 농가 상태(없음·확인 중·반려·승인·정지)로 정한다.
import type { KakaoConfig } from "@farmclub/api";

export const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const RETURN_KEY = "farmclub-producer:kakao-return";

function store(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** 생산자 앱의 복귀 주소. 카카오 콘솔에 등록한 값과 같아야 한다 */
export function kakaoRedirectUri(config: KakaoConfig) {
  return `${window.location.origin}${config.redirectPath}`;
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
