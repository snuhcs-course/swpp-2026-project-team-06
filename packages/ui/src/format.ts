// 화면 표기 도우미. 금액은 천 단위 구분(N-03), 날짜는 한국 시간(Asia/Seoul).

export const won = (n: number | null | undefined) =>
  n == null ? "" : `${n.toLocaleString("ko-KR")}원`;

/** "2026-11-10" 또는 ISO 시각 → "11월 10일" */
export function md(iso: string | null | undefined) {
  if (!iso) return "";
  const d = toSeoul(iso);
  return `${d.month}월 ${d.day}일`;
}

/** "11월 10일~20일" / "11월 24일~12월 4일" */
export function period(
  start: string | null | undefined,
  end: string | null | undefined,
) {
  if (!start || !end) return "";
  const a = toSeoul(start);
  const b = toSeoul(end);
  return a.month === b.month
    ? `${a.month}월 ${a.day}일~${b.day}일`
    : `${a.month}월 ${a.day}일~${b.month}월 ${b.day}일`;
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** "10월 7일 (화)" */
export function mdw(iso: string) {
  const d = toSeoul(iso);
  return `${d.month}월 ${d.day}일 (${WEEK[d.weekday]})`;
}

/** "오후 3:12" */
export function time(iso: string) {
  const d = toSeoul(iso);
  const h = d.hour % 12 || 12;
  return `${d.hour < 12 ? "오전" : "오후"} ${h}:${String(d.minute).padStart(2, "0")}`;
}

/** 오늘이면 시각, 어제면 "어제", 그 밖에는 "10월 2일" */
export function relative(iso: string, today: string) {
  const d = toSeoul(iso);
  const t = toSeoul(`${today}T12:00:00+09:00`);
  const diff = Math.round(
    (Date.UTC(t.year, t.month - 1, t.day) -
      Date.UTC(d.year, d.month - 1, d.day)) /
      86400000,
  );
  if (diff <= 0) return time(iso);
  if (diff === 1) return "어제";
  return md(iso);
}

export const dday = (n: number | null | undefined) =>
  n == null ? "" : n === 0 ? "D-day" : `D-${n}`;

function toSeoul(iso: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const t = dateOnly ? Date.parse(`${iso}T00:00:00+09:00`) : Date.parse(iso);
  const k = new Date(t + 9 * 3600 * 1000);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    weekday: k.getUTCDay(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
  };
}

/** 이름 앞 글자 + ○○ */
export const maskName = (name: string) => `${name.slice(0, 1)}○○`;

/** 받침에 따라 "로/으로" (ㄹ 받침은 "로") */
export function ro(word: string) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${word}로`;
  const jong = (c - 0xac00) % 28;
  return jong === 0 || jong === 8 ? `${word}로` : `${word}으로`;
}
