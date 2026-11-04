import type { SalesState, Stage, StageInput } from "../types";
import { TODAY, nextId, type DB, type ProductRec, type OrderRec } from "./db";
import { conflict, invalid, notFound } from "./router";
/** 물량을 잡고 있는 주문: 입금 대기(안내 시점 선점) 또는 입금 확인된 주문(DEV-68) */
export const holdsStock = (o: OrderRec) =>
  o.status === "AWAITING_DEPOSIT" || !!o.paidAt;
export const allocatedBoxes = (o: OrderRec) =>
  holdsStock(o) ? o.quantity - o.releasedQuantity : 0;
export function soldQuantity(d: DB, p: ProductRec) {
  return Object.values(d.orders)
    .filter((o) => o.productId === p.productId)
    .reduce((n, o) => n + allocatedBoxes(o), 0);
}
export function salesState(d: DB, p: ProductRec): SalesState {
  let reservedGrams = 0,
    shippedGrams = 0;
  for (const o of Object.values(d.orders))
    if (o.productId === p.productId) {
      const grams = allocatedBoxes(o) * o.unitWeightGrams;
      if (o.shippedAt) shippedGrams += grams;
      else reservedGrams += grams;
    }
  const left = p.salesLimitGrams - reservedGrams - shippedGrams;
  const cur = p.stages.find((s) => s.startsAt <= TODAY && s.endsAt >= TODAY);
  const options = p.options.filter((o) => cur?.options[o.optionId]);
  const availability = p.salesPaused
    ? "PAUSED"
    : p.status === "CLOSED" ||
        (p.stages.length > 0 && p.stages.every((s) => s.endsAt < TODAY))
      ? "ENDED"
      : !cur
        ? "NOT_OPEN"
        : options.every((o) => Math.round(o.weightKg * 1000) > left)
          ? "TOTAL_SOLD_OUT"
          : options.every(
                (o) =>
                  Math.round(o.weightKg * 1000) > left ||
                  cur.options[o.optionId].quantity <=
                    cur.options[o.optionId].reservedCount,
              )
            ? "PERIOD_SOLD_OUT"
            : "AVAILABLE";
  return {
    approvedSupplyGrams: p.approvedSupplyGrams,
    salesLimitGrams: p.salesLimitGrams,
    reservedGrams,
    shippedGrams,
    remainingGrams: left,
    soldQuantity: soldQuantity(d, p),
    salesPaused: p.salesPaused,
    availability,
    version: p.version,
  };
}
/** Restore only the explicitly unfulfilled, pre-shipping quantity, once. */
export function releaseQuantity(p: ProductRec, o: OrderRec, quantity: number) {
  if (
    o.shippedAt ||
    !holdsStock(o) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    quantity > o.quantity - o.releasedQuantity
  )
    conflict("INVALID_TRANSITION", "반환할 물량을 확인해 주세요.");
  const allocation = p.stages.find((s) => s.stageId === o.stageId)?.options[
    o.optionId
  ];
  if (!allocation || allocation.reservedCount < quantity)
    conflict("INVALID_TRANSITION", "예약 물량이 일치하지 않아요.");
  allocation.reservedCount -= quantity;
  o.releasedQuantity += quantity;
}
export type SaleExpected = {
  stageId?: string | null;
  unitPrice?: number | null;
  unitWeightGrams?: number | null;
};
/**
 * 예약 가능 검사. 순서는 서버 create_order와 같다(AC-08-9, DEV-216):
 * 수량 → 판매 중지 → 지금 기간 없음 → 전체 물량 → 기간 물량 → 본 값 비교.
 * expected는 주문서가 본 값(주문 생성) 또는 주문 스냅샷(입금 안내). 보낸 값만 비교한다.
 */
