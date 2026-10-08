import { salesState } from "./sales";
// 저장 레코드 → API 응답 모양으로 바꾸는 함수들
import type {
  ChatMessage,
  FarmCard,
  FarmSummary,
  NewsItem,
  Order,
  OrderAction,
  ProducerOrder,
  ProductCard,
  ProductDetail,
  Stage,
} from "../types";
import {
  TODAY,
  type DB,
  type FarmRec,
  type NewsRec,
  type OrderRec,
  type ProductRec,
} from "./db";

const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const daysBetween = (from: string, to: string) =>
  Math.round((day(to) - day(from)) / 86400000);

export function currentStage(p: ProductRec): Stage | null {
  return p.stages.find((s) => s.startsAt <= TODAY && TODAY <= s.endsAt) ?? null;
}
export function nextStage(p: ProductRec): Stage | null {
  return (
    p.stages
      .filter((s) => s.startsAt > TODAY)
      .sort((a, b) => a.seq - b.seq)[0] ?? null
  );
}
export function remaining(s: Stage, optionId: string) {
  const v = s.options[optionId];
  return v ? Math.max(0, v.quantity - v.reservedCount) : 0;
}

export function farmSummary(f: FarmRec): FarmSummary {
  return {
    farmId: f.farmId,
    name: f.name,
    region: f.region,
    photo: f.photo,
    followerCount: f.followerCount,
  };
}

export function productCard(d: DB, p: ProductRec): ProductCard {
  const cur = currentStage(p);
  const nxt = nextStage(p);
  const firstOpt = p.options[0]?.optionId ?? "";
  const soldOut = salesState(d, p).availability !== "AVAILABLE";
  return {
    ...salesState(d, p),
    productId: p.productId,
    name: p.name,
    farmId: p.farmId,
    farmName: d.farms[p.farmId]?.name ?? "",
    photo: p.photos[0] ?? null,
    currentPrice: cur?.options[firstOpt]?.price ?? null,
    nextPrice: nxt?.options[firstOpt]?.price ?? null,
    stageEndsAt: cur?.endsAt ?? null,
    dDay: cur ? daysBetween(TODAY, cur.endsAt) : null,
    deliveryWindow: p.deliveryWindow ?? { start: TODAY, end: TODAY },
    soldOut,
    nextStageStartsAt: soldOut ? (nxt?.startsAt ?? null) : null,
    reservedCount: p.reservedCount,
    expectedBrix: p.expectedBrix,
  };
}

export function farmCard(d: DB, f: FarmRec): FarmCard {
  const live = Object.values(d.products)
    .filter((p) => p.farmId === f.farmId && p.status === "PUBLISHED")
    .map((p) => productCard(d, p))
    .filter((c) => !c.soldOut && c.dDay !== null)
    .sort((a, b) => (a.dDay ?? 99) - (b.dDay ?? 99));
  const top = live[0];
  return {
    ...farmSummary(f),
    featured: top
      ? {
          productId: top.productId,
          name: top.name,
          currentPrice: top.currentPrice ?? 0,
          dDay: top.dDay ?? 0,
        }
      : null,
  };
}

export function newsItem(d: DB, n: NewsRec, userId: string | null): NewsItem {
  const f = d.farms[n.farmId];
  const mine =
    !!userId &&
    d.reactions.some(
      (r) => r.broadcastId === n.broadcastId && r.userId === userId,
    );
  const others = d.reactions.filter(
    (r) => r.broadcastId === n.broadcastId,
  ).length;
  return {
    broadcastId: n.broadcastId,
    farmId: n.farmId,
    farmName: f?.name ?? "",
    farmPhoto: f?.photo ?? null,
    createdAt: n.createdAt,
    body: n.body,
    photos: n.photos,
    visibility: n.visibility,
    reactionCount: n.baseReactions + others,
    myReaction: mine,
  };
}

