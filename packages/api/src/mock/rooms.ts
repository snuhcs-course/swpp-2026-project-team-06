import { editMessageText, messagePage } from "./conversations";
import type { FanReply, NewsRoomMessage, NewsRoomSummary } from "../types";
import { nextId, nowIso, type DB, type RoomReplyRec } from "./db";
import { mask, maskBroadcastReply, newsItem } from "./derive";
import {
  fail,
  conflict,
  idempotent,
  invalid,
  notFound,
  paginate,
  register,
  type Ctx,
} from "./router";
import { publicName } from "./auth";

function access(ctx: Ctx, farmId: string) {
  const user = ctx.user;
  if (
    user?.role === "PRODUCER" &&
    (!user.farmId || ctx.db.farms[user.farmId]?.status !== "APPROVED")
  )
    fail(403, "FORBIDDEN", "승인된 농가만 사용할 수 있어요.");
  const farm = ctx.db.farms[farmId];
  if (!farm || farm.status !== "APPROVED")
    notFound("지금은 이 농가의 소식방을 열 수 없어요.");
  if (user?.role === "PRODUCER") {
    if (user.farmId !== farmId || farm.ownerId !== user.userId)
      notFound("내 농가의 소식방만 볼 수 있어요.");
  }
  const canReply =
    user?.role === "PRODUCER" ||
    (user?.role === "CONSUMER" &&
      ctx.db.follows.some(
        (f) => f.userId === user.userId && f.farmId === farmId,
      ));
  return { user, farm, canReply };
}
function authorize(ctx: Ctx, farmId: string) {
  ctx.me();
  const a = access(ctx, farmId);
  if (!a.canReply)
    fail(403, "FORBIDDEN", "팔로우한 농가에만 답장할 수 있어요.");
  return { ...a, user: ctx.me() };
}

const byTime = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** 보낸 순간 그 농가의 가장 최근 지우지 않은 소식(DEV-297). 인용 소식도 소식이다 */
function latestBroadcast(db: DB, farmId: string) {
  return db.news
    .filter((n) => n.farmId === farmId)
    .map((n) => ({ createdAt: n.createdAt, id: n.broadcastId }))
    .sort(byTime)
    .at(-1)?.id ?? null;
}

/** 읽음 위치가 이 소식 (작성 시각, id) 이상인 소비자 수(DEV-297). 한 사람은 위치가 하나라 1회 */
function readCount(db: DB, farmId: string, n: { createdAt: string; broadcastId: string }) {
  return (db.roomReads ?? []).filter(
    (r) =>
      r.farmId === farmId &&
      byTime({ createdAt: r.at, id: r.broadcastId }, { createdAt: n.createdAt, id: n.broadcastId }) >= 0,
  ).length;
}

/** 응답 모양만 남긴다. 연결 소식·생산자 읽음은 서버 전용 칸 */
function publicReply(m: RoomReplyRec): NewsRoomMessage {
  const { answersBroadcastId: _answers, producerReadAt: _read, ...rest } = m;
  return rest;
}

