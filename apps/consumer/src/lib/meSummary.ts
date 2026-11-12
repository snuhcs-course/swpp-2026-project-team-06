// SCR-17 내 정보 첫 화면 요약 글(DEV-316). 첫 화면에는 실명·휴대폰·이메일·주소를 두지 않는다.
// 그 값은 하위 화면(내 정보 고치기 `/me/profile`, 배송지 관리 `/me/addresses`)에서만 보인다.

export const NICKNAME_PROMPT = "닉네임을 정해 주세요";
export const NO_NICKNAME = "닉네임 없음";

type HeadingUser = {
  nickname?: string | null;
  isTestAccount: boolean;
};

/**
 * 머리 글. 닉네임이 없어도 실명으로 대신하지 않는다.
 * 닉네임 없는 카카오 계정은 서버·Mock이 늘 가입 전(`needsOnboarding`)으로 보므로 바로 아래 ‘가입 마치기’가 닉네임을 받는다.
 * 테스트 계정은 고칠 화면이 없어 행동을 권하지 않는다.
 */
export function meHeading(user: HeadingUser): string {
  const nickname = user.nickname?.trim();
  if (nickname) return nickname;
  return user.isTestAccount ? NO_NICKNAME : NICKNAME_PROMPT;
}

/** 배송지 관리 행 부제. 주소 대신 개수만 */
export function addressSummary(count: number): string {
  return count > 0 ? `저장한 배송지 ${count}개` : "저장한 배송지가 없어요";
}
