import { missing, myProductRec } from "./catalog";
import { nextId, nowIso } from "./db";
import { validatePeriods } from "./sales";
import {
  conflict,
  fail,
  idempotent,
  invalid,
  notFound,
  paginate,
  register,
  type Ctx,
} from "./router";
import type { CapacityRequest } from "../types";

function owned(ctx: Ctx) {
  if (ctx.me().role !== "PRODUCER")
    fail(403, "FORBIDDEN", "생산자 권한이 필요해요.");
  const p = myProductRec(ctx);
  if (ctx.db.farms[p.farmId]?.status !== "APPROVED")
    fail(403, "FORBIDDEN", "승인된 농가만 사용할 수 있어요.");
  return p;
}
function pending(ctx: Ctx) {
  const r = ctx.db.capacityRequests.find(
    (r) =>
      r.productId === ctx.params.productId &&
      r.requestId === ctx.params.requestId,
  );
  if (!r) notFound("신청을 찾을 수 없어요.");
  if (ctx.body.version !== r.version)
    conflict("STALE_VERSION", "최신 신청을 다시 불러와 주세요.");
  if (r.status !== "PENDING")
    conflict("INVALID_TRANSITION", "이미 처리된 신청이에요.");
  return r;
}
function decide(ctx: Ctx, approved: boolean) {
  if (ctx.me().role !== "ADMIN")
    fail(403, "FORBIDDEN", "운영자 권한이 필요해요.");
  return idempotent(
    ctx,
    `capacity-${approved ? "approve" : "reject"}:${ctx.params.requestId}`,
    () => {
      const r = pending(ctx),
        p = ctx.db.products[r.productId];
      if (
        !p ||
        p.status === "CLOSED" ||
        ctx.db.farms[p.farmId]?.status !== "APPROVED"
      )
        conflict(
          "INVALID_TRANSITION",
          "승인 가능한 농가와 상품인지 확인해 주세요.",
        );
      const reason =
        typeof ctx.body.reason === "string" ? ctx.body.reason.trim() : "";
      if (!approved && !reason)
        invalid({ reason: "반려 사유를 입력해 주세요" });
      if (approved) {
        if (r.requestedTotalGrams <= p.approvedSupplyGrams)
          conflict("INVALID_TRANSITION", "현재 승인량보다 커야 해요.");
        if (r.kind === "INITIAL") {
          if (missing(p).length)
            invalid({ product: "필수 상품 정보를 확인해 주세요" });
          validatePeriods(ctx.db, p, p.stages);
          p.salesLimitGrams = r.requestedTotalGrams;
          p.status = "PUBLISHED";
        }
        p.approvedSupplyGrams = r.requestedTotalGrams;
        p.rejectReason = null;
      } else {
        if (r.kind === "INITIAL") p.status = "REJECTED";
        p.rejectReason = reason;
      }
      r.status = approved ? "APPROVED" : "REJECTED";
      r.reason = approved ? null : reason;
      r.decidedAt = nowIso();
      r.version++;
      p.version++;
      p.updatedAt = nowIso();
      return r;
    },
  );
}
register({
  "GET /api/products/:productId/capacity-requests": (ctx) => {
    if (ctx.me().role !== "ADMIN") owned(ctx);
    else if (!ctx.db.products[ctx.params.productId]) notFound();
    return paginate(
      ctx.db.capacityRequests
        .filter((r) => r.productId === ctx.params.productId)
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) ||
            b.requestId.localeCompare(a.requestId),
        ),
      ctx.query,
    );
  },
  "POST /api/products/:productId/capacity-requests": (ctx) => {
    const p = owned(ctx);
    return idempotent(ctx, `capacity-create:${p.productId}`, () => {
      if (ctx.body.version !== p.version)
        conflict("STALE_VERSION", "최신 상품을 다시 불러와 주세요.");
      if (
        ctx.db.capacityRequests.some(
          (r) => r.productId === p.productId && r.status === "PENDING",
        )
      )
        conflict(
          "CAPACITY_REQUEST_PENDING",
          "심사 중인 신청을 먼저 확인해 주세요.",
        );
      if (!["DRAFT", "REJECTED", "PUBLISHED"].includes(p.status))
        conflict("INVALID_TRANSITION", "신청할 수 없는 상품이에요.");
      const grams = ctx.body.requestedTotalGrams;
      if (
        !Number.isSafeInteger(grams) ||
        Number(grams) <= p.approvedSupplyGrams
      )
        invalid({
          requestedTotalGrams: "기존 승인량보다 큰 총중량을 입력해 주세요",
        });
      if (p.approvedSupplyGrams === 0) {
        const fields = missing(p);
        if (fields.length)
          invalid(
            Object.fromEntries(fields.map((f) => [f, "필수 항목이에요"])),
          );
        validatePeriods(ctx.db, p, p.stages);
      }
      const r: CapacityRequest = {
        requestId: nextId("capacity"),
        productId: p.productId,
        kind: p.approvedSupplyGrams === 0 ? "INITIAL" : "INCREASE",
        requestedTotalGrams: Number(grams),
        status: "PENDING",
        reason: null,
        createdAt: nowIso(),
        decidedAt: null,
        version: 1,
      };
      ctx.db.capacityRequests.push(r);
      if (r.kind === "INITIAL") p.status = "PENDING_APPROVAL";
      p.rejectReason = null;
      p.version++;
      p.updatedAt = nowIso();
      return r;
    });
  },
  "POST /api/products/:productId/capacity-requests/:requestId/withdraw": (
    ctx,
  ) => {
    const p = owned(ctx);
    return idempotent(ctx, `capacity-withdraw:${ctx.params.requestId}`, () => {
      const r = pending(ctx);
      r.status = "WITHDRAWN";
      r.decidedAt = nowIso();
      r.version++;
      if (r.kind === "INITIAL") p.status = "DRAFT";
      p.version++;
      p.updatedAt = nowIso();
      return r;
    });
  },
  "POST /admin/products/:productId/capacity-requests/:requestId/approve": (
    ctx,
  ) => decide(ctx, true),
  "POST /admin/products/:productId/capacity-requests/:requestId/reject": (
    ctx,
  ) => decide(ctx, false),
});
