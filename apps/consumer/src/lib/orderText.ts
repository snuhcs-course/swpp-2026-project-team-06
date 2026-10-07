// 소비자 화면의 주문 상태 문구(screens.md 결정 33, D-13). 상태값은 그대로, ‘출하’ 단어는 쓰지 않는다.
import type { Order } from "@farmclub/api";

export const STATUS_LABEL: Record<Order["status"], string> = {
  PENDING_PAYMENT: "결제 전",
  RESERVED: "예약 완료",
  PREPARING: "수확·포장 중",
  SHIPPED: "배송 중",
  DELIVERED: "배송 완료",
  COMPLETED: "구매 확정",
  CANCELED: "취소됨",
  REFUNDED: "환불됨",
  PARTIALLY_REFUNDED: "일부 환불",
};

/** SCR-14 단계 막대 */
export const STEPS = [
  STATUS_LABEL.RESERVED,
  STATUS_LABEL.PREPARING,
  STATUS_LABEL.SHIPPED,
  STATUS_LABEL.DELIVERED,
] as const;

/** 단계 막대에서 지금 몇 번째까지 찼는지(0이면 막대 없음) */
export const stepIndex = (o: Pick<Order, "status">) =>
  (
    ({
      RESERVED: 1,
      PREPARING: 2,
      SHIPPED: 3,
      DELIVERED: 4,
      COMPLETED: 4,
    }) as Record<string, number>
  )[o.status] ?? 0;
