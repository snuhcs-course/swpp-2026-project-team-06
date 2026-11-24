import type { Achievement, Achievements, FarmReport, FarmReportStatus, FarmTemperature } from "../types";
import { nextId, nowIso, type DB, type OrderRec } from "./db";
import { conflict, fail, invalid, notFound, register, type Ctx } from "./router";

const DAY = 86_400_000;
const length = (value: string) => [...value].length;
const validConsumer = (d: DB, id: string) => d.users[id]?.role === "CONSUMER" && !d.users[id].deleted;
const completed = (o: OrderRec) => o.status === "COMPLETED" && !!o.completedAt && !o.refundedAt;
const starsPoint = (stars: number) => stars >= 4 ? 1 : stars <= 2 ? -1 : 0;

/** Canonical saved evidence only. Integer tenths and final-only clamp preserve reversals. */
export function temperature(d: DB, farmId: string, current = nowIso()): FarmTemperature {
  const end = Date.parse(current);
  const since = end - 28 * DAY;
  const recent = (at: string | undefined) => {
    const value = at === undefined ? NaN : Date.parse(at);
    return value >= since && value <= end;
  };
  const live = d.news.filter(n => n.farmId === farmId);
  const days = new Map<string, Set<string>>();
  for (const n of live) {
    if (n.visibility !== "PUBLIC" || !recent(n.createdAt)) continue;
    // Seoul has no DST. Shift once, then use UTC calendar operations for both keys.
    const date = new Date(Date.parse(n.createdAt) + 9 * 3_600_000);
    const day = date.toISOString().slice(0, 10);
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const week = monday.toISOString().slice(0, 10);
    const dates = days.get(week) ?? new Set<string>();
    dates.add(day);
    days.set(week, dates);
  }
  const liveIds = new Set(live.map(n => n.broadcastId));
  const humans = new Set<string>();
  for (const [key, messages] of Object.entries(d.threads)) {
    const [farm, consumer] = key.split(":");
    if (farm !== farmId || !validConsumer(d, consumer)) continue;
    let askedAt = Infinity;
    for (const m of messages) {
      if (m.senderType === "CONSUMER") askedAt = Math.min(askedAt, Date.parse(m.createdAt));
      if (m.senderType === "PRODUCER" && recent(m.createdAt) && askedAt <= Date.parse(m.createdAt)) humans.add(consumer);
    }
  }
  const c = {
    F: Math.min(100, new Set(d.follows.filter(f => f.farmId === farmId && validConsumer(d, f.userId)).map(f => f.userId)).size),
    P: [...days.values()].reduce((sum, dates) => sum + Math.min(3, dates.size), 0),
    L: Math.min(30, new Set(d.reactions.filter(r => liveIds.has(r.broadcastId) && recent(r.createdAt) && validConsumer(d, r.userId)).map(r => r.userId)).size),
    H: Math.min(30, humans.size),
    R: Object.values(d.verifiedReviews ?? {}).reduce((sum, r) => {
      const o = d.orders[r.orderId];
      return o && r.consumerId === o.consumerId && validConsumer(d, r.consumerId) && completed(o) && d.products[o.productId]?.farmId === farmId ? sum + starsPoint(r.stars) : sum;
    }, 0),
    M: new Set((d.farmReports ?? []).filter(r => r.farmId === farmId && r.status === "CONFIRMED" && r.incidentKey).map(r => r.incidentKey)).size,
  };
  return { temperatureTenths: Math.max(0, Math.min(990, 365 + c.F + c.P + c.L + c.H + c.R - c.M)), contributions: c, calculatedAt: current, policyVersion: 1 };
}

function approved(ctx: Ctx) {
  const farm = ctx.db.farms[ctx.params.farmId];
  if (!farm || farm.status !== "APPROVED") notFound("찾을 수 없는 농가예요.");
  return farm;
}

function ownCompletedOrder(ctx: Ctx) {
  const o = ctx.db.orders[ctx.params.orderId];
  if (!o || o.consumerId !== ctx.me().userId) notFound("주문을 찾을 수 없어요.");
  if (!completed(o)) conflict("REVIEW_NOT_AVAILABLE", "구매 확정한 주문에만 후기를 남길 수 있어요.");
  return o;
}

function achievements(ctx: Ctx): Achievements {
  const d = ctx.db;
  const uid = ctx.me().userId;
  const hasPurchase = Object.values(d.orders).some(o => o.consumerId === uid && completed(o));
  const hasReview = Object.values(d.verifiedReviews ?? {}).some(r => r.consumerId === uid && d.orders[r.orderId]?.consumerId === uid && completed(d.orders[r.orderId]));
  const hasMessage = d.roomReplies.some(r => r.senderId === uid) || Object.entries(d.threads).some(([k, messages]) => k.split(":")[1] === uid && messages.some(m => m.senderType === "CONSUMER"));
  const values: [Achievement["id"], string, string, boolean, string][] = [
    ["first_follow", "첫 팔로우", "마음에 드는 농가를 팔로우해 보세요", d.follows.some(f => f.userId === uid && d.farms[f.farmId]?.status === "APPROVED"), "/farms"],
    ["first_reaction", "첫 소식 공감", "농가의 소식에 좋아요를 남겨 보세요", d.reactions.some(r => r.userId === uid && d.news.some(n => n.broadcastId === r.broadcastId)), "/chats?view=news"],
    ["first_message", "첫 인사", "농가에 첫 인사를 보내 보세요", hasMessage, "/chats"],
    ["first_purchase", "첫 상품 구매", "상품을 받고 구매를 확정해 보세요", hasPurchase, "/orders"],
    ["first_review", "첫 구매 후기", "구매한 상품에 솔직한 별점을 남겨 보세요", hasReview, "/orders"],
  ];
  const tasks = values.map(([id, title, description, done, action]): Achievement => ({ id, title, description, completed: done, progress: done ? 1 : 0, target: 1, action }));
  return { tasks, completedCount: tasks.filter(t => t.completed).length, total: 5 };
}

