// 입금자명(짧은 입금 코드, DEV-342 · R-28). 서버 server/app/orders/deposit_code.py와 같은 규칙. import 없는 순수 모듈(Mock·테스트가 읽음).
// 이름은 농가에 이미 보이는 가림 이름(publicName: 닉네임, 없으면 이름 앞 글자)에서 한글 음절·로마자만 남긴 앞 3글자(PM 11/17).
// 남는 글자가 없으면 ‘주문’. 숫자 2자리(5자), 같은 이름이 100개 다 쓰였으면 숫자 3자리(6자). 계정 실명·받는 사람 이름은 쓰지 않는다.

const NAME_LENGTH = 3;
const DIGITS = [2, 3];

export function depositCodeName(name: string | null | undefined): string {
  return (name ?? "").replace(/[^가-힣A-Za-z]/g, "").slice(0, NAME_LENGTH) || "주문";
}

/** taken(같은 농가에서 쓰는 중인 입금자명)과 대소문자를 가리지 않고 겹치지 않는 값. 남은 값이 없으면 null */
export function pickDepositCode(
  name: string,
  taken: Set<string>,
  choose: (free: string[]) => string = (free) => free[Math.floor(Math.random() * free.length)],
): string | null {
  const used = new Set([...taken].map((c) => c.toUpperCase()));
  for (const digits of DIGITS) {
    const free: string[] = [];
    for (let n = 0; n < 10 ** digits; n += 1) {
      const code = `${name}${String(n).padStart(digits, "0")}`;
      if (!used.has(code.toUpperCase())) free.push(code);
    }
    if (free.length) return choose(free);
  }
  return null;
}
