// 첫 가입 온보딩(SCR-06, FEAT-01 I2) 공통 값
import type { ConsentKind } from "@farmclub/api";
import { LEGAL_VERSION, type LegalPath } from "@farmclub/ui";

/** 가입 동의 문구 버전 = 시행 중인 약관·처리방침 버전. 바꾸면 모든 회원이 다시 동의한다(policy.md 5장, DEV-113) */
export const SIGNUP_CONSENT_VERSION = LEGAL_VERSION;

export const SIGNUP_CONSENTS: {
  kind: ConsentKind;
  label: string;
  required: boolean;
  /** ‘보기’ 시트의 요지 */
  summary?: string;
  /** 시트의 ‘전문 보기’가 여는 화면(DEV-113) */
  fullText?: LegalPath;
}[] = [
  {
    kind: "TERMS",
    label: "이용약관",
    required: true,
    fullText: "/terms",
    summary:
      "farmclub은 농가가 올린 귤을 수확 전에 예약 판매해요. 예약은 수확 기간 안에 배송되고, 배송 전에는 취소할 수 있어요. 지금은 테스트 서비스라 실제 결제·배송은 일어나지 않아요.",
  },
  {
    kind: "PRIVACY",
    label: "개인정보 수집·이용",
    required: true,
    fullText: "/privacy",
    summary:
      "카카오 회원번호·이메일(회원 식별·연락), 닉네임(농가 채팅·소식방 표시), 이름·휴대폰 번호·배송지(주문 배송·농가 문의)를 받아요. 농가에는 주문의 받는 사람·연락처·주소만 배송을 위해 넘겨요. 탈퇴하면 지우고, 법으로 보관해야 하는 거래 기록만 정해진 기간 동안 따로 보관해요.",
  },
  { kind: "AGE14", label: "만 14세 이상이에요", required: true },
  {
    kind: "MARKETING",
    label: "농가 소식·혜택 알림 받기",
    required: false,
    summary:
      "팔로우한 농가의 수확 소식과 예약 혜택을 알려 드려요. 언제든 끌 수 있고, 꺼도 주문·배송 안내는 받아요.",
  },
];

export const PHONE = /^01[016789]-?\d{3,4}-?\d{4}$/;

/** 휴대폰 번호를 입력하는 대로 010-1234-5678 꼴로 맞춘다 */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 다음 화면 주소. 앱 안 경로만 받는다 */
export function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
