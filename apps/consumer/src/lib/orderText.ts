// 소비자 화면의 주문 상태 문구(screens.md 결정 33, D-13, DEV-207). 상태값은 그대로, ‘출하’ 단어는 쓰지 않는다.
// 라벨은 다음 행동을 할 사람을 따르고(입금 대기 = 내 차례, 입금 확인 중 = 농가 차례),
// 완료형(환불 완료)은 돈이 실제로 움직인 뒤에만 쓴다. 날짜 도우미는 화면에서 넘겨받아 이 파일은 순수 함수로 둔다(test-order-text.mjs).
import type { Order } from "@farmclub/api";

export const STATUS_LABEL: Record<Order["status"], string> = {
  PENDING_PAYMENT: "입금 안내 전",
  AWAITING_DEPOSIT: "입금 대기",
  RESERVED: "예약 완료",
  PREPARING: "수확·포장 중",
  SHIPPED: "배송 중",
  DELIVERED: "배송 완료",
  COMPLETED: "구매 확정",
  CANCELED: "취소됨",
  REFUNDED: "환불 대기",
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

/** 화면에서 넘기는 표기 도우미(@farmclub/ui format) */
export type Fmt = {
  md: (iso: string | null | undefined) => string;
  deadline: (iso: string | null | undefined) => string;
  time: (iso: string) => string;
  won: (n: number | null | undefined) => string;
};

type DepositFields = Pick<
  Order,
  "status" | "depositReportedAt" | "depositDueAt" | "depositIssue"
>;
type RefundFields = Pick<
  Order,
  "status" | "refundSettledAt" | "refundIssue" | "refundedAt" | "refundReason"
>;

/** 입금 대기 주문의 시점. before = 아직 알리지 않음(내 차례), reported = 알림(농가 차례), late = 알렸는데 기한까지 확인 안 됨.
 *  now는 서버 시각(`serverNow()`)을 넘긴다. 기기 시계로 재면 서버 시각을 고정한 평가 환경에서 새 주문이 늦어 보인다(DEV-229, R-28) */
export function depositPhase(
  o: DepositFields,
  now: number,
): "before" | "issue" | "reported" | "late" | null {
  if (o.status !== "AWAITING_DEPOSIT") return null;
  if (o.depositIssue) return "issue";
  if (!o.depositReportedAt) return "before";
  return o.depositDueAt && Date.parse(o.depositDueAt) <= now
    ? "late"
    : "reported";
}

/** 환불 주문의 시점. pending = 농가 송금 전, late = 농가 미승인, settled = 송금 기록됨 */
export function refundPhase(
  o: RefundFields,
): "pending" | "late" | "settled" | null {
  if (o.status !== "REFUNDED") return null;
  if (o.refundSettledAt) return "settled";
  return o.refundIssue ? "late" : "pending";
}

/** 입금을 알린 뒤에는 보낸 돈이 있을 수 있어 앱에서 취소를 막고 ‘농가에 물어보기’로 바꾼다(DEV-207, 서버는 그대로) */
export const canCancel = (o: DepositFields & Pick<Order, "actions">) =>
  o.actions.includes("cancel") &&
  !(o.status === "AWAITING_DEPOSIT" && o.depositReportedAt);

/** 상세·주문 완료 화면 제목(받는 시기 변경·기한 초과 취소는 화면이 먼저 고른다) */
export function statusTitle(o: DepositFields & RefundFields): string {
  // reported·late 모두 '입금 확인 중'이라 시각을 쓰지 않는다
  const d = depositPhase(o, 0);
  if (d) return d === "reported" || d === "late" ? "입금 확인 중" : "입금 대기";
  const r = refundPhase(o);
  if (r === "settled") return "환불 완료";
  if (r === "late") return "환불 늦어짐";
  return STATUS_LABEL[o.status];
}

/** SCR-13 목록 굵은 줄: 상태 · 다음 일 */
export function listHeadline(
  o: DepositFields & RefundFields & Pick<Order, "actions">,
  now: number,
): string {
  if (o.actions.includes("respondDeliveryWindow"))
    return "받는 시기 변경 · 답해 주세요";
  switch (depositPhase(o, now)) {
    case "issue":
      return "입금 확인 안 됨 · 사유를 봐 주세요";
    case "before":
      return "입금 대기 · 입금해 주세요";
    case "reported":
      return "입금 확인 중 · 농가가 확인하고 있어요";
    case "late":
      return "입금 확인 늦어짐 · farmclub이 연락하고 있어요";
  }
  if (o.actions.includes("confirm")) return "배송 완료 · 구매 확정해 주세요";
  switch (refundPhase(o)) {
    case "pending":
      return "환불 대기 · 농가가 보낼 거예요";
    case "late":
      return "환불 늦어짐 · 사유를 봐 주세요";
    case "settled":
      return "환불 완료";
  }
  return STATUS_LABEL[o.status];
}

/** SCR-13 목록 아래 줄(입금 대기·환불만). 날짜는 지금 상태를 만든 사건 하나 */
export function listSubline(
  o: DepositFields & RefundFields & Pick<Order, "totalAmount">,
  f: Fmt,
): string | null {
  const amount = f.won(o.totalAmount);
  if (o.status === "AWAITING_DEPOSIT")
    return o.depositReportedAt
      ? `${f.md(o.depositReportedAt)} 입금 알림 · ${amount}`
      : `${f.deadline(o.depositDueAt)}까지 입금 · ${amount}`;
  if (o.status === "REFUNDED") {
    if (o.refundSettledAt) return `${f.md(o.refundSettledAt)} 보냄 · ${amount}`;
    // 소비자가 직접 취소한 환불만 ‘취소’, 기간 변경 거절·운영자 환불은 ‘환불 결정’
    const own = o.refundReason?.includes("직접 취소");
    return `${f.md(o.refundedAt)} ${own ? "취소" : "환불 결정"} · ${amount}`;
  }
  return null;
}

/** SCR-13 목록 맨 아래 줄: 주문 번호 · 주문일(DEV-226, AC-10-8). 번호는 입금자명·생산자 줄과 같은 글자 */
export const listRef = (
  o: Pick<Order, "orderNo" | "createdAt">,
  f: Pick<Fmt, "md">,
) => `${o.orderNo} · ${f.md(o.createdAt)} 주문`;

/** 입금 단계 줄은 부제가 입금 사건(DEV-207)이라 받는 시기를 따로 한 줄로 둔다(DEV-226).
 *  다른 단계는 부제가 이미 받는 시기이고, 기간 변경 요청 중이면 부제가 새 기간이라 null */
export function listWhen(
  o: Pick<Order, "status" | "deliveryWindow" | "proposedDeliveryWindow">,
  period: (start: string, end: string) => string,
): string | null {
  if (o.status !== "AWAITING_DEPOSIT" || o.proposedDeliveryWindow) return null;
  const when = period(o.deliveryWindow.start, o.deliveryWindow.end);
  return when ? `${when} 도착 예정` : null;
}

/** 끝난 주문만 흐린 글자로(아직 돈이 오갈 환불 대기는 진하게) */
export const isClosed = (o: RefundFields) =>
  o.status === "CANCELED" || refundPhase(o) === "settled";

/** SCR-14 본문(입금 대기·환불만, 나머지 상태는 화면이 정한다) */
export function depositRefundSentence(
  o: DepositFields & RefundFields & Pick<Order, "totalAmount">,
  f: Fmt,
  now: number,
): string | null {
  switch (depositPhase(o, now)) {
    case "before":
    case "issue":
      return `${f.deadline(o.depositDueAt)}까지 입금해 주세요. 농가가 확인하면 예약 완료로 바뀌어요.`;
    case "reported":
      return `${f.md(o.depositReportedAt)} ${f.time(o.depositReportedAt!)}에 입금했다고 알려 주셨어요. 농가가 통장을 확인하면 예약 완료로 바뀌어요.`;
    case "late":
      return "입금했다고 알려 주셨어요. 농가 확인이 늦어져 farmclub이 농가에 연락하고 있어요. 주문은 취소되지 않아요.";
  }
  switch (refundPhase(o)) {
    case "settled":
      return `${f.md(o.refundSettledAt)}에 농가가 ${f.won(o.totalAmount)}을 입금했던 계좌로 보냈어요.`;
    case "pending":
    case "late":
      return `농가가 ${f.won(o.totalAmount)}을 입금했던 계좌로 3영업일 안에 보내요. 보내면 ‘환불 완료’로 바뀌어요.`;
  }
  return null;
}

/** SCR-14 하단 바 요약(입금 대기·환불만) */
export function bottomSummary(
  o: DepositFields & RefundFields,
  f: Fmt,
): string | null {
  if (o.status === "AWAITING_DEPOSIT")
    return o.depositReportedAt
      ? "농가가 입금을 확인하기 전에는 취소할 수 없어요. 확인된 뒤에는 보내기 전까지 취소하면 전액 돌려받아요."
      : "입금 전에는 바로 취소돼요.";
  if (o.status === "REFUNDED")
    return o.refundSettledAt
      ? `${f.md(o.refundSettledAt)} 환불 완료 · 입금했던 계좌로 보냈어요.`
      : "3영업일이 지나도 안 들어오면 농가에 물어보세요.";
  return null;
}