export function assertSale(
  d: DB,
  p: ProductRec,
  optionId: string,
  quantity: number,
  expected?: SaleExpected,
): Stage {
  if (p.status !== "PUBLISHED" || d.farms[p.farmId]?.status !== "APPROVED")
    notFound("지금 예약할 수 없는 상품이에요.");
  const state = salesState(d, p),
    details = {
      ...state,
      productId: p.productId,
      maxQuantity: p.maxQuantityPerOrder,
    };
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    invalid({ quantity: "1 이상의 정수로 적어 주세요" });
  if (quantity > p.maxQuantityPerOrder)
    conflict(
      "QUANTITY_LIMIT",
      `한 번에 최대 ${p.maxQuantityPerOrder}박스까지 예약할 수 있어요.`,
      details,
    );
  if (p.salesPaused)
    conflict("SALES_PAUSED", "농가가 잠시 예약을 쉬고 있어요.", details);
  const option = p.options.find((o) => o.optionId === optionId);
  const weight = Math.round((option?.weightKg ?? 0) * 1000);
  const previous = {
    stageId: expected?.stageId ?? null,
    unitPrice: expected?.unitPrice ?? null,
    unitWeightGrams: expected?.unitWeightGrams ?? null,
  };
  const s = p.stages.find((s) => s.startsAt <= TODAY && s.endsAt >= TODAY);
  if (!s || !s.options[optionId]) {
    const next = p.stages
      .filter((x) => x.startsAt > TODAY)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    conflict("STAGE_CHANGED", "예약 기간이 바뀌었어요.", {
      ...details,
      optionId,
      previous,
      current: null,
      nextStageStartsAt: s ? null : (next?.startsAt ?? null),
    });
  }
  if (!weight || state.remainingGrams < quantity * weight)
    conflict(
      "TOTAL_LIMIT_REACHED",
      "상품의 전체 예약 물량이 소진됐어요.",
      details,
    );
  if (
    s.options[optionId].quantity - s.options[optionId].reservedCount <
    quantity
  )
    conflict("SOLD_OUT", "이 기간의 선택 옵션이 품절됐어요.", {
      ...details,
      optionId,
    });
  const now = {
    stageId: s.stageId,
    unitPrice: s.options[optionId].price,
    unitWeightGrams: weight,
  };
  const differs = (["stageId", "unitPrice", "unitWeightGrams"] as const).some(
    (k) => expected?.[k] != null && expected[k] !== now[k],
  );
  if (differs)
    conflict("STAGE_CHANGED", "예약 기간 또는 가격이 바뀌었어요.", {
      ...details,
      optionId,
      previous,
      current: { ...now, startsAt: s.startsAt, endsAt: s.endsAt },
      nextStageStartsAt: null,
    });
  return s;
}
const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function validatePeriods(
  d: DB,
  p: ProductRec,
  input: StageInput[],
): Stage[] {
  if (!Array.isArray(input) || !input.length)
    invalid({ stages: "예약 기간을 하나 이상 정해 주세요" });
  const rows = [...input].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    fields: Record<string, string> = {},
    ids = new Set<string>();
  for (const old of p.stages) {
    const used = Object.values(d.orders).some(
      (o) =>
        o.productId === p.productId &&
        o.stageId === old.stageId &&
        holdsStock(o),
    );
    const r = rows.find((r) => r.stageId === old.stageId);
    if (used && (!r || r.startsAt !== old.startsAt || r.endsAt !== old.endsAt))
      conflict(
        "PERIOD_LOCKED",
        "예약 이력이 있는 기간의 날짜·삭제는 바꿀 수 없어요.",
      );
  }
  const result = rows.map((r, i) => {
    if (
      !validDate(r.startsAt) ||
      !validDate(r.endsAt) ||
      r.startsAt > r.endsAt ||
      (i > 0 && rows[i - 1].endsAt >= r.startsAt) ||
      (p.deliveryWindow && r.endsAt >= p.deliveryWindow.start)
    )
      fields[`stages.${i}.period`] =
        "겹치지 않는 유효한 날짜로, 배송 시작 전까지 정해 주세요";
    const old = p.stages.find((s) => s.stageId === r.stageId);
    if (r.stageId && (!old || ids.has(r.stageId)))
      fields.stages = "기존 기간 ID를 확인해 주세요";
    if (r.stageId) ids.add(r.stageId);
    const options: Stage["options"] = {};
    for (const opt of p.options) {
      const v = r.options[opt.optionId];
      const reserved = old?.options[opt.optionId]?.reservedCount ?? 0;
      if (!v || !Number.isInteger(v.price) || v.price < 1)
        fields[`stages.${i}.${opt.optionId}.price`] =
          "가격을 1원 이상의 정수로 적어 주세요";
      if (
        !v ||
        !Number.isInteger(v.quantity) ||
        v.quantity < reserved ||
        v.quantity < 0
      )
        fields[`stages.${i}.${opt.optionId}.quantity`] =
          `확보된 ${reserved}박스 이상으로 적어 주세요`;
      if (i > 0 && v && v.price <= rows[i - 1].options[opt.optionId]?.price)
        fields[`stages.${i}.${opt.optionId}.price`] =
          "앞 기간보다 높은 가격으로 적어 주세요";
      if (v) options[opt.optionId] = { ...v, reservedCount: reserved };
    }
    return {
      stageId: r.stageId ?? "",
      seq: i + 1,
      name: `${r.startsAt} ~ ${r.endsAt}`,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      options,
    };
  });
  if (Object.keys(fields).length) invalid(fields);
  return result.map((r) => ({ ...r, stageId: r.stageId || nextId("st") }));
}
