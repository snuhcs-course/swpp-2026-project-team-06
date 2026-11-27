// 내 정보(auth/me) 상태 도우미(DEV-494).
import type { User } from "./types";

/**
 * 다시 읽은 내 정보가 이전과 같으면 이전 객체를 그대로 쓴다.
 * 403 관문 응답마다 세션이 내 정보를 다시 읽는데, 내용이 같아도 새 객체면 `[user]`에 걸린 effect가 다시 돌아
 * 같은 요청을 또 보내고 또 403을 받는 고리가 생겼다(소비자 재동의 대기 중 초당 약 10번).
 */
export function keepUser(prev: User | null, next: User | null): User | null {
  if (prev === next || !prev || !next) return next;
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

/**
 * 계정 관문(임시 비밀번호 변경·가입 온보딩·약관 재동의)이 남아 서버가 개인 API를 403으로 막는 동안인가.
 * 이때는 배지 같은 주기 요청을 보내지 않는다(관문 화면이 끝나면 내 정보가 바뀌어 다시 시작한다).
 */
export function accountGated(user: User | null | undefined): boolean {
  return !!user && (!!user.mustChangePassword || !!user.needsOnboarding || !!user.consentRequired);
}
