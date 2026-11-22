// 상품 상세 '알아 둘 세 줄' 첫 줄의 '이미 예약했어요 · 내 예약 보기 ›'(SCR-04, DEV-379).
// 내 주문 목록(GET /api/orders?productId=)의 상태만 보고 정한다. 새 서버 필드는 없다.
// 타입 말고는 import하지 않는 순수 모듈이라 Mock 테스트가 node로 바로 읽는다.
import type { Order } from "@farmclub/api";

/** 사용자에게 이미 '예약함'인 상태: 입금 대기·입금 확인 중, 예약 완료·수확·포장·배송 중, 배송 완료·구매 확정.
 *  취소·환불(옛 일부 환불 포함)·입금 안내 전은 지금 예약한 사람이 아니라 'n번째'를 그대로 보인다. */
const RESERVED_STATUSES: ReadonlySet<Order["status"]> = new Set<Order["status"]>([
  "AWAITING_DEPOSIT",
  "RESERVED",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
]);

export const isReservedOrder = (o: Pick<Order, "status">) =>
  RESERVED_STATUSES.has(o.status);

/**
 * 이 상품의 '내 예약 보기' 이동 대상. 없으면 null(지금처럼 'n번째').
 * 주문이 하나면 그 주문 상세, 둘 이상이면 내 주문 목록. 목록은 그 주문들이 모두 같은 탭에 있으면 그 탭을 연다
 * (orderGroups.ts: 구매 확정만 '확정', 나머지 '이미 예약' 상태는 '미확정'). 탭이 갈리면 기본 탭(미확정).
 */
export function myReservationHref(
  orders: readonly Pick<Order, "orderId" | "productId" | "status">[],
  productId: string,
): string | null {
  const mine = orders.filter((o) => o.productId === productId && isReservedOrder(o));
  if (mine.length === 0) return null;
  if (mine.length === 1) return `/orders/${encodeURIComponent(mine[0].orderId)}`;
  const confirmed = mine.filter((o) => o.status === "COMPLETED").length;
  if (confirmed === mine.length) return "/orders?filter=confirmed";
  return confirmed === 0 ? "/orders?filter=pending" : "/orders";
}

/** 한 번 읽은 답. key는 `사용자:상품`이라 계정·상품이 바뀐 직후 옛 답을 가려낸다 */
export type MyReservationAnswer = { key: string; href: string | null };

/** 읽기 실패. key가 null이면 화면을 벗어나거나 키가 바뀌어 읽기를 멈춘 것(실패로 보지 않음) */
export class MyReservationError extends Error {
  // node 테스트가 타입만 걷어 내고 읽으므로 생성자 매개변수 속성은 쓰지 않는다
  readonly key: string | null;
  constructor(key: string | null, cause?: unknown) {
    super(key ? "my reservation load failed" : "my reservation load cancelled", { cause });
    this.key = key;
  }
}

/** 첫 줄 보조 줄이 무엇을 보일지. null = '지금 예약하면 n번째예요'(품절이면 화면이 보조 줄을 뺀다) */
export type MyReservationLine =
  | null
  | { state: "checking" }
  | { state: "reserved"; href: string };

/**
 * 상품 상세 첫 줄의 판단식(DEV-379). 화면은 이 값을 TrustRows의 myReservation으로 옮기기만 한다.
 * - 품절: null(보조 줄 없음 그대로)
 * - 세션 확인 전: 저장된 토큰이 있으면 checking(앱을 새로 켜 바로 들어와도 'n번째'가 먼저 보이지 않게), 없으면 null
 * - 확인 끝났는데 로그인 안 함: null
 * - 지금 키의 답이 있으면 그 답(다시 읽는 중·다시 읽기 실패에도 그대로)
 * - 지금 키의 읽기 실패: null('n번째', 오류 안내 없음)
 * - 그 밖(첫 답 전, 다른 키의 옛 답·옛 실패, 멈춘 읽기): checking(글 없이 높이만)
 */
export function myReservationLine(s: {
  soldOut: boolean;
  sessionReady: boolean;
  hasToken: boolean;
  userId: string | null | undefined;
  key: string;
  answer: MyReservationAnswer | null;
  error: unknown;
}): MyReservationLine {
  if (s.soldOut) return null;
  if (!s.sessionReady) return s.hasToken ? { state: "checking" } : null;
  if (!s.userId) return null;
  if (s.answer?.key === s.key)
    return s.answer.href ? { state: "reserved", href: s.answer.href } : null;
  if (s.error instanceof MyReservationError && s.error.key === s.key) return null;
  return { state: "checking" };
}
