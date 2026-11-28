// Korean particles after a quoted word: ‘천혜향’으로, ‘조만간’은, ‘10년’이 (DEV-452 QA 11/28).
const DIGIT_FINAL = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

/** Final consonant of the last spoken syllable: 0 none, 8 ㄹ, other numbers a consonant. */
function finalOf(word: string): number {
  const last = word.trim().replace(/[\s’'")\]]+$/, "").slice(-1);
  const spoken = /\d/.test(last) ? DIGIT_FINAL[Number(last)] : last;
  const code = spoken.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? code % 28 : 0;
}

/** word + 이/가, 은/는, 을/를 or 으로/로, picked by its last sound. */
export function josa(word: string, pair: "이가" | "은는" | "을를" | "으로"): string {
  const final = finalOf(word);
  if (pair === "으로") return word + (final === 0 || final === 8 ? "로" : "으로");
  const [withFinal, without] = { 이가: ["이", "가"], 은는: ["은", "는"], 을를: ["을", "를"] }[pair];
  return word + (final ? withFinal : without);
}