export function productDetail(
  d: DB,
  p: ProductRec,
  userId: string | null,
): ProductDetail {
  const card = productCard(d, p);
  const f = d.farms[p.farmId];
  const cur = currentStage(p);
  return {
    ...card,
    variety: p.variety,
    description: p.description,
    ...(p.detailContent ? { detailContent: p.detailContent } : {}),
    grade: p.grade,
    measuredBrix: p.measuredBrix,
    measuredBrixAt: p.measuredBrixAt,
    brixRecordCount: p.brixRecordCount,
    farmerNote: p.farmerNote,
    farmRegion: f?.region ?? "",
    farmPhoto: f?.photo ?? null,
    options: p.options,
    stages: p.stages,
    currentStageId: cur?.stageId ?? null,
    shippingFeeType: p.shippingFeeType,
    shippingFee: p.shippingFee,
    remoteAreaFee: p.remoteAreaFee,
    maxQuantityPerOrder: p.maxQuantityPerOrder,
    maxDelayUntil: p.maxDelayUntil ?? card.deliveryWindow.end,
    info: p.info,
    status: p.status,
  };
}

export function orderActions(o: OrderRec): OrderAction[] {
  const a: OrderAction[] = [];
  if (o.status === "RESERVED" || o.status === "PREPARING") a.push("cancel");
  if (o.status === "DELIVERED") a.push("confirm");
  if (
    o.proposedDeliveryWindow &&
    (o.status === "RESERVED" || o.status === "PREPARING")
  )
    a.push("respondDeliveryWindow");
  return a;
}

export function order(d: DB, o: OrderRec): Order {
  const p = d.products[o.productId];
  const opt = p?.options.find((x) => x.optionId === o.optionId);
  return {
    orderId: o.orderId,
    orderNo: o.orderNo,
    productId: o.productId,
    productName: p?.name.split(" / ")[0].replace(/\s\d+kg$/, "") ?? "",
    farmId: p?.farmId ?? "",
    farmName: d.farms[p?.farmId ?? ""]?.name ?? "",
    photo: p?.photos[0] ?? null,
    optionId: o.optionId,
    optionLabel: opt?.label ?? "",
    quantity: o.quantity,
    unitWeightGrams: o.unitWeightGrams,
    releasedQuantity: o.releasedQuantity,
    unitPrice: o.unitPrice,
    shippingFee: o.shippingFee,
    remoteAreaFee: o.remoteAreaFee,
    totalAmount: o.unitPrice * o.quantity + o.shippingFee + o.remoteAreaFee,
    status: o.status,
    deliveryWindow: o.deliveryWindow,
    proposedDeliveryWindow: o.proposedDeliveryWindow,
    deliveryNote: o.deliveryNote,
    carrier: o.carrier ?? null,
    trackingNumber: o.trackingNumber,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    shippedAt: o.shippedAt,
    deliveredAt: o.deliveredAt,
    refundedAt: o.refundedAt,
    refundReason: o.refundReason,
    recipientName: o.recipientName,
    recipientPhone: o.recipientPhone,
    postalCode: o.postalCode,
    address: o.address,
    addressDetail: o.addressDetail,
    actions: orderActions(o),
  };
}

export function producerOrder(d: DB, o: OrderRec): ProducerOrder {
  const p = d.products[o.productId];
  const opt = p?.options.find((x) => x.optionId === o.optionId);
  // R-15: 배송 완료 전 주문만 배송 정보를 보여준다
  const hide = o.status === "DELIVERED" || o.status === "COMPLETED";
  return {
    orderId: o.orderId,
    orderNo: o.orderNo,
    productId: o.productId,
    productName: p?.name ?? "",
    optionLabel: opt?.label ?? "",
    quantity: o.quantity,
    status: o.status,
    deliveryNote: hide ? null : o.deliveryNote,
    carrier: o.carrier ?? null,
    trackingNumber: o.trackingNumber,
    createdAt: o.createdAt,
    recipientName: o.recipientName,
    recipientPhone: hide ? "" : o.recipientPhone,
    postalCode: hide ? "" : o.postalCode,
    address: hide ? "" : o.address,
    addressDetail: hide ? "" : o.addressDetail,
  };
}

/** 전화번호·계좌번호를 가린다(M-16) */
export function mask(text: string): { text: string; masked: boolean } {
  const re = /(01[016789][-\s]?\d{3,4}[-\s]?\d{4})|(\d{2,6}-\d{2,6}-\d{2,8})/g;
  let masked = false;
  const out = text.replace(re, (m) => {
    masked = true;
    return m.replace(/\d/g, "●");
  });
  return { text: out, masked };
}

export function chatMessage(
  partial: Partial<ChatMessage> &
    Pick<ChatMessage, "messageId" | "senderType" | "body" | "createdAt">,
): ChatMessage {
  return {
    photos: [],
    sourceSummary: null,
    handoffStatus: null,
    masked: false,
    ...partial,
  };
}
