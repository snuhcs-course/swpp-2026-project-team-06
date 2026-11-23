// 택배사 코드(screens.md 7.1)와 소비자 배송 조회 링크(SCR-14)
import type { Carrier } from "./types";

export const CARRIERS: { code: Carrier; label: string }[] = [
  { code: "CJ", label: "CJ대한통운" },
  { code: "EPOST", label: "우체국택배" },
  { code: "HANJIN", label: "한진택배" },
  { code: "LOTTE", label: "롯데택배" },
  { code: "LOGEN", label: "로젠택배" },
  { code: "ETC", label: "기타" },
];

export function carrierLabel(code: Carrier | null | undefined): string {
  return CARRIERS.find((c) => c.code === code)?.label ?? "";
}

/** 택배사 조회 페이지. 기타·송장 없음이면 null(배송 조회 숨김) */
export function trackingUrl(
  code: Carrier | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  if (!code || !trackingNumber) return null;
  const n = encodeURIComponent(trackingNumber.replace(/[^0-9A-Za-z]/g, ""));
  switch (code) {
    case "CJ":
      return `https://trace.cjlogistics.com/next/tracking.html?wblNo=${n}`;
    case "EPOST":
      return `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${n}`;
    case "HANJIN":
      return `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${n}`;
    case "LOTTE":
      return `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${n}`;
    case "LOGEN":
      return `https://www.ilogen.com/web/personal/trace/${n}`;
    default:
      return null;
  }
}

/** 숫자를 입력하는 동안 택배사별 구분자를 넣는다. 원문 숫자는 자르지 않는다. */
export function formatTrackingNumber(code: Carrier | null | undefined, value: string): string {
  if (!CARRIERS.some(c => c.code === code) || code === "ETC" || !/^[\d\s-]*$/.test(value)) return value;
  const digits = value.replace(/[\s-]/g, "");
  const groups = code === "EPOST" ? [6] : code === "LOGEN" && digits.length <= 11 ? [3, 4] : [4, 4];
  const parts: string[] = [];
  let offset = 0;
  for (const size of groups) {
    if (digits.length <= offset) break;
    parts.push(digits.slice(offset, offset + size));
    offset += size;
  }
  if (digits.length > offset) parts.push(digits.slice(offset));
  const formatted = parts.join("-");
  return formatted.length <= 50 ? formatted : digits;
}

type TextSelection = { start: number; end: number };

/** 구분자 삽입 뒤에도 숫자 기준 커서·선택 범위를 보존한다. */
export function editTrackingNumber(
  code: Carrier | null | undefined,
  previous: string,
  raw: string,
  selection: TextSelection,
  previousSelection: TextSelection,
): { text: string; selection: TextSelection } {
  let start = selection.start, end = selection.end;
  const numeric = CARRIERS.some(c => c.code === code) && code !== "ETC" && /^[\d\s-]*$/.test(raw);
  if (numeric && raw.length === previous.length - 1 && start === end &&
      previousSelection.start === previousSelection.end && previous[start] === "-" &&
      raw.replace(/\D/g, "") === previous.replace(/\D/g, "")) {
    // Backspace/Delete at a separator removes the adjacent digit, instead of trapping the cursor.
    const backward = previousSelection.start > start;
    const at = backward ? start - 1 : start;
    if (at >= 0 && /\d/.test(raw[at] ?? "")) {
      raw = raw.slice(0, at) + raw.slice(at + 1);
      start = end = backward ? at : start;
    }
  }
  const text = formatTrackingNumber(code, raw);
  if (text === raw) return { text, selection: { start, end } };
  const position = (index: number) => {
    const count = raw.slice(0, index).replace(/\D/g, "").length;
    let pos = 0, seen = 0;
    while (pos < text.length && seen < count) if (/\d/.test(text[pos++])) seen++;
    if (index > 0 && /[\s-]/.test(raw[index - 1]))
      while (pos < text.length && /[\s-]/.test(text[pos])) pos++;
    return pos;
  };
  return { text, selection: { start: position(start), end: position(end) } };
}