register({
  "GET /api/farms/:farmId/temperature": ctx => { approved(ctx); return temperature(ctx.db, ctx.params.farmId); },
  "GET /api/engagement/achievements": achievements,
  "GET /api/engagement/reviews/:orderId": ctx => {
    const o = ctx.db.orders[ctx.params.orderId];
    if (!o || o.consumerId !== ctx.me().userId) notFound("주문을 찾을 수 없어요.");
    return { orderId: o.orderId, stars: completed(o) ? ctx.db.verifiedReviews?.[o.orderId]?.stars ?? null : null };
  },
  "PUT /api/engagement/reviews/:orderId": ctx => {
    const stars = ctx.body.stars;
    if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) invalid({ stars: "별점은 1~5 사이 정수로 골라 주세요" });
    const o = ownCompletedOrder(ctx);
    const reviews = ctx.db.verifiedReviews ??= {};
    reviews[o.orderId] = { orderId: o.orderId, consumerId: ctx.me().userId, stars };
    return { orderId: o.orderId, stars };
  },
  "POST /api/engagement/farms/:farmId/reports": ctx => {
    approved(ctx);
    const reason = typeof ctx.body.reason === "string" ? ctx.body.reason.trim() : "";
    if (length(reason) < 10 || length(reason) > 1000) invalid({ reason: "신고 사유를 10~1,000자로 적어 주세요" });
    const reports = ctx.db.farmReports ??= [];
    const uid = ctx.me().userId;
    const existing = reports.find(r => r.farmId === ctx.params.farmId && r.consumerId === uid);
    if (existing) return { reportId: existing.reportId, status: existing.status };
    const report = { reportId: nextId("report"), consumerId: uid, farmId: ctx.params.farmId, reason, status: "PENDING" as const, incidentKey: null, createdAt: nowIso(), reviewedAt: null };
    reports.push(report);
    return { reportId: report.reportId, status: report.status };
  },
  "PATCH /api/engagement/reports/:reportId": (ctx): FarmReport => {
    if (ctx.me().role !== "ADMIN") fail(403, "FORBIDDEN", "운영자 권한이 필요해요.");
    const status = ctx.body.status;
    if (status !== "CONFIRMED" && status !== "REJECTED" && status !== "OVERTURNED") invalid({ status: "판정 상태를 골라 주세요" });
    const key = typeof ctx.body.incidentKey === "string" ? ctx.body.incidentKey.trim() : "";
    const hasKey = ctx.body.incidentKey !== undefined && ctx.body.incidentKey !== null;
    if ((status === "CONFIRMED" && !key) || (hasKey && !key) || length(key) > 100) invalid({ incidentKey: "사건 키를 1~100자로 적어 주세요" });
    const report = ctx.db.farmReports?.find(r => r.reportId === ctx.params.reportId);
    if (!report) notFound("신고를 찾을 수 없어요.");
    report.status = status as FarmReportStatus;
    if (status === "CONFIRMED") report.incidentKey = key;
    report.reviewedAt = nowIso();
    return { reportId: report.reportId, status: report.status };
  },
  "GET /api/engagement/reports": ctx => {
    if (ctx.me().role !== "ADMIN") fail(403, "FORBIDDEN", "운영자 권한이 필요해요.");
    const status = ctx.query.status ?? "PENDING";
    if (!["PENDING", "CONFIRMED", "REJECTED", "OVERTURNED"].includes(status)) invalid({ status: "판정 상태를 골라 주세요" });
    const limit = ctx.query.limit === undefined ? 20 : Number(ctx.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) invalid({ limit: "1~50 사이로 골라 주세요" });
    let offset = 0;
    if (ctx.query.cursor) {
      try {
        const parsed: unknown = JSON.parse(atob(ctx.query.cursor.replace(/-/g, "+").replace(/_/g, "/")));
        if (!Array.isArray(parsed) || parsed.length !== 1 || !Number.isSafeInteger(parsed[0]) || parsed[0] < 0) throw new Error("cursor");
        offset = parsed[0];
      } catch {
        invalid({ cursor: "잘못된 cursor예요" });
      }
    }
    const records = (ctx.db.farmReports ?? []).filter(r => r.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.reportId.localeCompare(b.reportId))
      .map(({ reportId, farmId, reason, status, incidentKey, createdAt, reviewedAt }) => ({ reportId, farmId, reason, status, incidentKey, createdAt, reviewedAt }));
    return { items: records.slice(offset, offset + limit), nextCursor: records.length > offset + limit ? btoa(JSON.stringify([offset + limit])) : null };
  },
});
