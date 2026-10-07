import { needsReply } from "./conversations";
import { assertSale, releaseQuantity, salesState } from "./sales";
// /api/orders Mock (FEAT-08 주문서, 09 결제, 10 주문 내역, 11 취소, 14 현황, 17 출하)
import type { Carrier, Dashboard, HarvestProduct, OrderInput } from "../types";

const CARRIERS: Carrier[] = ["CJ", "EPOST", "HANJIN", "LOTTE", "LOGEN", "ETC"];
import { nextId, nowIso, TODAY, type OrderRec } from "./db";
import { currentStage, order, producerOrder, remaining } from "./derive";
import type { Ctx } from "./router";
import {
  conflict,
  fail,
  idempotent,
  invalid,
  notFound,
  paginate,
  register,
} from "./router";

const PHONE = /^01[016789]-?\d{3,4}-?\d{4}$/;
/** 도서산간(예시): 제주·울릉·옹진 등 우편번호 앞자리 */
const REMOTE = (postal: string, address: string) =>
  /^(63|40[0-2]|23[01]|54[0-9]{2}?)/.test(postal) ||
  /(울릉|옹진|도서)/.test(address);

function myOrder(ctx: Ctx): OrderRec {
  const o = ctx.db.orders[ctx.params.orderId];
  if (!o || o.consumerId !== ctx.me().userId)
    notFound("주문을 찾을 수 없어요.");
  return o;
}

function farmOrder(ctx: Ctx): OrderRec {
  const u = ctx.me();
  const o = ctx.db.orders[ctx.params.orderId];
  if (!o || ctx.db.products[o.productId]?.farmId !== u.farmId)
    notFound("주문을 찾을 수 없어요.");
  return o;
}

const ACTIVE = new Set([
  "RESERVED",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
]);
/** reservedCount = 이 상품을 예약한 사람 수(시드 37명 / 40건). 같은 사람의 두 번째 주문은 세지 않는다 */
function hasActiveOrder(ctx: Ctx, consumerId: string, productId: string) {
  return Object.values(ctx.db.orders).some(
    (x) =>
      x.consumerId === consumerId &&
      x.productId === productId &&
      ACTIVE.has(x.status),
  );
}

function refund(ctx: Ctx, o: OrderRec, reason: string) {
  const p = ctx.db.products[o.productId];
  if (o.status === "REFUNDED") return;
  if (p && !o.shippedAt) releaseQuantity(p, o, o.quantity - o.releasedQuantity);
  o.status = "REFUNDED";
  if (p && !hasActiveOrder(ctx, o.consumerId, p.productId))
    p.reservedCount = Math.max(0, p.reservedCount - 1);
  o.refundedAt = nowIso();
  o.refundReason = reason;
}

const SORT_ACTION = (o: OrderRec) =>
  (o.proposedDeliveryWindow &&
    (o.status === "RESERVED" || o.status === "PREPARING")) ||
  o.status === "DELIVERED";

