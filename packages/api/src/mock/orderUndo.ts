import type { ProducerOrderUndo } from "../types";
import { nextId, nowIso, type OrderRec, type ProducerOrderActionRec, type ProducerOrderState } from "./db";

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

export function availableOrderUndo(o: OrderRec): ProducerOrderUndo | null {
  const action = o.producerActionHistory?.find(a => a.status === "SUCCEEDED");
  if (!action || JSON.stringify(action.after) !== JSON.stringify(producerOrderState(o))) return null;
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