// Filter before pagination AND summaries. Another consumer's replies never leave the server.
function visible(ctx: Ctx, farmId: string): NewsRoomMessage[] {
  const { user, farm, canReply } = access(ctx, farmId);
  // 읽음·답장 수는 소유 생산자에게만(DEV-297). access가 남의 농가 생산자를 이미 막았다
  const owner = user?.role === "PRODUCER" && canReply;
  const broadcasts: NewsRoomMessage[] = ctx.db.news
    .filter(
      (n) => n.farmId === farmId && (canReply || n.visibility === "PUBLIC"),
    )
    .map((n) => {
      const reaction = newsItem(ctx.db, n, user?.userId ?? null);
      return {
        replyTo: n.replyTo ?? null,
        editedAt: n.editedAt ?? null, editVersion: n.editVersion ?? 0,
        messageId: n.broadcastId,
        farmId,
        senderId: farm.ownerId,
        senderName: farm.name,
        senderRole: "PRODUCER",
        body: n.body,
        photos: n.photos.filter(
          (uri) => !/^data:video|\.(mp4|webm)$/.test(uri),
        ),
        videos: n.photos.filter((uri) => /^data:video|\.(mp4|webm)$/.test(uri)),
        createdAt: n.createdAt,
        broadcastId: n.broadcastId,
        reactionCount: reaction.reactionCount,
        myReaction: reaction.myReaction,
        visibility: n.visibility,
        readCount: owner ? readCount(ctx.db, farmId, n) : null,
        replyCount: owner
          ? ctx.db.roomReplies.filter((r) => r.answersBroadcastId === n.broadcastId).length
          : null,
      };
    });
  const replies = ctx.db.roomReplies.filter(
    (m) =>
      m.farmId === farmId &&
      // 팔로우를 끊은 소비자도 본인 답장은 본다(DEV-230, AC-15-8). 생산자는 소유 농가일 때만 canReply
      ((user?.role === "PRODUCER" && canReply) ||
        (user?.role === "CONSUMER" && m.senderId === user.userId)),
  );
  return [
    ...broadcasts,
    ...replies.map((m) => ({
      ...publicReply(m),
      readCount: null,
      replyCount: null,
      // 농가에는 닉네임(없으면 가린 이름, R-15), 본인에게는 자기 이름
      senderName:
        user?.role === "PRODUCER"
          ? ctx.db.users[m.senderId]
            ? publicName(ctx.db.users[m.senderId])
            : `${m.senderName.slice(0, 1)}○○`
          : m.senderName,
    })),
  ].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) ||
      b.messageId.localeCompare(a.messageId),
  );
}

function summary(ctx: Ctx, farmId: string): NewsRoomSummary {
  const { farm, canReply } = access(ctx, farmId);
  const last = visible(ctx, farmId)[0];
  return {
    farmId,
    canReply,
    farmName: farm.name,
    farmPhoto: farm.photo,
    lastMessage: last ? last.body || "사진·영상 소식" : null,
    lastAt: last?.createdAt ?? null,
  };
}