register({
  "POST /api/orders": (ctx) =>
    idempotent(ctx, "orders", () => {
      const u = ctx.me();
      const b = ctx.body as unknown as OrderInput;
      const p = ctx.db.products[b.productId];
      if (!p || p.status !== "PUBLISHED")
        notFound("판매 중이 아닌 상품이에요.");
      const fields: Record<string, string> = {};
      if (!b.recipientName?.trim())
        fields.recipientName = "받는 사람을 적어 주세요";
      if (!PHONE.test((b.recipientPhone ?? "").trim()))
        fields.recipientPhone = "휴대폰 번호 형식으로 입력해 주세요";
      if (!b.postalCode?.trim() || !b.address?.trim())
        fields.address = "받는 곳을 입력해 주세요";
      if ((b.deliveryNote ?? "").length > 100)
        fields.deliveryNote = "배송 메모는 100자까지예요";
      const c = b.consents ?? ({} as OrderInput["consents"]);
      if (!c.deliveryWindow || !c.delayRefund || !c.shortage || !c.cancelPolicy)
        fields.consents = "결제 전 확인 4개에 모두 동의해 주세요";
      if (Object.keys(fields).length) invalid(fields);
      const s = assertSale(ctx.db, p, b.optionId, b.quantity);
      const remoteFee = REMOTE(b.postalCode, b.address) ? p.remoteAreaFee : 0;
      const o: OrderRec = {
        orderId: nextId("o"),
        orderNo: `FC-${TODAY.slice(5, 7)}${TODAY.slice(8, 10)}-${String(ctx.db.seq).padStart(4, "0")}`,
        consumerId: u.userId,
        buyerName: u.name,
        productId: p.productId,
        optionId: b.optionId,
        stageId: s.stageId,
        quantity: b.quantity,
        unitPrice: s.options[b.optionId].price,
        unitWeightGrams: Math.round(
          p.options.find((x) => x.optionId === b.optionId)!.weightKg * 1000,
        ),
        releasedQuantity: 0,
        shippingFee: p.shippingFeeType === "SEPARATE" ? p.shippingFee : 0,
        remoteAreaFee: remoteFee,
        status: "PENDING_PAYMENT",
        deliveryWindow: p.deliveryWindow ?? { start: TODAY, end: TODAY },
        proposedDeliveryWindow: null,
        deliveryNote: b.deliveryNote?.trim() || null,
        carrier: null,
        trackingNumber: null,
        createdAt: nowIso(),
        paidAt: null,
        shippedAt: null,
        deliveredAt: null,
        refundedAt: null,
        refundReason: null,
        recipientName: b.recipientName.trim(),
        recipientPhone: b.recipientPhone.trim(),
        postalCode: b.postalCode.trim(),
        address: b.address.trim(),
        addressDetail: b.addressDetail?.trim() ?? "",
      };
      ctx.db.orders[o.orderId] = o;
      if (b.saveAddress) {
        const list = (ctx.db.addresses[u.userId] ??= []);
        if (
          !list.some(
            (a) =>
              a.address === o.address && a.addressDetail === o.addressDetail,
          )
        ) {
          list.forEach((a) => (a.isDefault = false));
          list.push({
            addressId: nextId("a"),
            recipientName: o.recipientName,
            recipientPhone: o.recipientPhone,
            postalCode: o.postalCode,
            address: o.address,
            addressDetail: o.addressDetail,
            isDefault: true,
          });
        }
      }
      return order(ctx.db, o);
    }),

  "POST /api/orders/:orderId/pay": (ctx) =>
    idempotent(ctx, `pay:${ctx.params.orderId}`, () => {
      const o = myOrder(ctx);
      if (o.status !== "PENDING_PAYMENT") {
        if (o.paidAt && ACTIVE.has(o.status))
          return {
            order: order(ctx.db, o),
            result: "success",
            failReason: null,
          };
        conflict("INVALID_TRANSITION", "결제할 수 없는 주문이에요.");
      }
      const p = ctx.db.products[o.productId];
      const s = assertSale(ctx.db, p, o.optionId, o.quantity, o);
      if (ctx.body.mockResult === "fail") {
        return {
          order: order(ctx.db, o),
          result: "fail",
          failReason:
            "카드 한도를 넘었어요. 다른 카드를 고르거나 다시 시도해 주세요. 돈은 나가지 않았어요.",
        };
      }
      s.options[o.optionId].reservedCount += o.quantity;
      if (!hasActiveOrder(ctx, o.consumerId, p.productId)) p.reservedCount += 1;
      o.status = "RESERVED";
      o.paidAt = nowIso();
      return { order: order(ctx.db, o), result: "success", failReason: null };
    }),

  "GET /api/orders": (ctx) => {
    const uid = ctx.me().userId;
    const list = Object.values(ctx.db.orders)
      .filter(
        (o) =>
          o.consumerId === uid &&
          o.status !== "PENDING_PAYMENT" &&
          o.status !== "CANCELED",
      )
      .sort(
        (a, b) =>
          Number(SORT_ACTION(b)) - Number(SORT_ACTION(a)) ||
          b.createdAt.localeCompare(a.createdAt),
      )
      .map((o) => order(ctx.db, o));
    return paginate(list, ctx.query);
  },

  "GET /api/orders/producer/dashboard": (ctx): Dashboard => {
    const u = ctx.me();
    const products = Object.values(ctx.db.products).filter(
      (p) => p.farmId === u.farmId,
    );
    const pids = new Set(products.map((p) => p.productId));
    const farmOrders = Object.values(ctx.db.orders).filter(
      (o) => pids.has(o.productId) && o.status !== "PENDING_PAYMENT",
    );
    const live = products.filter(
      (p) => p.status === "PUBLISHED" && currentStage(p),
    );
    const main = live[0];
    return {
      todo: {
        openQuestions: Object.values(ctx.db.threadMeta).filter(
          (t) => t.farmId === u.farmId && needsReply(ctx.db, t),
        ).length,
        toShip: farmOrders.filter((o) => o.status === "PREPARING").length,
        pendingProducts: products.filter((p) => p.status === "PENDING_APPROVAL")
          .length,
      },
      product: main
        ? {
            ...salesState(ctx.db, main),
            productId: main.productId,
            productName: main.name,
            reservedCount: main.reservedCount,
            orderCount: farmOrders.filter(
              (o) => o.productId === main.productId && ACTIVE.has(o.status),
            ).length,
          }
        : null,
      // 단계마다 옵션별 예약 박스 / 물량(D-03)
      stages: main
        ? main.stages.map((s) => ({
            stageName: `${s.startsAt} ~ ${s.endsAt}`,
            current: currentStage(main)?.stageId === s.stageId,
            endsAt: s.endsAt,
            options: main.options.map((op) => ({
              optionId: op.optionId,
              label: op.label,
              price: s.options[op.optionId]?.price ?? 0,
              reserved: s.options[op.optionId]?.reservedCount ?? 0,
              quantity: s.options[op.optionId]?.quantity ?? 0,
            })),
          }))
        : [],
      recentOrders: farmOrders
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 3)
        .map((o) => ({
          orderId: o.orderId,
          buyerName: `${o.buyerName.slice(0, 1)}○○`,
          optionLabel:
            ctx.db.products[o.productId].options.find(
              (x) => x.optionId === o.optionId,
            )?.label ?? "",
          quantity: o.quantity,
          createdAt: o.createdAt,
          region: o.address.split(" ").slice(0, 2).join(" "),
          status: o.status,
        })),
    };
  },

  "GET /api/orders/producer": (ctx) => {
    const u = ctx.me();
    const list = Object.values(ctx.db.orders)
      .filter(
        (o) =>
          ctx.db.products[o.productId]?.farmId === u.farmId &&
          o.status !== "PENDING_PAYMENT",
      )
      .filter((o) => !ctx.query.status || o.status === ctx.query.status)
      .filter(
        (o) => !ctx.query.productId || o.productId === ctx.query.productId,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => producerOrder(ctx.db, o));
    return paginate(list, ctx.query);
  },

  "POST /api/orders/producer/harvest-start": (ctx) => {
    const u = ctx.me();
    const pid = String(ctx.body.productId ?? "");
    const p = ctx.db.products[pid];
    if (!p || p.farmId !== u.farmId) notFound("찾을 수 없는 상품이에요.");
    let changed = 0;
    Object.values(ctx.db.orders).forEach((o) => {
      if (o.productId === pid && o.status === "RESERVED") {
        o.status = "PREPARING";
        changed += 1;
      }
    });
    return { changed };
  },

  "POST /api/orders/:orderId/ship": (ctx) => {
    const o = farmOrder(ctx);
    if (o.status !== "PREPARING")
      conflict(
        "INVALID_TRANSITION",
        "출하 준비인 주문만 출하로 바꿀 수 있어요.",
        { status: o.status },
      );
    const t = ctx.body.trackingNumber
      ? String(ctx.body.trackingNumber).trim()
      : "";
    if (t.length > 50) invalid({ trackingNumber: "송장 번호는 50자까지예요" });
    const c = ctx.body.carrier ? String(ctx.body.carrier) : null;
    if (c && !CARRIERS.includes(c as Carrier))
      invalid({ carrier: "택배사를 골라 주세요" });
    o.status = "SHIPPED";
    o.shippedAt = nowIso();
    o.trackingNumber = t || null;
    o.carrier = (c as Carrier | null) ?? null;
    return producerOrder(ctx.db, o);
  },

  "GET /api/orders/:orderId": (ctx) => order(ctx.db, myOrder(ctx)),

  "POST /api/orders/:orderId/cancel": (ctx) => {
    const o = myOrder(ctx);
    if (o.status === "REFUNDED" && !o.shippedAt) return order(ctx.db, o);
    if (o.status !== "RESERVED" && o.status !== "PREPARING")
      conflict("INVALID_TRANSITION", "출하 후에는 취소할 수 없어요.", {
        order: order(ctx.db, o),
      });
    refund(
      ctx,
      o,
      `${Number(TODAY.slice(5, 7))}월 ${Number(TODAY.slice(8, 10))}일 직접 취소(출하 전)`,
    );
    return order(ctx.db, o);
  },

  "POST /api/orders/:orderId/confirm": (ctx) => {
    const o = myOrder(ctx);
    if (o.status !== "DELIVERED")
      conflict("INVALID_TRANSITION", "배송 완료 후에 구매 확정할 수 있어요.", {
        order: order(ctx.db, o),
      });
    o.status = "COMPLETED";
    return order(ctx.db, o);
  },

  "POST /api/orders/:orderId/delivery-window-response": (ctx) => {
    const o = myOrder(ctx);
    if (
      !o.proposedDeliveryWindow ||
      !["RESERVED", "PREPARING"].includes(o.status)
    )
      conflict("INVALID_TRANSITION", "바뀐 받는 시기가 없어요.");
    if (ctx.body.choice === "accept") {
      o.deliveryWindow = o.proposedDeliveryWindow;
      o.proposedDeliveryWindow = null;
    } else if (ctx.body.choice === "refund") {
      o.proposedDeliveryWindow = null;
      refund(ctx, o, "받는 시기 변경에 동의하지 않아 전액 환불");
    } else
      fail(
        400,
        "VALIDATION_ERROR",
        "새 기간 동의나 전액 환불 중에 골라 주세요.",
      );
    return order(ctx.db, o);
  },
});

export type { HarvestProduct };
