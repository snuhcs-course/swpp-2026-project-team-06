import type {
  AiCheckState,
  AiPreview,
  AiSettings,
  ChatMessage,
  ChatSummary,
  Thread,
  Inquiry,
  Attachment,
} from "../types";
import { SUPPORT_ID } from "../types";
import {
  nextId,
  nowIso,
  REJECTED_FIRST,
  SUPPORT_WELCOME,
  SUSPENDED_FIRST,
  type DB,
  type EscalationRec,
  type OrderRec,
} from "./db";
import { chatMessage, mask, maskBroadcastReply } from "./derive";
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
import { publicName } from "./auth";
const key = (f: string, c: string) => `${f}:${c}`;
const following = (d: DB, f: string, c: string) =>
  d.follows.some((x) => x.farmId === f && x.userId === c);
export const defaultSettings = (): AiSettings => ({
  enabled: true,
  version: 1,
  smallOrderPolicy: "",
  reservationShippingPolicy: "",
  faqs: [],
  handoffTopics: [],
});
function approved(ctx: Ctx, f: string) {
  if (ctx.db.farms[f]?.status !== "APPROVED") notFound();
}
export function ensureThread(
  d: DB,
  farmId: string,
  consumerId: string,
): Thread {
  const k = key(farmId, consumerId);
  d.threads[k] ??= [];
  return (d.threadMeta[k] ??= {
    threadId: nextId("thread"),
    farmId,
    consumerId,
    aiMode: "AUTO",
    version: 1,
    consumerLastReadMessageId: null,
    producerLastReadMessageId: null,
  });
}
/** 농가 승인 때 farmclub 문의 대화방을 연다. 처음 만들 때만 환영 메시지를 넣는다(DEV-111) */
export function ensureSupportThread(
  d: DB,
  farmId: string,
  first: string = SUPPORT_WELCOME,
): Thread {
  const k = key(farmId, SUPPORT_ID),
    fresh = !d.threadMeta[k];
  const t = ensureThread(d, farmId, SUPPORT_ID);
  if (fresh) {
    t.aiMode = "HUMAN";
    d.threads[k].push(
      chatMessage({
        messageId: nextId("m"),
        senderType: "OPERATOR",
        body: first,
        photos: [],
        createdAt: nowIso(),
        sourceSummary: null,
        handoffStatus: null,
        masked: false,
      }),
    );
  }
  return t;
}
/** farmclub 방을 쓰는 농가 상태(DEV-209, 서버 support.py SUPPORT_STATUSES와 같다) */
const SUPPORT_STATUSES = ["APPROVED", "SUSPENDED", "REJECTED"];
/** 생산자 자기 농가의 farmclub 방. 정지·반려 농가는 처음 열 때 만든다(DEV-209, AC-34-9) */
function farmSupport(ctx: Ctx): Thread {
  const u = ctx.me();
  if (u.role !== "PRODUCER")
    fail(403, "FORBIDDEN", "생산자 계정만 쓸 수 있어요.");
  const f = u.farmId ? ctx.db.farms[u.farmId] : undefined;
  if (!f || !SUPPORT_STATUSES.includes(f.status))
    fail(
      403,
      "FORBIDDEN",
      "승인·정지·반려된 농가만 farmclub 대화방을 쓸 수 있어요.",
    );
  return ensureSupportThread(
    ctx.db,
    f.farmId,
    f.status === "SUSPENDED"
      ? SUSPENDED_FIRST
      : f.status === "REJECTED"
        ? REJECTED_FIRST
        : SUPPORT_WELCOME,
  );
}
/* ---------- 소비자 farmclub 문의 대화방(DEV-150, 서버 support.py와 같다) ---------- */
type SupportRoom = DB["supportRooms"][string];
function supportRoom(ctx: Ctx): SupportRoom {
  const u = ctx.me();
  if (u.role !== "CONSUMER")
    fail(403, "FORBIDDEN", "소비자 계정만 쓸 수 있어요.");
  const room = ctx.db.supportRooms[u.userId];
  if (!room) notFound("farmclub 대화방이 없어요.");
  return room;
}
function supportUnread(room: SupportRoom) {
  const at = room.messages.findIndex((m) => m.messageId === room.userLastRead);
  return room.messages.slice(at + 1).filter((m) => m.senderType === "OPERATOR")
    .length;
}
function supportSummary(d: DB, userId: string): ChatSummary[] {
  const room = d.supportRooms[userId],
    m = room?.messages.at(-1);
  if (!room || !m) return [];
  return [
    {
      farmId: SUPPORT_ID,
      farmName: "farmclub",
      farmPhoto: null,
      lastMessage: m.body,
      lastSenderType: m.senderType,
      lastAt: m.createdAt,
      unreadCount: supportUnread(room),
      isSupport: true,
    },
  ];
}
function mode(t: Thread, value: Thread["aiMode"]) {
  if (t.aiMode !== value) {
    t.aiMode = value;
    t.version++;
  }
}
function list(d: DB, t: Thread) {
  return d.threads[key(t.farmId, t.consumerId)] ?? [];
}
function inquiries(d: DB, t: Thread) {
  return d.inquiries.filter((i) => i.threadId === t.threadId);
}
function eligibleOrderIds(d: DB, t: Thread): string[] {
  const recorded = new Set([
    ...inquiries(d, t).map(i => i.orderId),
    ...(d.threadOrderContexts ?? []).filter(c => c.threadId === t.threadId).map(c => c.orderId),
  ]);
  return [...recorded].filter(id => {
    const o = d.orders[id];
    return o && o.paidAt && o.consumerId === t.consumerId &&
      d.products[o.productId]?.farmId === t.farmId;
  }).sort();
}
function paidOrder(ctx: Ctx, id: string): OrderRec {
  const u = ctx.me(),
    o = ctx.db.orders[id];
  if (
    !o ||
    !o.paidAt ||
    (u.role === "CONSUMER"
      ? o.consumerId !== u.userId
      : ctx.db.products[o.productId]?.farmId !== u.farmId)
  )
    notFound("결제한 본인 주문만 문의할 수 있어요.");
  if (u.role === "PRODUCER") approved(ctx, u.farmId!);
  return o;
}
function access(ctx: Ctx, write = false): Thread {
  const u = ctx.me(),
    f = u.role === "PRODUCER" ? u.farmId! : ctx.params.farmId,
    c = u.role === "PRODUCER" ? ctx.params.consumerId : u.userId;
  approved(ctx, f);
  const t = ctx.db.threadMeta[key(f, c)];
  if (!t) notFound("대화를 먼저 시작해 주세요.");
  if (u.role === "CONSUMER" && !following(ctx.db, f, c)) {
    if (!eligibleOrderIds(ctx.db, t).length)
      fail(403, "FORBIDDEN", "팔로우한 농가와만 채팅할 수 있어요.");
    if (write) {
      if (ctx.body.orderId == null)
        fail(403, "FORBIDDEN", "팔로우한 농가와만 채팅할 수 있어요. 주문 문의는 주문 상세에서 해 주세요.");
      const o = paidOrder(ctx, String(ctx.body.orderId ?? ""));
      if (ctx.db.products[o.productId]?.farmId !== f) notFound();
    }
  }
  if (write && u.role === "CONSUMER" && ctx.body.orderId != null) {
    const o = paidOrder(ctx, String(ctx.body.orderId));
    if (ctx.db.products[o.productId]?.farmId !== f) notFound();
  }
  return t;
}
function unread(d: DB, t: Thread, producer: boolean) {
  const m = list(d, t),
    id = producer ? t.producerLastReadMessageId : t.consumerLastReadMessageId;
  const at = m.findIndex((x) => x.messageId === id);
  return m
    .slice(at + 1)
    .filter((x) =>
      producer
        ? x.senderType === "CONSUMER" || x.senderType === "OPERATOR"
        : x.senderType !== "CONSUMER",
    ).length;
}
/** 확인 요청 깃발 상태(DEV-296, 서버 _check_state와 같음) */
export function checkState(e: EscalationRec): AiCheckState | null {
  if (e.status === "OPEN") return "REQUESTED";
  // resolution 없는 옛 닫힌 요청은 깃발 없음(서버와 같음)
  return e.resolution ?? null;
}
/** 이 대화의 열린 AI 답변 확인 요청 수(DEV-296) */
export function aiCheckRequests(d: DB, t: Thread) {
  return d.escalations.filter(
    (e) =>
      e.farmId === t.farmId &&
      e.consumerId === t.consumerId &&
      e.status === "OPEN" &&
      !!e.reportedMessageId,
  ).length;
}
/** 메시지 응답의 reported·checkState(DEV-296). 저장된 메시지는 바꾸지 않는다 */
export function withCheckState(d: DB, m: ChatMessage): ChatMessage {
  if (m.senderType !== "AI") return { ...m, checkState: null };
  const e = d.escalations.find((x) => x.reportedMessageId === m.messageId);
  return e ? { ...m, reported: true, checkState: checkState(e) } : { ...m, checkState: null };
}
/** 농가 답장으로 닫는 요청(DEV-296): 확인 요청이면 바로잡기(CORRECTED) */
export function closeByReply(e: EscalationRec, answer: string, by: string) {
  e.status = "ANSWERED";
  e.answer = answer;
  e.answeredAt = nowIso();
  e.resolvedBy = by;
  if (e.reportedMessageId) e.resolution = "CORRECTED";
}
/** needsReply: 1:1 목록 필터. checks=false면 확인 요청만 열린 대화는 뺀다(현황 '답하지 않은 문의', DEV-296) */
export function needsReply(d: DB, t: Thread, checks = true) {
  const m = list(d, t);
  const lastProducer = m.reduce(
    (n, x, i) => (x.senderType === "PRODUCER" ? i : n),
    -1,
  );
  return (
    m.some(
      (x, i) => i > lastProducer && x.senderType === "CONSUMER" && x.needsHuman,
    ) ||
    d.escalations.some(
      (e) =>
        e.farmId === t.farmId &&
        e.consumerId === t.consumerId &&
        e.status === "OPEN" &&
        (checks || !e.reportedMessageId),
    ) ||
    inquiries(d, t).some((i) => i.status === "OPEN")
  );
}
export function messagePage<T extends { messageId: string; createdAt: string }>(
  ctx: Ctx,
  resource: string,
  items: T[],
  sequenceOrder = false,
) {
  const all = sequenceOrder
    ? items.map((m, index) => ({ ...m, sequence: index + 1 })).reverse()
    : [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.messageId.localeCompare(a.messageId));
  const scope = `${ctx.user?.userId ?? "public"}|${resource}|`;
  let offset = 0;
  if (ctx.query.cursor) {
    let value = "";
    try {
      value = decodeURIComponent(atob(ctx.query.cursor));
    } catch {
      invalid({ cursor: "목록을 다시 열어 주세요" });
    }
    if (!value.startsWith(scope))
      invalid({ cursor: "이 대화의 커서가 아니에요" });
    const target = value.slice(scope.length);
    const i = all.findIndex((m) => `${m.createdAt}|${m.messageId}` === target);
    if (i < 0) invalid({ cursor: "목록을 다시 열어 주세요" });
    offset = i + 1;
  }
  const limit = Math.max(1, Math.min(50, Number(ctx.query.limit) || 20)),
    page = all.slice(offset, offset + limit),
    last = page.at(-1);
  return {
    items: page.reverse(),
    nextCursor:
      offset + limit < all.length && last
        ? btoa(
            encodeURIComponent(scope + `${last.createdAt}|${last.messageId}`),
          )
        : null,
  };
}
/** 서버 typical_reply_hours와 같은 규칙(DEV-208, AC-13-10). Mock은 매번 계산한다 */
const REPLY_BUCKETS = [1, 2, 3, 6, 12, 24, 48, 72];
export function typicalReplyHours(d: DB, farmId: string, now = Date.now()) {
  const since = now - 30 * 86400000,
    waits: number[] = [];
  for (const t of Object.values(d.threadMeta)) {
    if (t.farmId !== farmId) continue;
    let asked: number | null = null;
    for (const m of list(d, t)) {
      const at = Date.parse(m.createdAt);
      if (at > now) continue;
      if (m.senderType === "CONSUMER") asked ??= at;
      else if (m.senderType === "PRODUCER" && asked !== null) {
        if (at >= since) waits.push((at - asked) / 3600000);
        asked = null;
      }
    }
  }
  if (waits.length < 5) return null;
  const s = [...waits].sort((a, b) => a - b),
    mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return REPLY_BUCKETS.find((b) => mid <= b) ?? null;
}
function effectiveMode(t: Thread) {
  return t.humanReplyUntil ? (Date.parse(nowIso()) < Date.parse(t.humanReplyUntil) ? "HUMAN" : "AUTO") : t.aiMode;
}
function farmReply(d: DB, t: Thread) {
  const settings = d.aiSettings[t.farmId] ?? defaultSettings();
  return {
    mode: effectiveMode(t) === "AUTO" && settings.enabled ? ("AI" as const) : ("FARM" as const),
    typicalReplyHours: typicalReplyHours(d, t.farmId),
  };
}
function page(ctx: Ctx, t: Thread) {
  const d = ctx.db,
    ins = inquiries(d, t),
    linked = new Set([
      ...eligibleOrderIds(d, t),
      ...ins.map((i) => i.orderId),
      ...list(d, t)
        .map((m) => m.orderId)
        .filter(Boolean),
    ]);
  return {
    ...messagePage(ctx, t.threadId, list(d, t).map(m => withCheckState(d, { ...m, sourceSummary: m.handoffStatus === "FORWARDED" ? null : m.sourceSummary })), true),
    thread: {...t, aiMode: effectiveMode(t), serverNow: nowIso()},
    inquiries: ins,
    orders: Object.values(d.orders)
      .filter(
        (o) =>
          o.consumerId === t.consumerId &&
          d.products[o.productId]?.farmId === t.farmId &&
          o.paidAt &&
          linked.has(o.orderId),
      )
      .map((o) => ({
        orderId: o.orderId,
        productName: d.products[o.productId].name,
        optionLabel:
          d.products[o.productId].options.find((x) => x.optionId === o.optionId)
            ?.label ?? "",
        quantity: o.quantity,
        status: o.status,
      })),
    ...(ctx.me().role === "PRODUCER"
      ? {
          escalations: d.escalations
            .filter(
              (e) => e.farmId === t.farmId && e.consumerId === t.consumerId,
            )
            .map((e) => ({ ...e, thread: [] })),
          farmReply: null,
          consumerName:
            t.consumerId === SUPPORT_ID
              ? "farmclub"
              : publicName(d.users[t.consumerId]),
        }
      : { farmReply: farmReply(d, t), consumerName: null }),
  };
}
function validateSettings(raw: unknown): AiSettings {
  const b = raw as AiSettings;
  if (
    !b ||
    typeof b.enabled !== "boolean" ||
    typeof b.smallOrderPolicy !== "string" ||
    typeof b.reservationShippingPolicy !== "string" ||
    b.smallOrderPolicy.length > 1000 ||
    b.reservationShippingPolicy.length > 1000 ||
    !Array.isArray(b.faqs) ||
    b.faqs.length > 20 ||
    b.faqs.some(
      (f) =>
        !f.question?.trim() ||
        !f.answer?.trim() ||
        f.question.length > 200 ||
        f.answer.length > 1000,
    ) ||
    !Array.isArray(b.handoffTopics) ||
    b.handoffTopics.length > 20 ||
    b.handoffTopics.some(
      (t) => typeof t !== "string" || !t.trim() || t.length > 100,
    )
  )
    invalid({
      settings:
        "원칙 1,000자, FAQ 20개, 추가 전달 주제 20개 제한을 확인해 주세요",
    });
  return {
    enabled: b.enabled,
    version: b.version,
    smallOrderPolicy: b.smallOrderPolicy,
    reservationShippingPolicy: b.reservationShippingPolicy,
    faqs: b.faqs.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
    })),
    handoffTopics: [...b.handoffTopics],
  };
}
function preview(
  d: DB,
  farmId: string,
  q: string,
  s: AiSettings,
  temporary = false,
  productId?: string,
  orderId?: string,
): AiPreview {
  const result = (
    action: AiPreview["action"],
    answer: string | null,
    reason: string,
    sourceRefs: string[] = [],
  ): AiPreview => ({
    action,
    answer,
    reason,
    sourceRefs,
    settingsVersion: temporary ? null : s.version,
  });
  if (!s.enabled) return result("DISABLED", null, "농가 AI 응답이 꺼져 있어요");
  const unsafePolicy =
    /환불|보상|농약|약속|무조건|지시|프롬프트|할인|가격|흥정|깎|\d+(?:\.\d+)?\s*만\s*원|\d[\d,]*(?:\.\d+)?\s*원|배송.*변경/;
  if (
    /농약|재배|유기농|환불|보상|항의|불만|흥정|깎|파손|상했|썩|맛|신가|셔요|달아|달까|날짜.*변경|미뤄|당겨|약속/.test(
      q,
    ) ||
    s.handoffTopics.some((t) => q.includes(t))
  )
    return result("HANDOFF", null, "농가가 직접 확인해야 하는 질문이에요");
  const o = orderId ? d.orders[orderId] : undefined;
  const candidates = Object.values(d.products).filter(
    (p) => p.farmId === farmId && p.status === "PUBLISHED",
  );
  const p = productId
    ? candidates.find((p) => p.productId === productId)
    : o
      ? d.products[o.productId]
      : candidates.length === 1
        ? candidates[0]
        : undefined;
  if (/배송비|택배비/.test(q) && p)
    return result(
      "ANSWER",
      p.shippingFeeType === "FREE"
        ? `무료배송이며 도서산간 추가 운임은 ${p.remoteAreaFee}원이에요.`
        : `배송비는 ${p.shippingFee}원이에요.`,
      "등록 상품 정보",
      [`product:${p.productId}`],
    );
  if (/배송|도착|수령|받는|받을|출하/.test(q) && (o || p)?.deliveryWindow) {
    const w = (o || p)!.deliveryWindow!;
    return result(
      "ANSWER",
      `${w.start} ~ ${w.end}에 받을 예정이에요.`,
      "확정 배송 기간",
      [o ? `order:${o.orderId}` : `product:${p!.productId}`],
    );
  }
  if (/당도|브릭스/.test(q) && p && (p.measuredBrix || p.expectedBrix))
    return result(
      "ANSWER",
      p.measuredBrix
        ? `등록된 실측 당도는 ${p.measuredBrix}Brix예요.`
        : `예상 당도는 ${p.expectedBrix}Brix이며 실측치는 아직 없어요.`,
      "등록된 당도",
      [`product:${p.productId}`],
    );
  const faq = s.faqs.find((f) => f.question.trim() === q.trim());
  if (faq && !unsafePolicy.test(faq.answer))
    return result("ANSWER", mask(faq.answer).text, "농가 FAQ", ["farm:faq"]);
  if (
    /소량|최소/.test(q) &&
    s.smallOrderPolicy &&
    !unsafePolicy.test(s.smallOrderPolicy)
  )
    return result(
      "ANSWER",
      mask(s.smallOrderPolicy).text,
      "농가 소량 주문 원칙",
      ["farm:smallOrderPolicy"],
    );
  if (
    /예약.*(?:배송|출하)|(?:배송|출하).*예약/.test(q) &&
    s.reservationShippingPolicy &&
    !unsafePolicy.test(s.reservationShippingPolicy)
  )
    return result(
      "ANSWER",
      mask(s.reservationShippingPolicy).text,
      "농가 예약·배송 원칙",
      ["farm:reservationShippingPolicy"],
    );
  return result(
    "HANDOFF",
    null,
    "상품이 불명확하거나 등록된 정보로 확답하기 어려워요",
  );
}
function attachments(ctx: Ctx, t: Thread, orderId?: string): Attachment[] {
  const ids = (ctx.body.attachmentIds ?? []) as string[];
  if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length)
    invalid({ attachmentIds: "사진은 서로 다른 3장까지 첨부해 주세요" });
  return ids.map((id) => {
    const a = ctx.db.attachments[id];
    if (
      !a ||
      a.ownerId !== ctx.me().userId ||
      a.bound ||
      (a.orderId ? a.orderId !== orderId : a.threadId !== t.threadId) ||
      Date.now() - Date.parse(a.createdAt) > 86400000
    )
      notFound("사용할 수 없는 첨부예요.");
    return { attachmentId: a.attachmentId, mimeType: a.mimeType, size: a.size };
  });
}
function bind(ctx: Ctx, aa: Attachment[]) {
  aa.forEach((a) => (ctx.db.attachments[a.attachmentId].bound = true));
}
function send(ctx: Ctx, t: Thread, producer: boolean) {
  return idempotent(ctx, `send:${t.threadId}`, () => {
    const text = String(ctx.body.text ?? "").trim(),
      orderId = ctx.body.orderId ? String(ctx.body.orderId) : undefined,
      productId = ctx.body.productId ? String(ctx.body.productId) : undefined;
    if (orderId) {
      const o = paidOrder(ctx, orderId);
      if (
        ctx.db.products[o.productId]?.farmId !== t.farmId ||
        o.consumerId !== t.consumerId
      )
        notFound();
    }
    // 상품 페이지에서 연 채팅의 상품(DEV-97): 그 농가의 판매 중 상품만
    if (productId) {
      const p = ctx.db.products[productId];
      if (p?.farmId !== t.farmId || p.status !== "PUBLISHED") notFound();
    }
    let replyId = ctx.body.replyToMessageId as string | undefined;
    let target = replyId ? list(ctx.db, t).find(m => m.messageId === replyId) : undefined;
    if (replyId && !target) notFound();
    const aa = attachments(ctx, t, orderId);
    if ((!text && !aa.length) || text.length > 1000)
      invalid({
        text: "본문 또는 사진을 넣고 글은 1,000자 이내로 적어 주세요",
      });
    const es = (ctx.body.answerToEscalationIds ?? []) as string[];
    if (
      !Array.isArray(es) ||
      es.some(
        (id) =>
          !ctx.db.escalations.some(
            (e) =>
              e.escalationId === id &&
              e.farmId === t.farmId &&
              e.consumerId === t.consumerId,
          ),
      )
    )
      notFound();
    // 농가 답장이 닫는 요청. 인용 없이 확인 요청 하나만 닫으면 그 AI 답변을 인용한다(DEV-296, 서버와 같음)
    const closing = producer
      ? ctx.db.escalations.filter((e) => e.status === "OPEN" && e.farmId === t.farmId && e.consumerId === t.consumerId &&
          (es.includes(e.escalationId) || (!!replyId && ((!e.reportedMessageId && e.questionMessageId === replyId) || e.reportedMessageId === replyId))))
      : [];
    const corrected = closing.filter((e) => e.reportedMessageId);
    if (!target && corrected.length === 1) {
      replyId = corrected[0].reportedMessageId!;
      target = list(ctx.db, t).find(m => m.messageId === replyId);
    }
    const m = mask(text),
      settings = ctx.db.aiSettings[t.farmId] ?? defaultSettings();
    const message = chatMessage({
      replyToMessageId: replyId ?? null,
      replyTo: target ? {messageId: target.messageId, senderType: target.senderType,
        body: target.body, attachmentCount: target.attachmentIds?.length ?? 0} : null,
      messageId: nextId("m"),
      sequence: list(ctx.db, t).length + 1,
      senderType: producer ? "PRODUCER" : "CONSUMER",
      body: m.text,
      masked: m.masked,
      createdAt: nowIso(),
      attachmentIds: aa.map((a) => a.attachmentId),
      orderId,
      needsHuman: !producer && (effectiveMode(t) === "HUMAN" || !settings.enabled),
    });
    bind(ctx, aa);
    list(ctx.db, t).push(message);
    if (producer) {
      const inquiryOpen = ctx.db.inquiries.some(i => i.threadId === t.threadId && i.status === "OPEN");
      t.humanReplyUntil = inquiryOpen || t.consumerId === SUPPORT_ID ? null : new Date(Date.parse(nowIso()) + 600000).toISOString();
      t.version++;
      mode(t, "HUMAN");
      closing.forEach((e) => closeByReply(e, m.text, ctx.me().userId));
      return { message, thread: t };
    }
    let reply: ChatMessage | null = null;
    // Deterministic Mock: no async/model call. Versions are checked in the same synchronous transaction.
    const tv = t.version,
      sv = settings.version;
    if (effectiveMode(t) === "AUTO" && settings.enabled) {
      const a = preview(
        ctx.db,
        t.farmId,
        text,
        settings,
        false,
        // 서버처럼 주문이 상품보다 먼저다. preview는 상품을 먼저 보므로 주문이 없을 때만 넘긴다
        orderId ? undefined : productId,
        orderId,
      );
      if (
        t.version === tv &&
        (ctx.db.aiSettings[t.farmId]?.version ?? 1) === sv
      ) {
        reply = chatMessage({
          messageId: nextId("m"),
          sequence: list(ctx.db, t).length + 1,
          senderType: "AI",
          body: a.answer ?? "농가에 전달했어요. 직접 답변을 기다려 주세요.",
          createdAt: nowIso(),
          handoffStatus: a.action === "HANDOFF" ? "FORWARDED" : null,
          sourceSummary: a.action === "HANDOFF" ? null : a.reason,
          sourceRefs: a.sourceRefs,
          settingsVersion: a.settingsVersion,
        });
        list(ctx.db, t).push(reply);
        if (a.action === "HANDOFF")
          ctx.db.escalations.push({
            escalationId: nextId("e"),
            farmId: t.farmId,
            consumerId: t.consumerId,
            consumerName: publicName(ctx.me()),
            context: orderId ?? null,
            questionMessageId: message.messageId,
            question: m.text,
            reason: a.reason,
            createdAt: nowIso(),
            status: "OPEN",
            answer: null,
          });
      } else message.needsHuman = true;
    }
    return { message, reply };
  });
}
export function editMessageText(ctx: Ctx, row: {body: string; replyTo?: {body: string} | null; masked?: boolean; editedAt?: string | null; editVersion?: number; photos?: string[]; videos?: string[]; attachmentIds?: string[]}, limit: number, redactEmail = false) {
  if (typeof ctx.body.text !== "string" || !Number.isInteger(ctx.body.version) || Number(ctx.body.version) < 0) invalid({text: "본문과 버전을 확인해 주세요."});
  if ((row.editVersion ?? 0) !== ctx.body.version) conflict("STALE_VERSION", "다른 곳에서 수정됐어요. 닫고 다시 열어 주세요.");
  const text = String(ctx.body.text).trim();
  if ((!text && !row.photos?.length && !row.videos?.length && !row.attachmentIds?.length) || text.length > limit) invalid({text: `본문을 ${limit}자 이내로 적어 주세요.`});
  const {text: filtered, masked} = mask(text);
  const value = redactEmail ? maskBroadcastReply(filtered) : filtered;
  if (value !== row.body) { if ("masked" in row) row.masked = masked; row.body = value; row.editedAt = nowIso(); row.editVersion = (row.editVersion ?? 0) + 1; }
}
register({
  "PATCH /api/messaging/messages/:messageId": (ctx) => {
    const user = ctx.me();
    const t = Object.values(ctx.db.threadMeta).find(thread => list(ctx.db, thread).some(m => m.messageId === ctx.params.messageId));
    if (!t || t.consumerId === SUPPORT_ID) notFound();
    if ((user.role === "PRODUCER" ? user.farmId !== t.farmId : user.userId !== t.consumerId)) notFound();
    access({...ctx, params: {...ctx.params, farmId: t.farmId, consumerId: t.consumerId}});
    const message = list(ctx.db, t).find(m => m.messageId === ctx.params.messageId)!;
    if (message.senderType !== user.role) notFound("본인이 보낸 메시지만 수정할 수 있어요.");
    return idempotent(ctx, `edit-chat:${message.messageId}`, () => {
      const old = message.editVersion ?? 0;
      editMessageText(ctx, message, 1000);
      if (old !== (message.editVersion ?? 0)) t.version++;
      return {...message, editedAt: message.editedAt ?? null, editVersion: message.editVersion ?? 0};
    });
  },
  "GET /api/messaging/chats": (ctx) => {
    const u = ctx.me();
    return paginate(
      Object.values(ctx.db.threadMeta)
        .filter(
          (t) =>
            t.consumerId === u.userId &&
            ctx.db.farms[t.farmId]?.status === "APPROVED" &&
            (following(ctx.db, t.farmId, u.userId) ||
              eligibleOrderIds(ctx.db, t).length > 0),
        )
        .map((t): ChatSummary => {
          const f = ctx.db.farms[t.farmId],
            m = list(ctx.db, t).at(-1);
          return {
            farmId: f.farmId,
            farmName: f.name,
            farmPhoto: f.photo,
            lastMessage: m?.body ?? "대화를 시작해 보세요",
            lastSenderType: m?.senderType ?? "PRODUCER",
            lastAt: m?.createdAt ?? "",
            unreadCount: unread(ctx.db, t, false),
          };
        })
        // farmclub 문의 대화방(DEV-150). 고정하지 않고 최근 순으로 섞인다
        .concat(supportSummary(ctx.db, u.userId))
        .sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
      ctx.query,
    );
  },
  "GET /api/messaging/support/messages": (ctx) => ({
    items: supportRoom(ctx).messages.map((m, index) => ({ ...m, sequence: index + 1 })),
    nextCursor: null,
  }),
  "POST /api/messaging/support/messages": (ctx) => {
    const room = supportRoom(ctx),
      text = String(ctx.body.text ?? "").trim();
    if (!text || text.length > 1000)
      invalid({ text: "문의는 1~1,000자로 적어 주세요" });
    return idempotent(ctx, "support-send", () => {
      const { text: body, masked } = mask(text);
      const message = chatMessage({
        messageId: nextId("m"),
        senderType: "CONSUMER",
        body,
        createdAt: nowIso(),
        masked,
      });
      message.sequence = room.messages.length + 1;
      room.messages.push(message);
      return { message, reply: null };
    });
  },
  "PUT /api/messaging/support/read": (ctx) => {
    const room = supportRoom(ctx),
      id = String(ctx.body.lastReadMessageId ?? ""),
      at = room.messages.findIndex((m) => m.messageId === id);
    if (at < 0) notFound("찾을 수 없는 메시지예요.");
    const prev = room.messages.findIndex(
      (m) => m.messageId === room.userLastRead,
    );
    if (at > prev) room.userLastRead = id;
    return { unreadCount: supportUnread(room) };
  },
  "POST /api/messaging/chats": (ctx) => {
    const u = ctx.me(),
      f = String(ctx.body.farmId);
    approved(ctx, f);
    const orderId = ctx.body.orderId == null ? undefined : String(ctx.body.orderId);
    if (orderId !== undefined) {
      const o = paidOrder(ctx, orderId);
      if (ctx.db.products[o.productId]?.farmId !== f) notFound();
    }
    return idempotent(ctx, `start:${f}`, () => {
      const thread = ensureThread(ctx.db, f, u.userId);
      if (orderId !== undefined) {
        const contexts = ctx.db.threadOrderContexts ??= [];
        if (!contexts.some(c => c.threadId === thread.threadId && c.orderId === orderId))
          contexts.push({ threadId: thread.threadId, orderId, createdAt: nowIso() });
        return { farmId: f, autoFollowed: false };
      }
      const autoFollowed = !following(ctx.db, f, u.userId);
      if (autoFollowed) {
        ctx.db.follows.push({ farmId: f, userId: u.userId });
        ctx.db.farms[f].followerCount++;
      }
      ensureThread(ctx.db, f, u.userId);
      return { farmId: f, autoFollowed };
    });
  },
  "GET /api/messaging/chats/:farmId/messages": (ctx) => page(ctx, access(ctx)),
  "POST /api/messaging/chats/:farmId/messages/:messageId/report": (ctx) => {
    const t = access(ctx);
    const messages = list(ctx.db, t);
    const at = messages.findIndex((m) => m.messageId === ctx.params.messageId);
    if (at < 0) notFound("찾을 수 없는 메시지예요.");
    const target = messages[at];
    if (target.senderType !== "AI" || target.handoffStatus === "FORWARDED")
      invalid({ messageId: "신고할 수 있는 AI 답변이 아니에요" });
    const previous = ctx.db.escalations.find(
      (e) => e.reportedMessageId === target.messageId,
    );
    if (previous) return previous;
    let question: ChatMessage | undefined;
    for (let i = at - 1; i >= 0; i--) {
      if (messages[i].senderType === "CONSUMER") {
        question = messages[i];
        break;
      }
    }
    if (!question) invalid({ messageId: "연결할 소비자 질문이 없어요" });
    const escalation = {
      escalationId: nextId("e"),
      farmId: t.farmId,
      consumerId: t.consumerId,
      consumerName: publicName(ctx.db.users[t.consumerId]),
      context: question.orderId ?? null,
      questionMessageId: question.messageId,
      question: question.body,
      reason: "WRONG_ANSWER",
      createdAt: nowIso(),
      status: "OPEN" as const,
      answer: null,
      reportedMessageId: target.messageId,
    };
    target.reported = true;
    ctx.db.escalations.push(escalation);
    return escalation;
  },
  "POST /api/messaging/chats/:farmId/messages": (ctx) =>
    send(ctx, access(ctx, true), false),
  "GET /api/messaging/producer/support/messages": (ctx) =>
    page(ctx, farmSupport(ctx)),
  "POST /api/messaging/producer/support/messages": (ctx) =>
    send(ctx, farmSupport(ctx), true),
  "PUT /api/messaging/producer/support/read": (ctx) => {
    const t = farmSupport(ctx),
      m = list(ctx.db, t),
      i = m.findIndex((m) => m.messageId === ctx.body.lastReadMessageId);
    if (i < 0) notFound();
    if (i > m.findIndex((m) => m.messageId === t.producerLastReadMessageId))
      t.producerLastReadMessageId = m[i].messageId;
    return { unreadCount: unread(ctx.db, t, true) };
  },
  "GET /api/messaging/producer/chats": (ctx) => {
    const f = ctx.me().farmId!;
    const rows = Object.values(ctx.db.threadMeta)
      .filter((t) => t.farmId === f)
      .map((t) => {
        const m = list(ctx.db, t).at(-1);
        return {
          threadId: t.threadId,
          consumerId: t.consumerId,
          consumerName:
            t.consumerId === SUPPORT_ID
              ? "farmclub"
              : publicName(ctx.db.users[t.consumerId]),
          lastMessage: m?.body ?? "대화를 시작해 보세요",
          lastAt: m?.createdAt ?? "",
          unreadCount: unread(ctx.db, t, true),
          needsReply: needsReply(ctx.db, t),
          aiCheckRequests: aiCheckRequests(ctx.db, t),
          aiMode: effectiveMode(t),
          isSupport: t.consumerId === SUPPORT_ID,
        };
      })
      .filter((t) => ctx.query.needsReply !== "true" || t.needsReply)
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    return paginate(rows, ctx.query);
  },
  // 확인 요청된 AI 답변에 '답이 맞아요'(DEV-296). 답장 없이 닫고, 다시 눌러도 같은 결과
  "POST /api/messaging/producer/chats/:consumerId/messages/:messageId/confirm": (ctx) => {
    const f = ctx.me().farmId!,
      t = ctx.db.threadMeta[key(f, ctx.params.consumerId)];
    if (!t) notFound("찾을 수 없는 대화예요.");
    const target = list(ctx.db, t).find((m) => m.messageId === ctx.params.messageId);
    const e = target && ctx.db.escalations.find((x) => x.reportedMessageId === target.messageId);
    if (!target || !e) notFound("확인 요청이 없는 답변이에요.");
    if (e.status === "OPEN") {
      e.status = "ANSWERED";
      e.resolution = "CONFIRMED";
      e.resolvedBy = ctx.me().userId;
      e.answeredAt = nowIso();
    } else if (e.resolution !== "CONFIRMED")
      conflict("ALREADY_CORRECTED", "이미 농가가 답한 답변이에요.");
    return withCheckState(ctx.db, target);
  },
  "POST /api/messaging/producer/chats": (ctx) => {
    const f = ctx.me().farmId!,
      c = String(ctx.body.consumerId),
      t = ctx.db.threadMeta[key(f, c)];
    if (
      !t &&
      (!following(ctx.db, f, c) ||
        !ctx.db.roomReplies.some(
          (m) =>
            m.farmId === f &&
            m.senderId === c &&
            m.messageId === ctx.body.roomReplyId,
        ))
    )
      notFound();
    return idempotent(ctx, `producer-start:${c}`, () =>
      ensureThread(ctx.db, f, c),
    );
  },
  "GET /api/messaging/producer/chats/:consumerId/messages": (ctx) =>
    page(ctx, access(ctx)),
  "POST /api/messaging/producer/chats/:consumerId/messages": (ctx) =>
    send(ctx, access(ctx), true),
  "PUT /api/messaging/producer/chats/:consumerId/ai-mode": (ctx) => {
    const t = access(ctx);
    if (t.consumerId === SUPPORT_ID)
      invalid({ mode: "farmclub 대화방은 AI 응답을 쓰지 않아요" });
    return idempotent(ctx, `mode:${t.threadId}`, () => {
      if (ctx.body.version !== t.version)
        conflict("STALE_VERSION", "최신 대화 상태를 다시 불러와 주세요.");
      if (ctx.body.mode !== "AUTO" && ctx.body.mode !== "HUMAN")
        invalid({ mode: "응대 모드를 골라 주세요" });
      t.humanReplyUntil = ctx.body.mode === "HUMAN" ? new Date(Date.parse(nowIso()) + 600000).toISOString() : null;
      t.version++;
      mode(t, ctx.body.mode);
      return t;
    });
  },
  "GET /api/farms/me/ai-settings": (ctx) =>
    ctx.db.aiSettings[ctx.me().farmId!] ?? defaultSettings(),
  "PUT /api/farms/me/ai-settings": (ctx) => {
    const f = ctx.me().farmId!;
    return idempotent(ctx, `ai:${f}`, () => {
      const s = validateSettings(ctx.body),
        old = ctx.db.aiSettings[f] ?? defaultSettings();
      if (s.version !== old.version)
        conflict("STALE_VERSION", "최신 AI 설정을 다시 불러와 주세요.");
      const next = { ...s, version: s.version + 1 };
      ctx.db.aiSettings[f] = next;
      ctx.db.aiHistory.push({ farmId: f, settings: next, createdAt: nowIso() });
      return next;
    });
  },
  "POST /api/farms/me/ai-settings/preview": (ctx) => {
    const f = ctx.me().farmId!,
      q = String(ctx.body.question ?? "").trim();
    if (!q || q.length > 1000)
      invalid({ question: "질문을 1~1,000자로 적어 주세요" });
    if (ctx.body.orderId) paidOrder(ctx, String(ctx.body.orderId));
    if (
      ctx.body.productId &&
      ctx.db.products[String(ctx.body.productId)]?.farmId !== f
    )
      notFound();
    return preview(
      ctx.db,
      f,
      q,
      ctx.body.settings
        ? validateSettings(ctx.body.settings)
        : (ctx.db.aiSettings[f] ?? defaultSettings()),
      !!ctx.body.settings,
      ctx.body.productId as string | undefined,
      ctx.body.orderId as string | undefined,
    );
  },
  "POST /api/orders/:orderId/inquiries": (ctx) => {
    const o = paidOrder(ctx, ctx.params.orderId);
    if (ctx.me().role !== "CONSUMER")
      fail(403, "FORBIDDEN", "소비자 주문에서 접수해 주세요", {
        reason: "WRONG_APP",
      });
    return idempotent(ctx, `inquiry:${o.orderId}`, () => {
      const text = String(ctx.body.text ?? "").trim(),
        type = String(ctx.body.type);
      if (
        !text ||
        text.length > 1000 ||
        !["DAMAGE", "CONDITION", "TASTE", "OTHER"].includes(type)
      )
        invalid({ text: "유형을 선택하고 설명을 1~1,000자로 적어 주세요" });
      const f = ctx.db.products[o.productId].farmId;
      approved(ctx, f);
      const t = ensureThread(ctx.db, f, o.consumerId),
        aa = attachments(ctx, t, o.orderId);
      const i: Inquiry = {
        inquiryId: nextId("inquiry"),
        orderId: o.orderId,
        threadId: t.threadId,
        type: type as Inquiry["type"],
        text: mask(text).text,
        attachments: aa,
        status: "OPEN",
        version: 1,
        createdAt: nowIso(),
        resolvedAt: null,
      };
      const message = chatMessage({
        messageId: nextId("m"),
        senderType: "CONSUMER",
        body: i.text,
        createdAt: i.createdAt,
        attachmentIds: aa.map((a) => a.attachmentId),
        orderId: o.orderId,
        inquiryId: i.inquiryId,
        needsHuman: true,
      });
      ctx.db.inquiries.push(i);
      bind(ctx, aa);
      list(ctx.db, t).push(message);
      t.humanReplyUntil = null;
      t.version++;
      mode(t, "HUMAN");
      return { inquiry: i, message, threadId: t.threadId };
    });
  },
  "GET /api/orders/:orderId/inquiries": (ctx) => {
    const o = paidOrder(ctx, ctx.params.orderId);
    return paginate(
      ctx.db.inquiries.filter((i) => i.orderId === o.orderId),
      ctx.query,
    );
  },
  "PUT /api/messaging/producer/inquiries/:inquiryId/status": (ctx) => {
    const i = ctx.db.inquiries.find(
      (i) => i.inquiryId === ctx.params.inquiryId,
    );
    if (!i) notFound();
    paidOrder(ctx, i.orderId);
    return idempotent(ctx, `inquiry-status:${i.inquiryId}`, () => {
      if (i.version !== ctx.body.version)
        conflict("STALE_VERSION", "최신 문의 상태를 다시 불러와 주세요.");
      if (ctx.body.status !== "OPEN" && ctx.body.status !== "RESOLVED")
        invalid({ status: "문의 상태를 확인해 주세요" });
      i.status = ctx.body.status;
      i.version++;
      i.resolvedAt = i.status === "RESOLVED" ? nowIso() : null;
      return i;
    });
  },
});
for (const route of [
  "/api/messaging/chats/:farmId/read",
  "/api/messaging/producer/chats/:consumerId/read",
])
  register({
    [`PUT ${route}`]: (ctx) => {
      const t = access(ctx),
        m = list(ctx.db, t),
        i = m.findIndex((m) => m.messageId === ctx.body.lastReadMessageId);
      if (i < 0) notFound();
      const field =
        ctx.me().role === "PRODUCER"
          ? "producerLastReadMessageId"
          : "consumerLastReadMessageId";
      if (i > m.findIndex((m) => m.messageId === t[field]))
        t[field] = m[i].messageId;
      return { unreadCount: unread(ctx.db, t, ctx.me().role === "PRODUCER") };
    },
  });
export function attachmentAccess(
  ctx: Ctx,
  orderId?: string,
  threadId?: string,
) {
  if (!!orderId === !!threadId)
    invalid({ file: "주문 또는 대화를 하나 지정해 주세요" });
  if (orderId) {
    paidOrder(ctx, orderId);
    return;
  }
  const t = Object.values(ctx.db.threadMeta).find(
      (t) => t.threadId === threadId,
    ),
    u = ctx.me();
  if (
    !t ||
    (u.role === "CONSUMER" ? t.consumerId !== u.userId : t.farmId !== u.farmId)
  )
    notFound();
  // farmclub 방은 정지·반려 농가도 사진을 붙인다(DEV-209)
  if (t.consumerId === SUPPORT_ID) {
    if (!SUPPORT_STATUSES.includes(ctx.db.farms[t.farmId]?.status ?? ""))
      notFound();
    return;
  }
  approved(ctx, t.farmId);
  if (
    u.role === "CONSUMER" &&
    !following(ctx.db, t.farmId, u.userId) &&
    !eligibleOrderIds(ctx.db, t).length
  )
    notFound();
}
