import { editMessageText, messagePage } from "./conversations";
import type { NewsRoomMessage, NewsRoomSummary } from "../types";
import { nextId, nowIso } from "./db";
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

// Filter before pagination AND summaries. Another consumer's replies never leave the server.
function visible(ctx: Ctx, farmId: string): NewsRoomMessage[] {
  const { user, farm, canReply } = access(ctx, farmId);
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
      ...m,
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
        };
        ctx.db.news.push(n);
        return visible(ctx, farmId).find((m) => m.messageId === n.broadcastId)!;
      }
      const message: NewsRoomMessage = {
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
      };
      ctx.db.roomReplies.push(message);
      return message;
    });
  },
});
