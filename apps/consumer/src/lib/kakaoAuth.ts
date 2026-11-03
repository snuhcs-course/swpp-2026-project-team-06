// 카카오 인가 화면 열기 — 웹. 페이지째 이동하므로 돌아오지 않는다(복귀는 /auth/kakao). 앱은 kakaoAuth.native.ts(DEV-33).
export type KakaoAuthResult = { code?: string; state?: string; error?: string };

export async function openKakaoAuth(url: string): Promise<KakaoAuthResult | null> {
  window.location.assign(url);
  return null;
}
