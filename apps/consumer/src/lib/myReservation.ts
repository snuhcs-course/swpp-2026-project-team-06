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
