// 주문서 ‘이미 만든 예약’ 상태에서 무엇을 보일지(DEV-356, FEAT-08 AC-08-10, DEV-268 UX ⑥). 순수 함수(scripts/test-placed-notice.mjs).
import type { Order } from "@farmclub/api";

export type PlacedRef = { orderId: string; optionId: string; quantity: number };

export type PlacedView = {
  /** ‘이미 만든 예약이 있어요’ 상자 */
  box: boolean;
  /** 상품 줄 ‘지금 예약가로 잡아 뒀어요’ */
  held: boolean;
  /** 하단 버튼 위 ‘누르면 농가 계좌를 알려 드려요 · 24시간 안에 입금’ */
  hint: boolean;
};

/**
 * - 상자: 이 주문서로 만든 주문이 아직 입금 대기(알리기 전·알린 뒤 모두)일 때. 주문을 읽기 전에는 띄운다(방금 만든 주문).
 *   취소·만료 등으로 입금 대기가 아니면 상자와 캡션을 숨긴다.
 * - 캡션: 상자가 있고, 화면의 옵션·수량이 그 예약과 같을 때만(바꾼 수량을 잡았다고 말하지 않음).
 * - 버튼 위 한 줄: 예약 전에만(이미 만든 예약이면 기한이 흐르는 중이라 ‘24시간 안에’가 사실과 다를 수 있음).
 */
export function placedView(
  placed: PlacedRef | null,
  order: Pick<Order, "orderId" | "status"> | null | undefined,
  optionId: string | undefined,
  quantity: number,
): PlacedView {
  if (!placed) return { box: false, held: false, hint: true };
  const loaded = !!order && order.orderId === placed.orderId;
  const box = !loaded || order.status === "AWAITING_DEPOSIT";
  const held = box && optionId === placed.optionId && quantity === placed.quantity;
  return { box, held, hint: false };
}