register({
  "PATCH /api/messaging/rooms/:farmId/messages/:messageId": (ctx) => {
    const user = ctx.me();
    access(ctx, ctx.params.farmId);
    const row = user.role === "PRODUCER"
      ? ctx.db.news.find(n => n.broadcastId === ctx.params.messageId && n.farmId === ctx.params.farmId && user.farmId === n.farmId)
      : ctx.db.roomReplies.find(m => m.messageId === ctx.params.messageId && m.farmId === ctx.params.farmId && m.senderId === user.userId);
    if (!row) notFound("본인이 보낸 메시지만 수정할 수 있어요.");
    return idempotent(ctx, `edit-room:${ctx.params.farmId}:${ctx.params.messageId}`, () => {
      editMessageText(ctx, row, user.role === "PRODUCER" ? 2000 : 1000, user.role === "PRODUCER" && !!row.replyTo);
      return visible(ctx, ctx.params.farmId).find(m => m.messageId === ctx.params.messageId)!;
    });
  },
  "GET /api/messaging/rooms": (ctx) => {
    const user = ctx.me();
    if (
      user?.role === "PRODUCER" &&
      (!user.farmId || ctx.db.farms[user.farmId]?.status !== "APPROVED")
    )
      fail(403, "FORBIDDEN", "승인된 농가만 소식방을 열 수 있어요.");
    const ids =
      user?.role === "PRODUCER"
        ? [user.farmId]
        : ctx.db.follows
            .filter((f) => f.userId === user.userId)
            .map((f) => f.farmId);
    const rooms = [...new Set(ids)]
      .filter(
        (id): id is string => !!id && ctx.db.farms[id]?.status === "APPROVED",
      )
      .map((id) => summary(ctx, id))
      .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
    return paginate(rooms, ctx.query);
  },
  "GET /api/messaging/rooms/:farmId/messages": (ctx) => {
    const farmId = ctx.params.farmId;
    const messages = visible(ctx, farmId);
    return {
      room: summary(ctx, farmId),
      ...messagePage(
        ctx,
        `room:${farmId}:${access(ctx, farmId).canReply ? "member" : "public"}`,
        messages,
      ),
    };
  },
  "POST /api/messaging/rooms/:farmId/messages": (ctx) => {
    const farmId = ctx.params.farmId;
    const { user } = authorize(ctx, farmId);
    const text = String(ctx.body.text ?? "").trim();
    const max = user?.role === "PRODUCER" ? 2000 : 1000;
    if (!text || text.length > max)
      invalid({ text: `1~${max}자로 적어 주세요.` });
    if (ctx.body.replyToVersion != null && (!Number.isInteger(ctx.body.replyToVersion) || Number(ctx.body.replyToVersion) < 0)) invalid({replyToVersion: "원문 버전을 확인해 주세요."});
    if (ctx.body.replyToMessageId != null && typeof ctx.body.replyToMessageId !== "string") invalid({replyToMessageId: "원문을 확인해 주세요."});
    return idempotent(ctx, `room:${farmId}`, () => {
      let body = mask(text).text;
      let replyTo = null;
      if (ctx.body.replyToMessageId != null) {
        if (user?.role !== "PRODUCER") fail(403, "FORBIDDEN", "농가만 소식방 인용 답장을 보낼 수 있어요.");
        const target = ctx.db.roomReplies.find(m => m.messageId === ctx.body.replyToMessageId && m.farmId === farmId);
        if (!target) notFound("이 소식방의 소비자 글에만 답장할 수 있어요.");
        if (ctx.body.replyToVersion != null && ctx.body.replyToVersion !== (target.editVersion ?? 0)) conflict("STALE_VERSION", "원문이 수정됐어요. 답장을 취소하고 다시 선택해 주세요.");
        replyTo = {senderType: "CONSUMER", body: maskBroadcastReply(target.body)};
        body = maskBroadcastReply(text);
        // 모두에게 답했으면 생산자가 읽은 답장이다(DEV-297)
        target.producerReadAt ??= nowIso();
      }
      if (user?.role === "PRODUCER") {
        const n = {
          replyTo,
          broadcastId: nextId("n"),
          farmId,
          body,
          photos: [],
          videos: [],
          createdAt: nowIso(),
          visibility: "FOLLOWERS" as const,
          baseReactions: 0,
          quotedReplyId: replyTo ? String(ctx.body.replyToMessageId) : null,
        };
        ctx.db.news.push(n);
        return visible(ctx, farmId).find((m) => m.messageId === n.broadcastId)!;
      }
      const answersBroadcastId = latestBroadcast(ctx.db, farmId);
      const message: RoomReplyRec = {
        messageId: nextId("reply"),
        farmId,
        body,
        photos: [],
        videos: [],
        createdAt: nowIso(),
        senderId: user.userId,
        senderName: user.name,
        senderRole: "CONSUMER",
        broadcastId: null,
        reactionCount: 0,
        myReaction: false,
        visibility: null,
        answersBroadcastId,
        producerReadAt: null,
      };
      ctx.db.roomReplies.push(message);
      return visible(ctx, farmId).find((m) => m.messageId === message.messageId)!;
    });
  },
  // 팔로워가 소식방에서 이 소식이 보이는 위치까지 읽었다(DEV-297). 위치는 앞으로만 간다
  "PUT /api/messaging/rooms/:farmId/read": (ctx) => {
    const user = ctx.me();
    if (user.role !== "CONSUMER") fail(403, "FORBIDDEN", "소비자만 쓸 수 있어요.");
    const farmId = ctx.params.farmId;
    const { canReply } = access(ctx, farmId);
    if (!canReply) fail(403, "FORBIDDEN", "팔로우한 농가의 소식방만 읽음이 남아요.");
    const n = ctx.db.news.find(
      (x) => x.broadcastId === ctx.body.lastReadMessageId && x.farmId === farmId,
    );
    if (!n) notFound("이 소식방의 소식이 아니에요.");
    const reads = (ctx.db.roomReads ??= []);
    const row = reads.find((r) => r.farmId === farmId && r.consumerId === user.userId);
    const next = { createdAt: n.createdAt, id: n.broadcastId };
    if (!row) reads.push({ farmId, consumerId: user.userId, broadcastId: n.broadcastId, at: n.createdAt });
    else if (byTime({ createdAt: row.at, id: row.broadcastId }, next) < 0)
      Object.assign(row, { broadcastId: n.broadcastId, at: n.createdAt });
    return null;
  },
  // 팬 답장 시트: 소식 하나에 연결된 소비자 답장(DEV-297). 자기 농가 생산자만, 오래된 순
  "GET /api/messaging/rooms/:farmId/broadcasts/:broadcastId/replies": (ctx) => {
    const { n, farmId } = ownBroadcast(ctx);
    const linked = ctx.db.roomReplies
      .filter((r) => r.answersBroadcastId === n.broadcastId)
      .sort((a, b) => byTime({ createdAt: a.createdAt, id: a.messageId }, { createdAt: b.createdAt, id: b.messageId }));
    const unreadOnly = ctx.query.filter === "unread";
    if (ctx.query.filter && !["all", "unread"].includes(ctx.query.filter))
      invalid({ filter: "all 또는 unread만 쓸 수 있어요." });
    const paidFarm = (orderProduct: string) => ctx.db.products[orderProduct]?.farmId === farmId;
    const reserved = (consumerId: string) =>
      Object.values(ctx.db.orders).some(
        (o) => o.consumerId === consumerId && !!o.paidAt && PAID.has(o.status) && paidFarm(o.productId),
      );
    const quoted = new Set(ctx.db.news.map((x) => x.quotedReplyId).filter(Boolean));
    const rows: FanReply[] = linked
      .filter((r) => !unreadOnly || !r.producerReadAt)
      .map((r) => ({
        messageId: r.messageId,
        consumerId: r.senderId,
        senderName: ctx.db.users[r.senderId]
          ? publicName(ctx.db.users[r.senderId])
          : `${r.senderName.slice(0, 1)}○○`,
        body: r.body,
        createdAt: r.createdAt,
        editVersion: r.editVersion ?? 0,
        unread: !r.producerReadAt,
        reservedCustomer: reserved(r.senderId),
        quoted: quoted.has(r.messageId),
      }));
    return {
      broadcast: {
        broadcastId: n.broadcastId,
        body: n.body,
        mediaCount: n.photos.length,
        createdAt: n.createdAt,
      },
      total: linked.length,
      unreadCount: linked.filter((r) => !r.producerReadAt).length,
      lastReplyId: linked.at(-1)?.messageId ?? null,
      ...paginate(rows, ctx.query),
    };
  },
  // 시트에서 본 답장(그 소식의 lastReadMessageId까지)을 생산자 읽음으로(DEV-297)
  "PUT /api/messaging/rooms/:farmId/broadcasts/:broadcastId/replies/read": (ctx) => {
    const { n } = ownBroadcast(ctx);
    const linked = ctx.db.roomReplies.filter((r) => r.answersBroadcastId === n.broadcastId);
    const last = linked.find((r) => r.messageId === ctx.body.lastReadMessageId);
    if (!last) notFound("이 소식의 답장이 아니에요.");
    const stamp = nowIso();
    for (const r of linked)
      if (!r.producerReadAt && byTime({ createdAt: r.createdAt, id: r.messageId }, { createdAt: last.createdAt, id: last.messageId }) <= 0)
        r.producerReadAt = stamp;
    return { unreadCount: linked.filter((r) => !r.producerReadAt).length };
  },
});

const PAID = new Set(["RESERVED", "PREPARING", "SHIPPED", "DELIVERED", "COMPLETED"]);

function ownBroadcast(ctx: Ctx) {
  const user = ctx.me();
  if (user.role !== "PRODUCER") fail(403, "FORBIDDEN", "농가만 쓸 수 있어요.");
  if (!user.farmId || ctx.db.farms[user.farmId]?.status !== "APPROVED")
    fail(403, "FORBIDDEN", "승인된 농가만 쓸 수 있어요.");
  const farmId = ctx.params.farmId;
  if (user.farmId !== farmId) notFound("내 농가의 소식방만 볼 수 있어요.");
  const n = ctx.db.news.find((x) => x.broadcastId === ctx.params.broadcastId && x.farmId === farmId);
  if (!n) notFound("찾을 수 없는 소식이에요.");
  return { n, farmId };
}
