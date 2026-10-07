import { ensureThread } from "./conversations";
// /api/messaging Mock (FEAT-12 소식·채팅, 13 AI 안내·질문함, 15 좋아요)
import type { ChatSummary, Escalation, NewsInput } from "../types";
import {
  nextId,
  nowIso,
  type DB,
  type EscalationRec,
  type ProductRec,
} from "./db";
import { chatMessage, currentStage, mask, newsItem } from "./derive";
import type { Ctx } from "./router";
import {
  idempotent,
  fail,
  invalid,
  notFound,
  paginate,
  register,
} from "./router";

const key = (farmId: string, consumerId: string) => `${farmId}:${consumerId}`;
const isFollowing = (d: DB, uid: string, farmId: string) =>
  d.follows.some((f) => f.userId === uid && f.farmId === farmId);

function visibleNews(d: DB, uid: string | null) {
  return d.news.filter(
    (n) => n.visibility === "PUBLIC" || (uid && isFollowing(d, uid, n.farmId)),
  );
}

function escalationView(d: DB, e: EscalationRec): Escalation {
  return { ...e, thread: d.threads[key(e.farmId, e.consumerId)] ?? [] };
}

register({
  "GET /api/messaging/news": (ctx) => {
    const uid = ctx.me().userId;
    const list = ctx.db.news
      .filter((n) => isFollowing(ctx.db, uid, n.farmId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => newsItem(ctx.db, n, uid));
    return paginate(list, ctx.query);
  },

  "GET /api/messaging/farms/:farmId/news": (ctx) => {
    const list = ctx.db.news
      .filter(
        (n) => n.farmId === ctx.params.farmId && n.visibility === "PUBLIC",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => newsItem(ctx.db, n, ctx.user?.userId ?? null));
    return paginate(list, ctx.query);
  },

  "PUT /api/messaging/news/:broadcastId/reaction": (ctx) => {
    const uid = ctx.me().userId;
    const n = visibleNews(ctx.db, uid).find(
      (x) => x.broadcastId === ctx.params.broadcastId,
    );
    if (!n) notFound("볼 수 없는 소식이에요.");
    if (
      !ctx.db.reactions.some(
        (r) => r.broadcastId === n.broadcastId && r.userId === uid,
      )
    )
      ctx.db.reactions.push({ broadcastId: n.broadcastId, userId: uid });
    const v = newsItem(ctx.db, n, uid);
    return { reactionCount: v.reactionCount, myReaction: true };
  },

  "DELETE /api/messaging/news/:broadcastId/reaction": (ctx) => {
    const uid = ctx.me().userId;
    ctx.db.reactions = ctx.db.reactions.filter(
      (r) => !(r.broadcastId === ctx.params.broadcastId && r.userId === uid),
    );
    const n = ctx.db.news.find((x) => x.broadcastId === ctx.params.broadcastId);
    if (!n) notFound("볼 수 없는 소식이에요.");
    return {
      reactionCount: newsItem(ctx.db, n, uid).reactionCount,
      myReaction: false,
    };
  },

  "POST /api/messaging/news": (ctx) => {
    const u = ctx.me();
    if (
      !u.farmId ||
      ctx.db.farms[u.farmId]?.status !== "APPROVED" ||
      ctx.db.farms[u.farmId]?.ownerId !== u.userId
    )
      fail(403, "FORBIDDEN", "승인된 내 농가에서만 올릴 수 있어요.");
    const b = ctx.body as unknown as NewsInput;
    if (!b.body?.trim() && !(b.photos ?? []).length && !(b.videos ?? []).length)
      invalid({ body: "글이나 사진 중 하나는 넣어 주세요" });
    if ((b.body ?? "").length > 2000)
      invalid({ body: "2000자까지 입력해 주세요" });
    if (!["PUBLIC", "FOLLOWERS"].includes(b.visibility ?? "FOLLOWERS"))
      invalid({ visibility: "공개 범위를 확인해 주세요" });
    const videos = (b.videos ?? []).length;
    if (videos > 1 || (b.photos ?? []).length > 5)
      fail(413, "PAYLOAD_TOO_LARGE", "사진은 5장까지 올릴 수 있어요.");
    return idempotent(ctx, "news", () => {
      const m = mask(b.body ?? "");
      const n = {
        broadcastId: nextId("n"),
        farmId: u.farmId!,
        createdAt: nowIso(),
        body: m.text,
        photos: [...(b.photos ?? []), ...(b.videos ?? [])],
        visibility: b.visibility ?? "FOLLOWERS",
        baseReactions: 0,
      };
      ctx.db.news.push(n);
      return {
        broadcastId: n.broadcastId,
        createdAt: n.createdAt,
        recipientCount: ctx.db.farms[u.farmId!].followerCount,
      };
    });
  },

  "GET /api/messaging/questions": (ctx) => {
    const u = ctx.me();
    const list = ctx.db.escalations
      .filter(
        (e) =>
          e.farmId === u.farmId &&
          (!ctx.query.status || e.status === ctx.query.status),
      )
      .map((e) => escalationView(ctx.db, e));
    return paginate(list, ctx.query);
  },

  "POST /api/messaging/questions/:escalationId/answer": (ctx) => {
    const u = ctx.me();
    const e = ctx.db.escalations.find(
      (x) =>
        x.escalationId === ctx.params.escalationId && x.farmId === u.farmId,
    );
    if (!e) notFound("찾을 수 없는 질문이에요.");
    const text = String(ctx.body.text ?? "").trim();
    if (!text) invalid({ text: "답을 적어 주세요" });
    const m = mask(text);
    const k = key(e.farmId, e.consumerId);
    (ctx.db.threads[k] ??= []).push(
      chatMessage({
        messageId: nextId("m"),
        senderType: "PRODUCER",
        body: m.text,
        masked: m.masked,
        createdAt: nowIso(),
      }),
    );
    const meta = ensureThread(ctx.db, e.farmId, e.consumerId);
    if (meta.aiMode !== "HUMAN") {
      meta.aiMode = "HUMAN";
      meta.version++;
    }
    e.status = "ANSWERED";
    e.answer = m.text;
    return escalationView(ctx.db, e);
  },
});
