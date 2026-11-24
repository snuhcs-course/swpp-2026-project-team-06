import type { ProducerOrderUndo } from "../types";
import { nextId, nowIso, type DB, type OrderRec, type ProducerOrderActionRec, type ProducerOrderState } from "./db";

/** 돈 없이 취소된 주문의 입금자명을 다시 쓰지 않는 기간(서버 DEPOSIT_CODE_HOLD_DAYS, DEV-342) */
export const DEPOSIT_CODE_HOLD_DAYS = 3;

const labels: Record<ProducerOrderActionRec["kind"], string> = {
  confirm_deposit: "입금 확인", reject_deposit: "입금 미승인", cancel_deposit: "미승인 주문 취소",
  ship: "출하 처리", refund_issue: "환불 미승인", refund_settled: "환불 완료 표시",
};

export function producerOrderState(o: OrderRec): ProducerOrderState {
  return {
    status: o.status, paidAt: o.paidAt, shippedAt: o.shippedAt, deliveredAt: o.deliveredAt,
    refundedAt: o.refundedAt, refundReason: o.refundReason, releasedQuantity: o.releasedQuantity,
    quantity: o.quantity, depositCode: o.depositCode ?? null, depositDueAt: o.depositDueAt,
    depositReportedAt: o.depositReportedAt, cancelReason: o.cancelReason,
    refundSettledAt: o.refundSettledAt, depositIssue: o.depositIssue ?? null, refundIssue: o.refundIssue ?? null,
    carrier: o.carrier, trackingNumber: o.trackingNumber, trackingVersion: o.trackingVersion ?? 1,
    deliveryWindow: { ...o.deliveryWindow },
    proposedDeliveryWindow: o.proposedDeliveryWindow ? { ...o.proposedDeliveryWindow } : null,
  };
}

/** 지금 상태와 기록이 맞는 마지막 처리(스냅샷만 비교) */
export function latestOrderAction(o: OrderRec): ProducerOrderActionRec | null {
  const action = o.producerActionHistory?.find(a => a.status === "SUCCEEDED");
  return action && JSON.stringify(action.after) === JSON.stringify(producerOrderState(o)) ? action : null;
}

/** 입금 대기로 되돌릴 수 없는 이유(서버 `_restore_blocker`와 같은 규칙) */
export function orderRestoreBlocker(d: DB, o: OrderRec, previous: ProducerOrderState): string | null {
  if (previous.status !== "AWAITING_DEPOSIT") return null;
  if (previous.depositDueAt && new Date(previous.depositDueAt).getTime() <= Date.now() && !previous.depositReportedAt)
    return "입금 기한이 지나 입금 대기로 되돌릴 수 없어요.";
  const farmId = d.products[o.productId]?.farmId;
  const code = previous.depositCode?.toLocaleLowerCase();
  if (code && Object.values(d.orders).some(x => x.orderId !== o.orderId &&
    d.products[x.productId]?.farmId === farmId &&
    x.depositCode?.toLocaleLowerCase() === code &&
    (x.status === "AWAITING_DEPOSIT" || (x.status === "CANCELED" && !x.paidAt && x.depositDueAt &&
      new Date(x.depositDueAt).getTime() > Date.now() - DEPOSIT_CODE_HOLD_DAYS * 86400_000))))
    return "같은 입금자명을 쓰는 다른 주문이 있어 되돌릴 수 없어요.";
  return null;
}

/** 목록·응답에 내주는 실행 취소: 눌러도 409가 날 처리는 내주지 않는다 */
export function availableOrderUndo(d: DB, o: OrderRec): ProducerOrderUndo | null {
  const action = latestOrderAction(o);
  if (!action || orderRestoreBlocker(d, o, action.before)) return null;
  return { actionId: action.actionId, label: labels[action.kind],
    previousStatus: action.before.status, createdAt: action.createdAt };
}

export function recordOrderAction(o: OrderRec, kind: ProducerOrderActionRec["kind"], before: ProducerOrderState) {
  const after = producerOrderState(o);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const history = o.producerActionHistory ??= [];
  for (const action of history) if (action.status === "SUCCEEDED") action.status = "SUPERSEDED";
  history.push({ actionId: nextId("order-action"), kind, status: "SUCCEEDED",
    before, after, createdAt: nowIso() });
}
