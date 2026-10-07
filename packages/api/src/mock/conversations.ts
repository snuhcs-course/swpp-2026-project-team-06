import type {
  AiPreview,
  AiSettings,
  ChatMessage,
  Thread,
  Inquiry,
  Attachment,
} from "../types";
import { nextId, nowIso, type DB, type OrderRec } from "./db";
import { chatMessage, mask } from "./derive";
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
    if (!inquiries(ctx.db, t).length)
      fail(403, "FORBIDDEN", "팔로우한 농가와만 채팅할 수 있어요.");
    if (write) {
      const o = paidOrder(ctx, String(ctx.body.orderId ?? ""));
      if (ctx.db.products[o.productId]?.farmId !== f) notFound();
    }
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
      producer ? x.senderType === "CONSUMER" : x.senderType !== "CONSUMER",
    ).length;
}
export function needsReply(d: DB, t: Thread) {
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
        e.status === "OPEN",
    ) ||
    inquiries(d, t).some((i) => i.status === "OPEN")
  );
}
export function messagePage<T extends { messageId: string; createdAt: string }>(
  ctx: Ctx,
  resource: string,
  items: T[],
) {
  const all = [...items].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) ||
      b.messageId.localeCompare(a.messageId),
  );
  const scope = `${ctx.me().userId}|${resource}|`;
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
function page(ctx: Ctx, t: Thread) {
  const d = ctx.db,
    ins = inquiries(d, t),
    linked = new Set([
      ...ins.map((i) => i.orderId),
      ...list(d, t)
        .map((m) => m.orderId)
        .filter(Boolean),
    ]);
  return {
    ...messagePage(ctx, t.threadId, list(d, t)),
    thread: t,
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
        }
      : {}),
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
  if (/배송|언제|받는/.test(q) && (o || p)?.deliveryWindow) {
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
  if (
    faq &&
    !/환불|보상|농약|약속|무조건|지시|프롬프트|할인|배송.*변경|원/.test(
      faq.answer,
    )
  )
    return result("ANSWER", mask(faq.answer).text, "농가 FAQ", ["farm:faq"]);
  if (
    /소량|최소/.test(q) &&
    s.smallOrderPolicy &&
    !/환불|보상|무조건|약속|원|지시/.test(s.smallOrderPolicy)
  )
    return result(
      "ANSWER",
      mask(s.smallOrderPolicy).text,
      "농가 소량 주문 원칙",
      ["farm:smallOrderPolicy"],
    );
  if (
    q === "예약·배송 안내 원칙" &&
    s.reservationShippingPolicy &&
    !/환불|보상|무조건|약속|원|지시/.test(s.reservationShippingPolicy)
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
      orderId = ctx.body.orderId ? String(ctx.body.orderId) : undefined;
    if (orderId) {
      const o = paidOrder(ctx, orderId);
      if (
        ctx.db.products[o.productId]?.farmId !== t.farmId ||
        o.consumerId !== t.consumerId
      )
        notFound();
    }
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
    const m = mask(text),
      settings = ctx.db.aiSettings[t.farmId] ?? defaultSettings();
    const message = chatMessage({
      messageId: nextId("m"),
      senderType: producer ? "PRODUCER" : "CONSUMER",
      body: m.text,
      masked: m.masked,
      createdAt: nowIso(),
      attachmentIds: aa.map((a) => a.attachmentId),
      orderId,
      needsHuman: !producer && (t.aiMode === "HUMAN" || !settings.enabled),
    });
    bind(ctx, aa);
    list(ctx.db, t).push(message);
    if (producer) {
      mode(t, "HUMAN");
      ctx.db.escalations
        .filter((e) => es.includes(e.escalationId))
        .forEach((e) => {
          e.status = "ANSWERED";
          e.answer = m.text;
        });
      return { message, thread: t };
    }
    let reply: ChatMessage | null = null;
    // Deterministic Mock: no async/model call. Versions are checked in the same synchronous transaction.
    const tv = t.version,
      sv = settings.version;
    if (t.aiMode === "AUTO" && settings.enabled) {
      const a = preview(
        ctx.db,
        t.farmId,
        text,
        settings,
        false,
        undefined,
        orderId,
      );
      if (
        t.version === tv &&
        (ctx.db.aiSettings[t.farmId]?.version ?? 1) === sv
      ) {
        reply = chatMessage({
          messageId: nextId("m"),
          senderType: "AI",
          body: a.answer ?? "농가에 전달했어요. 직접 답변을 기다려 주세요.",
          createdAt: nowIso(),
          handoffStatus: a.action === "HANDOFF" ? "FORWARDED" : null,
          sourceSummary: a.reason,
          sourceRefs: a.sourceRefs,
          settingsVersion: a.settingsVersion,
        });
        list(ctx.db, t).push(reply);
        if (a.action === "HANDOFF")
          ctx.db.escalations.push({
            escalationId: nextId("e"),
            farmId: t.farmId,
            consumerId: t.consumerId,
            consumerName: `${ctx.me().name.slice(0, 1)}○○`,
            context: orderId ?? null,
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
register({
  "GET /api/messaging/chats": (ctx) => {
    const u = ctx.me();
    return paginate(
      Object.values(ctx.db.threadMeta)
        .filter(
          (t) =>
            t.consumerId === u.userId &&
            ctx.db.farms[t.farmId]?.status === "APPROVED" &&
            (following(ctx.db, t.farmId, u.userId) ||
              inquiries(ctx.db, t).length),
        )
        .map((t) => {
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
        .sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
      ctx.query,
    );
  },
  "POST /api/messaging/chats": (ctx) => {
    const u = ctx.me(),
      f = String(ctx.body.farmId);
    approved(ctx, f);
    return idempotent(ctx, `start:${f}`, () => {
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
  "POST /api/messaging/chats/:farmId/messages": (ctx) =>
    send(ctx, access(ctx, true), false),
  "GET /api/messaging/producer/chats": (ctx) => {
    const f = ctx.me().farmId!;
    const rows = Object.values(ctx.db.threadMeta)
      .filter((t) => t.farmId === f)
      .map((t) => {
        const m = list(ctx.db, t).at(-1);
        return {
          threadId: t.threadId,
          consumerId: t.consumerId,
          consumerName: `${ctx.db.users[t.consumerId]?.name.slice(0, 1) ?? "고"}○○`,
          lastMessage: m?.body ?? "대화를 시작해 보세요",
          lastAt: m?.createdAt ?? "",
          unreadCount: unread(ctx.db, t, true),
          needsReply: needsReply(ctx.db, t),
          aiMode: t.aiMode,
        };
      })
      .filter((t) => ctx.query.needsReply !== "true" || t.needsReply)
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    return paginate(rows, ctx.query);
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
    return idempotent(ctx, `mode:${t.threadId}`, () => {
      if (ctx.body.version !== t.version)
        conflict("STALE_VERSION", "최신 대화 상태를 다시 불러와 주세요.");
      if (ctx.body.mode !== "AUTO" && ctx.body.mode !== "HUMAN")
        invalid({ mode: "응대 모드를 골라 주세요" });
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
  approved(ctx, t.farmId);
  if (
    u.role === "CONSUMER" &&
    !following(ctx.db, t.farmId, u.userId) &&
    !inquiries(ctx.db, t).length
  )
    notFound();
}
