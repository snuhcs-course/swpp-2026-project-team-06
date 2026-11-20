// 아이디·비밀번호 규칙(DEV-363). 서버 app/accounts/passwords.py와 같은 규칙이고 화면은 누를 때 먼저 본다.
// 아이디 계정은 운영자가 만든다(공개 가입 없음). 앱은 비밀번호 변경 화면에서 비밀번호 규칙만 쓴다.
// 흔한 비밀번호 목록은 서버가 다시 본다(여기는 짧은 목록만). 최종 판단은 언제나 서버다.

export const USERNAME_RE = /^[a-z][a-z0-9]{3,19}$/;
export const USERNAME_RULE = "아이디는 영문 소문자로 시작하는 영문 소문자·숫자 4~20자예요";
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
/** 비밀번호 변경 화면에 늘 보이는 규칙(PM 11/18: 규칙을 화면에 보인다) */
export const PASSWORD_RULE = "8~128자 · 아이디와 같거나 흔한 비밀번호는 쓸 수 없어요";
/** 로그인 화면 비밀번호 찾기 안내(PM 11/18). 이메일 재설정은 없다 */
export const FORGOT_PASSWORD_TEXT = "비밀번호를 잊었다면 farmclub에 문의해 주세요";
export const INVALID_LOGIN_TEXT = "아이디 또는 비밀번호가 맞지 않아요";

const RESERVED = new Set([
  "admin", "administrator", "farmclub", "support", "root", "system", "operator", "manager",
  "kakao", "test", "tester", "null", "undefined", "official", "help", "staff",
]);
const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "11111111",
  "00000000", "qwerty123", "qwer1234", "1q2w3e4r", "asdf1234", "abcd1234", "iloveyou",
  "farmclub", "farmclub1", "farmclub123",
]);

/** 앞뒤 공백을 지우고 소문자로(서버 normalize_username) */
export function normalizeUsername(raw: string): string {
  const value = raw.trim();
  // ASCII일 때만 소문자로(서버와 같음). 켈빈 기호 같은 글자가 k로 바뀌지 않게
  return /^[\x00-\x7F]*$/.test(value) ? value.toLowerCase() : value;
}

export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (!u) return "아이디를 적어 주세요";
  if (!USERNAME_RE.test(u)) return USERNAME_RULE;
  if (RESERVED.has(u)) return "쓸 수 없는 아이디예요";
  return null;
}

export function passwordError(password: string, username?: string): string | null {
  if (!password) return "비밀번호를 적어 주세요";
  // 서버는 코드 포인트로 센다. 화면도 같게(이모지 등)
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN || length > PASSWORD_MAX)
    return `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자로 적어 주세요`;
  if (!password.trim()) return "공백만으로는 비밀번호를 만들 수 없어요";
  if (username && password.toLowerCase() === normalizeUsername(username))
    return "아이디와 다른 비밀번호를 써 주세요";
  if (COMMON.has(password.toLowerCase())) return "너무 흔한 비밀번호예요. 다른 비밀번호를 써 주세요";
  return null;
}

/** 429 RATE_LIMITED의 남은 시간(초) → ‘N분’ */
export function retryMinutes(seconds: unknown): number {
  const s = typeof seconds === "number" && seconds > 0 ? seconds : 60;
  return Math.max(1, Math.ceil(s / 60));
}
