import { needsReply } from "./conversations";
import { assertSale, releaseQuantity, salesState } from "./sales";
// /api/orders Mock (FEAT-08 주문서, 09 무통장 입금(DEV-68), 10 주문 내역, 11 취소, 14 현황, 17 출하)
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
import { ADDRESS_LIMIT } from "./auth";

const PHONE = /^01[016789]-?\d{3,4}-?\d{4}$/;
/** 도서산간(예시): 제주·울릉·옹진 등 우편번호 앞자리 */
const REMOTE = (postal: string, address: string) =>
  /^(63|40[0-2]|23[01]|54[0-9]{2}?)/.test(postal) ||
  /(울릉|옹진|도서)/.test(address);

/** 주문 번호 `FC-MMDD-NNNN`: NNNN은 무작위 4자리(연번이면 거래 건수가 드러난다, DEV-68) */
function newOrderNo(ctx: Ctx): string {
  const prefix = `FC-${TODAY.slice(5, 7)}${TODAY.slice(8, 10)}-`;
  for (let i = 0; i < 50; i += 1) {
    const candidate = `${prefix}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    if (!Object.values(ctx.db.orders).some((o) => o.orderNo === candidate))
      return candidate;
  }
  conflict("INVALID_TRANSITION", "주문 번호를 만들지 못했어요. 다시 시도해 주세요.");
}

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

/** 입금 기한(시간). 서버 DEPOSIT_DEADLINE_HOURS와 같다(R-28) */
const DEPOSIT_DEADLINE_HOURS = 24;
const DEPOSIT_EXPIRED = "입금 기한 초과";

/** 입금 대기 주문을 결제 없이 끝낸다. 잡아 둔 물량은 한 번만 돌려준다(R-28) */
function cancelAwaiting(ctx: Ctx, o: OrderRec, reason: string) {
  const p = ctx.db.products[o.productId];
  if (p) releaseQuantity(p, o, o.quantity - o.releasedQuantity);
  o.status = "CANCELED";
  o.cancelReason = reason;
}

/** 기한이 지난 입금 대기 주문을 조회 시점에 취소한다(지연 검사). 바뀐 수를 돌려준다 */
function expireOverdue(ctx: Ctx, pick: (o: OrderRec) => boolean = () => true) {
  const now = nowIso();
  let changed = 0;
  for (const o of Object.values(ctx.db.orders)) {
    if (
      o.status === "AWAITING_DEPOSIT" &&
      o.depositDueAt &&
      o.depositDueAt <= now &&
      // 입금했다고 알린 주문은 취소하지 않는다. 운영자가 생산자에게 연락한다(DEV-68)
      !o.depositReportedAt &&
      pick(o)
    ) {
      cancelAwaiting(ctx, o, DEPOSIT_EXPIRED);
      changed += 1;
    }
  }
  return changed;
}

function farmProductIds(ctx: Ctx) {
  const u = ctx.me();
  return new Set(
    Object.values(ctx.db.products)
      .filter((p) => p.farmId === u.farmId)
      .map((p) => p.productId),
  );
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
        orderNo: newOrderNo(ctx),
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
        depositDueAt: null,
        depositReportedAt: null,
        cancelReason: null,
        refundSettledAt: null,
        recipientName: b.recipientName.trim(),
        recipientPhone: b.recipientPhone.trim(),
        postalCode: b.postalCode.trim(),
        address: b.address.trim(),
        addressDetail: b.addressDetail?.trim() ?? "",
      };
      ctx.db.orders[o.orderId] = o;
      // 저장 배송지가 50개면 주문은 그대로 두고 저장만 건너뛴다(서버 save_order_address와 같다)
      const book = ctx.db.addresses[u.userId] ?? [];
      if (b.saveAddress && book.length < ADDRESS_LIMIT) {
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

  // 입금 안내(FEAT-09 개정): 물량을 선점하고 입금 대기로. 같은 키면 처음 결과(AC-09-3)
  "POST /api/orders/:orderId/deposit": (ctx) =>
    idempotent(ctx, `deposit:${ctx.params.orderId}`, () => {
      const o = myOrder(ctx);
      if (o.status !== "PENDING_PAYMENT") {
        if (o.status === "AWAITING_DEPOSIT" || (o.paidAt && ACTIVE.has(o.status)))
          return order(ctx.db, o);
        conflict("INVALID_TRANSITION", "입금 안내를 받을 수 없는 주문이에요.");
      }
      const p = ctx.db.products[o.productId];
      const farm = ctx.db.farms[p?.farmId ?? ""];
      if (!farm?.bankName || !farm.accountNumber || !farm.accountHolder)
        conflict("NO_FARM_ACCOUNT", "농가가 아직 입금 계좌를 등록하지 않았어요.");
      const s = assertSale(ctx.db, p, o.optionId, o.quantity, o);
      s.options[o.optionId].reservedCount += o.quantity;
      o.status = "AWAITING_DEPOSIT";
      o.depositDueAt = new Date(
        Date.now() + DEPOSIT_DEADLINE_HOURS * 3600_000,
      ).toISOString();
      return order(ctx.db, o);
    }),

  // 소비자 '입금했어요' 신호. 상태는 바꾸지 않는다(DEV-68 결정 4)
  "POST /api/orders/:orderId/deposit-reported": (ctx) => {
    const o = myOrder(ctx);
    expireOverdue(ctx, (x) => x.orderId === o.orderId);
    if (o.status !== "AWAITING_DEPOSIT")
      conflict("INVALID_TRANSITION", "입금 대기 주문이 아니에요.", {
        order: order(ctx.db, o),
      });
    o.depositReportedAt ??= nowIso();
    return order(ctx.db, o);
  },

  // 생산자 입금 확인(AC-09-8): 입금 대기 → 예약 완료. 이미 확인됐으면 그대로
  "POST /api/orders/:orderId/confirm-deposit": (ctx) => {
    const o = farmOrder(ctx);
    if (o.paidAt && ACTIVE.has(o.status)) return producerOrder(ctx.db, o);
    expireOverdue(ctx, (x) => x.orderId === o.orderId);
    if (o.status !== "AWAITING_DEPOSIT")
      conflict("INVALID_TRANSITION", "입금 대기 주문만 확인할 수 있어요.", {
        status: o.status,
      });
    const p = ctx.db.products[o.productId];
    if (p && !hasActiveOrder(ctx, o.consumerId, p.productId))
      p.reservedCount += 1;
    o.status = "RESERVED";
    o.paidAt = nowIso();
    o.depositIssue = null;
    return producerOrder(ctx.db, o);
  },

  // 입금 미승인(DEV-68): 사유 필수. cancel이면 취소·물량 해제, 아니면 입금 대기로 두고 사유를 보여 준다
  "POST /api/orders/:orderId/reject-deposit": (ctx) => {
    const o = farmOrder(ctx);
    const reason = String(ctx.body.reason ?? "").trim();
    if (!reason) invalid({ reason: "사유를 적어 주세요" });
    if (reason.length > 200) invalid({ reason: "사유는 200자까지예요" });
    expireOverdue(ctx, (x) => x.orderId === o.orderId);
    if (o.status !== "AWAITING_DEPOSIT")
      conflict("INVALID_TRANSITION", "입금 대기 주문만 미승인할 수 있어요.", {
        status: o.status,
      });
    if (ctx.body.cancel) {
      cancelAwaiting(ctx, o, `입금 미승인 · ${reason}`);
      o.depositIssue = null;
    } else {
      o.depositIssue = reason;
      o.depositReportedAt = null;
    }
    return producerOrder(ctx.db, o);
  },

  // 환불 미승인(DEV-68): 아직 송금하지 못한 사유(필수). 송금 대기는 그대로
  "POST /api/orders/:orderId/refund-issue": (ctx) => {
    const o = farmOrder(ctx);
    const reason = String(ctx.body.reason ?? "").trim();
    if (!reason) invalid({ reason: "사유를 적어 주세요" });
    if (reason.length > 200) invalid({ reason: "사유는 200자까지예요" });
    if (o.status !== "REFUNDED")
      conflict("INVALID_TRANSITION", "환불할 주문이 아니에요.");
    if (o.refundSettledAt)
      conflict("INVALID_TRANSITION", "이미 환불을 마친 주문이에요.");
    o.refundIssue = reason;
    return producerOrder(ctx.db, o);
  },

  // 농가가 입금했던 계좌로 환불 송금을 마쳤다고 표시(AC-17-7)
  "POST /api/orders/:orderId/refund-settled": (ctx) => {
    const o = farmOrder(ctx);
    if (o.status !== "REFUNDED")
      conflict("INVALID_TRANSITION", "환불할 주문이 아니에요.");
    o.refundSettledAt ??= nowIso();
    o.refundIssue = null;
    return producerOrder(ctx.db, o);
  },

  "GET /api/orders": (ctx) => {
    const uid = ctx.me().userId;
    expireOverdue(ctx, (o) => o.consumerId === uid);
    // 입금 전 취소·기한 만료(CANCELED)도 사유와 함께 보인다(DEV-68)
    const list = Object.values(ctx.db.orders)
      .filter((o) => o.consumerId === uid && o.status !== "PENDING_PAYMENT")
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
    expireOverdue(ctx, (o) => farmProductIds(ctx).has(o.productId));
    const farm = u.farmId ? ctx.db.farms[u.farmId] : null;
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
        awaitingDeposit: farmOrders.filter((o) => o.status === "AWAITING_DEPOSIT")
          .length,
        refundsToSettle: farmOrders.filter(
          (o) => o.status === "REFUNDED" && !o.refundSettledAt,
        ).length,
        hasAccount:
          !!farm?.bankName && !!farm.accountNumber && !!farm.accountHolder,
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
    expireOverdue(ctx, (o) => farmProductIds(ctx).has(o.productId));
    const list = Object.values(ctx.db.orders)
      .filter(
        (o) =>
          ctx.db.products[o.productId]?.farmId === u.farmId &&
          o.status !== "PENDING_PAYMENT" &&
          // 돈을 낸 적 없이 끝난 취소는 생산자 목록에서 뺀다(R-15)
          !(o.status === "CANCELED" && !o.paidAt),
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

  "GET /api/orders/:orderId": (ctx) => {
    const o = myOrder(ctx);
    expireOverdue(ctx, (x) => x.orderId === o.orderId);
    return order(ctx.db, o);
  },

  "POST /api/orders/:orderId/cancel": (ctx) => {
    const o = myOrder(ctx);
    expireOverdue(ctx, (x) => x.orderId === o.orderId);
    if ((o.status === "REFUNDED" || o.status === "CANCELED") && !o.shippedAt)
      return order(ctx.db, o);
    if (o.status === "AWAITING_DEPOSIT") {
      // 입금 전 취소: 돈이 없으므로 환불 없이 물량만 돌려준다(DEV-68 결정 5)
      cancelAwaiting(
        ctx,
        o,
        `${Number(TODAY.slice(5, 7))}월 ${Number(TODAY.slice(8, 10))}일 직접 취소(입금 전)`,
      );
      return order(ctx.db, o);
    }
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
