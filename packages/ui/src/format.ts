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

/** 한국 날짜 "2026-10-07" — 대화 날짜 구분처럼 같은 날을 묶는 키(UTC 날짜가 아님) */
export function seoulDay(iso: string) {
  const d = toSeoul(iso);
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** "2026년 10월 7일" — 대화 날짜 구분(소식방·Figma v6와 같은 형식) */
export function longDate(iso: string) {
  const d = toSeoul(iso);
  return `${d.year}년 ${d.month}월 ${d.day}일`;
}

/** 대화 날짜 구분: 첫 메시지이거나 앞 메시지와 한국 날짜가 다르면 "2026년 10월 7일", 같으면 null */
export function daySeparator(iso: string, prev?: string) {
  return prev && seoulDay(prev) === seoulDay(iso) ? null : longDate(iso);
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** "10월 7일 (화)" */
export function mdw(iso: string) {
  const d = toSeoul(iso);
  return `${d.month}월 ${d.day}일 (${WEEK[d.weekday]})`;
}

/** "10월 19일 (일) 01:06" — 입금 기한 같은 마감 시각 */
export function deadline(iso: string | null | undefined) {
  if (!iso) return "";
  const d = toSeoul(iso);
  return `${mdw(iso)} ${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`;
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

/* ---------------- 빈 값 규칙 (DEV-227) ----------------
 * 라벨과 값은 한 덩어리로 보고 값이 없으면 라벨째 뺀다. '-'·'0명'·오늘 날짜 같은 자리표시자를 만들지 않는다(M-11).
 * 확정 전 값은 데이터에서 유도할 수 있을 때만 '예상'을 붙여 보이고, 유도할 수 없으면 '확정 전'이라고 말한다. */

/** 빈 조각은 버리고 " · "로 잇는다. "38명 예약 · 마감 D-5" / "마감 D-9" / "" */
export const joinMeta = (...parts: (string | null | undefined | false)[]) =>
  parts.filter((p): p is string => !!p && p.trim() !== "").join(" · ");

/** 예약 수는 1명부터 말한다(0명은 빈 글자). */
export const reservedText = (n: number | null | undefined) =>
  n != null && n > 0 ? `${n}명 예약` : "";

/** "마감 D-9" — 마감일이 없으면 빈 글자 */
export const closesText = (n: number | null | undefined) =>
  n == null ? "" : `마감 ${dday(n)}`;

/** 예약할 수 없는 이유 이름(ia.md 4장 레이블). 소비자 카드·상세·생산자 목록이 같은 표를 쓴다. */
export const AVAILABILITY_LABEL: Record<string, string> = {
  PAUSED: "판매 일시 중지",
  ENDED: "예약 종료",
  NOT_OPEN: "예약 시작 전",
  TOTAL_SOLD_OUT: "전체 물량 품절",
  PERIOD_SOLD_OUT: "이번 기간 품절",
  AVAILABLE: "예약 가능",
};

/** 가격 자리에 들어갈 이름. 상품은 예약 가능하지만 이 옵션만 이번 기간에 다 팔렸으면 '이번 기간 품절'. */
export function unavailableLabel(availability?: string | null) {
  return availability && availability !== "AVAILABLE" && AVAILABILITY_LABEL[availability]
    ? AVAILABILITY_LABEL[availability]
    : AVAILABILITY_LABEL.PERIOD_SOLD_OUT;
}

/** 당도 블록 글자(실측이 없을 때). 예상이 없으면 숫자를 만들지 않는다(FEAT-07, M-11·M-15). */
export function brixText(expected: number | null | undefined) {
  return expected != null && Number.isFinite(expected)
    ? {
        title: `측정 당도 ${expected}Brix`,
        note: "농가가 등록한 당도예요",
      }
    : {
        title: "당도 등록 전",
        note: "궁금하면 1:1 채팅으로 농가에 물어보세요",
      };
}

const XUN = (day: number) => (day <= 10 ? "초순" : day <= 20 ? "중순" : "하순");

/**
 * 받는 시기. 확정 값이 있으면 "11월 10일~20일 도착 예정"(카드는 "도착").
 * 없으면 마지막 예약 기간 끝날에서 유도한 "10월 중순 이후 도착 예상"(FEAT-05: 마지막 예약 종료일 < 배송 시작일),
 * 그것도 없으면 "받는 시기 확정 전".
 */
export function deliveryText(
  window: { start?: string | null; end?: string | null } | null | undefined,
  lastReservationEnd?: string | null,
  short = false,
) {
  if (window?.start && window?.end)
    return `${period(window.start, window.end)} ${short ? "도착" : "도착 예정"}`;
  if (lastReservationEnd) {
    const d = toSeoul(lastReservationEnd);
    return `${d.month}월 ${XUN(d.day)} 이후 도착 예상`;
  }
  return "받는 시기 확정 전";
}

/** 받는 시기가 확정 전일 때 붙이는 문장(R-03: 결제 전에 배송 예정 기간을 보여 준다) */
export const DELIVERY_PENDING_NOTE = "받는 시기는 예약 전에 확정돼요.";

/** 배송비 줄. 별도인데 금액이 없으면 "배송비 확정 전"(농가 기본 배송비는 구조화된 값이 없어 유도하지 않는다). */
export function shippingText(
  type: "FREE" | "SEPARATE" | string,
  fee: number | null | undefined,
) {
  if (type === "FREE") return "무료배송";
  return fee != null && fee > 0 ? `배송비 ${won(fee)}` : "배송비 확정 전";
}

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

/** 받침에 따라 "을/를"(예: 입금자명을, 계좌번호를). 한글로 끝나지 않으면 "을" */
export function eulReul(word: string) {
  const c = word.trim().charCodeAt(word.trim().length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${word}을`;
  return (c - 0xac00) % 28 ? `${word}을` : `${word}를`;
}
