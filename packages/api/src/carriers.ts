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
