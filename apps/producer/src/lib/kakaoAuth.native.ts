// 카카오 인가 화면 열기 — iOS·Android(DEV-33). 인증 세션(ASWebAuthenticationSession·Custom Tabs)으로 열고,
// 웹 복귀 화면이 앱 스킴(farmclub-producer://auth/kakao?code=…)으로 넘기면 세션이 닫히며 그 주소를 받는다.
// 사용자가 세션을 닫으면 null(로그인 화면에 그대로 남는다).
import * as WebBrowser from "expo-web-browser";

import { APP_SCHEME, parseKakaoReturn } from "./kakao";

export type KakaoAuthResult = { code?: string; state?: string; error?: string };

export async function openKakaoAuth(url: string): Promise<KakaoAuthResult | null> {
  const res = await WebBrowser.openAuthSessionAsync(url, `${APP_SCHEME}://auth/kakao`);
  if (res.type !== "success") return null;
  return parseKakaoReturn(res.url);
}
