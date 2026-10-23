// 엔드포인트 함수. 경로·요청·응답은 docs/spec/screens.md 7.2 표를 따른다.
import { appName, newIdempotencyKey, readStore, request, setToken, writeStore } from "./client";
import type * as A from "./types";

/* ---------------- accounts (/api/auth) ---------------- */

/** 가입 대기 저장 키와 수명. 서버 가입 토큰(30분)보다 조금 짧게 둔다 */
const SIGNUP_KEY = "kakao-signup";
const SIGNUP_TTL_MS = 25 * 60 * 1000;

export const auth = {
  testAccounts: () =>
    request<A.TestAccount[]>("GET", "/api/auth/test-accounts", {
      query: { app: appName() },
    }),
  async testLogin(userId: string) {
    const res = await request<A.LoginResult>("POST", "/api/auth/test-login", {
      body: { userId, app: appName() },
    });
    setToken(res.accessToken);
    return res;
  },
  /** 카카오 로그인 사용 여부(ADR 0003) */
  kakaoConfig: () => request<A.KakaoConfig>("GET", "/api/auth/kakao/config"),
  /**
   * 카카오 인가 코드로 로그인. redirectUri는 인가 요청에 쓴 값과 같아야 한다.
   * 새 사용자는 계정 없이 가입 토큰만 온다(DEV-132). 토큰을 잠깐 저장하고, 약관 동의 화면이 kakaoSignup으로 가입한다
   */
  async kakaoLogin(code: string, redirectUri: string) {
    const res = await request<A.KakaoLoginResult>("POST", "/api/auth/kakao", {
      body: { code, redirectUri, app: appName() },
    });
    if (res.signup) {
      setToken(null);
      const pending: A.PendingSignup = { ...res.signup, expiresAt: Date.now() + SIGNUP_TTL_MS };
      writeStore(SIGNUP_KEY, JSON.stringify(pending));
    } else {
      writeStore(SIGNUP_KEY, null);
      setToken(res.accessToken);
    }
    return res;
  },
  /** 약관 동의 전 가입 대기(DEV-132). 없거나 만료면 null */
  pendingSignup(): A.PendingSignup | null {
    try {
      const raw = readStore(SIGNUP_KEY);
      const p = raw ? (JSON.parse(raw) as A.PendingSignup) : null;
      if (p && p.expiresAt > Date.now() && p.signupToken) return p;
    } catch {
      /* 깨진 값은 버린다 */
    }
    writeStore(SIGNUP_KEY, null);
    return null;
  },
  clearPendingSignup: () => writeStore(SIGNUP_KEY, null),
  /** 필수 약관 동의와 함께 카카오 계정을 만들고 로그인한다(DEV-132, AC-01-19) */
  async kakaoSignup(consents: A.ConsentInput[]) {
    const pending = auth.pendingSignup();
    if (!pending) throw new Error("가입 요청이 만료됐어요. 카카오 로그인부터 다시 해 주세요.");
    const res = await request<A.LoginResult>("POST", "/api/auth/kakao/signup", {
      body: { signupToken: pending.signupToken, consents },
    });
    writeStore(SIGNUP_KEY, null);
    setToken(res.accessToken);
    return res;
  },
  logout: () => setToken(null),
  me: () => request<A.User>("GET", "/api/auth/me"),
  /** 온보딩 1장·프로필 수정(닉네임·이름·휴대폰) */
  updateMe: (input: A.MeUpdateInput) =>
    request<A.User>("PATCH", "/api/auth/me", { body: input }),
  consents: () => request<A.Consent[]>("GET", "/api/auth/me/consents"),
  /** 가입 동의 기록(항목·버전·시각) */
  saveConsents: (consents: A.ConsentInput[]) =>
    request<A.Consent[]>("POST", "/api/auth/me/consents", {
      body: { consents },
    }),
  apply: (input: A.ProducerApplicationInput) =>
    request<A.ProducerApplication>("POST", "/api/auth/producer-application", {
      body: input,
    }),
  application: () =>
    request<A.ProducerApplication>("GET", "/api/auth/producer-application"),
  addresses: () => request<A.Address[]>("GET", "/api/auth/me/addresses"),
  addAddress: (input: A.AddressInput) =>
    request<A.Address>("POST", "/api/auth/me/addresses", { body: input }),
  updateAddress: (addressId: string, patch: Partial<A.AddressInput>) =>
    request<A.Address>("PATCH", `/api/auth/me/addresses/${addressId}`, {
      body: patch,
    }),
  deleteAddress: (addressId: string) =>
    request<null>("DELETE", `/api/auth/me/addresses/${addressId}`),
};

/* ---------------- farms (/api/home, /api/farms) ---------------- */

export const farms = {
  detailDraft: (input: A.DetailDraftInput) =>
    request<A.DetailDraft>("POST", "/api/farms/me/detail-draft", {
      body: input,
    }),
  home: () => request<A.Home>("GET", "/api/home"),
  list: (q: { q?: string } & A.PageQuery = {}) =>
    request<A.Paged<A.FarmCard>>("GET", "/api/farms", { query: q }),
  get: (farmId: string) => request<A.FarmDetail>("GET", `/api/farms/${farmId}`),
  follow: (farmId: string) =>
    request<A.FollowState>("PUT", `/api/farms/${farmId}/follow`),
  unfollow: (farmId: string) =>
    request<A.FollowState>("DELETE", `/api/farms/${farmId}/follow`),
  following: (q: A.PageQuery = {}) =>
    request<A.Paged<A.FarmSummary>>("GET", "/api/farms/following", {
      query: q,
    }),
  mine: () => request<A.MyFarm>("GET", "/api/farms/me"),
  updateMine: (
    patch: Partial<{
      name: string;
      region: string;
      intro: string;
      detailContent: A.DetailContent;
      photo: string | null;
      bankName: string;
      accountNumber: string;
      accountHolder: string;
    }>,
  ) => request<A.MyFarm>("PATCH", "/api/farms/me", { body: patch }),
};

/* ---------------- catalog (/api/products) ---------------- */

export const catalog = {
  detailDraft: (productId: string, input: A.DetailDraftInput) =>
    request<A.DetailDraft>(
      "POST",
      `/api/products/mine/${productId}/detail-draft`,
      { body: input },
    ),
  product: (productId: string) =>
    request<A.ProductDetail>("GET", `/api/products/${productId}`),
  mine: (q: { status?: A.ProductStatus } & A.PageQuery = {}) =>
    request<A.Paged<A.MyProductCard>>("GET", "/api/products/mine", {
      query: q,
    }),
  myProduct: (productId: string) =>
    request<A.MyProduct>("GET", `/api/products/mine/${productId}`),
  createDraft: (inputText: string) =>
    request<A.Draft>("POST", "/api/products/drafts", { body: { inputText } }),
  create: (draftId?: string) =>
    request<A.MyProduct>("POST", "/api/products", {
      body: { draftId: draftId ?? null },
    }),
  update: (
    productId: string,
    patch: A.ProductPatch,
    idempotencyKey: string = newIdempotencyKey(),
  ) =>
    request<A.MyProduct>("PATCH", `/api/products/${productId}`, {
      body: patch,
      idempotencyKey,
    }),
  stagePresets: () =>
    request<A.StagePreset[]>("GET", "/api/products/stage-presets"),
  putStages: (
    productId: string,
    stages: A.StageInput[],
    version: number,
    idempotencyKey: string = newIdempotencyKey(),
  ) =>
    request<{
      version: number;
      stages: A.Stage[];
    }>("PUT", `/api/products/${productId}/stages`, {
      body: { stages, version },
      idempotencyKey,
    }),
  salesSettings: (
    productId: string,
    input: A.SalesInput,
    idempotencyKey: string = newIdempotencyKey(),
  ) =>
    request<A.SalesState>("PUT", `/api/products/${productId}/sales-settings`, {
      body: input,
      idempotencyKey,
    }),
  capacityRequests: (id: string, q: A.PageQuery = {}) =>
    request<A.Paged<A.CapacityRequest>>(
      "GET",
      `/api/products/${id}/capacity-requests`,
      { query: q },
    ),
  requestCapacity: (
    id: string,
    requestedTotalGrams: number,
    version: number,
    idempotencyKey: string = newIdempotencyKey(),
  ) =>
    request<A.CapacityRequest>(
      "POST",
      `/api/products/${id}/capacity-requests`,
      { body: { requestedTotalGrams, version }, idempotencyKey },
    ),
  withdrawCapacity: (
    id: string,
    requestId: string,
    version: number,
    idempotencyKey: string = newIdempotencyKey(),
  ) =>
    request<A.CapacityRequest>(
      "POST",
      `/api/products/${id}/capacity-requests/${requestId}/withdraw`,
      { body: { version }, idempotencyKey },
    ),
};

/* ---------------- orders (/api/orders) ---------------- */

export const orders = {
  /** 멱등 키를 넘기지 않으면 새로 만든다. 재시도 때는 같은 키를 넘긴다. */
  create: (input: A.OrderInput, idempotencyKey: string = newIdempotencyKey()) =>
    request<A.Order>("POST", "/api/orders", { body: input, idempotencyKey }),
  /** 입금 안내(DEV-68): 물량을 선점하고 입금 대기로. 재시도 때는 같은 키를 넘긴다. */
  deposit: (orderId: string, idempotencyKey: string = newIdempotencyKey()) =>
    request<A.Order>("POST", `/api/orders/${orderId}/deposit`, {
      body: {},
      idempotencyKey,
    }),
  /** 소비자 '입금했어요' 신호. 상태는 바뀌지 않는다 */
  depositReported: (orderId: string) =>
    request<A.Order>("POST", `/api/orders/${orderId}/deposit-reported`),
  /** 생산자 입금 확인 → 예약 완료 */
  confirmDeposit: (orderId: string) =>
    request<A.ProducerOrder>("POST", `/api/orders/${orderId}/confirm-deposit`),
  /** 생산자 입금 미승인. 사유 필수, cancel이면 주문 취소(아니면 입금 대기 유지) */
  rejectDeposit: (orderId: string, reason: string, cancel = false) =>
    request<A.ProducerOrder>(
      "POST",
      `/api/orders/${orderId}/reject-deposit`,
      { body: { reason, cancel } },
    ),
  /** 생산자 환불 미승인: 아직 송금하지 못한 사유(필수) */
  refundIssue: (orderId: string, reason: string) =>
    request<A.ProducerOrder>("POST", `/api/orders/${orderId}/refund-issue`, {
      body: { reason },
    }),
  /** 생산자가 입금했던 계좌로 환불 송금을 마쳤다고 표시 */
  refundSettled: (orderId: string) =>
    request<A.ProducerOrder>("POST", `/api/orders/${orderId}/refund-settled`),
  list: (q: A.PageQuery = {}) =>
    request<A.Paged<A.Order>>("GET", "/api/orders", { query: q }),
  get: (orderId: string) => request<A.Order>("GET", `/api/orders/${orderId}`),
  cancel: (orderId: string) =>
    request<A.Order>("POST", `/api/orders/${orderId}/cancel`),
  confirm: (orderId: string) =>
    request<A.Order>("POST", `/api/orders/${orderId}/confirm`),
  respondDeliveryWindow: (orderId: string, choice: "accept" | "refund") =>
    request<A.Order>(
      "POST",
      `/api/orders/${orderId}/delivery-window-response`,
      { body: { choice } },
    ),
  dashboard: () =>
    request<A.Dashboard>("GET", "/api/orders/producer/dashboard"),
  producerOrders: (
    q: { status?: A.OrderStatus; productId?: string } & A.PageQuery = {},
  ) =>
    request<A.Paged<A.ProducerOrder>>("GET", "/api/orders/producer", {
      query: q,
    }),
  harvestStart: (productId: string) =>
    request<{ changed: number }>("POST", "/api/orders/producer/harvest-start", {
      body: { productId },
    }),
  ship: (
    orderId: string,
    trackingNumber?: string,
    carrier?: A.Carrier | null,
  ) =>
    request<A.ProducerOrder>("POST", `/api/orders/${orderId}/ship`, {
      body: {
        trackingNumber: trackingNumber || null,
        carrier: carrier ?? null,
      },
    }),
};

/* ---------------- messaging (/api/messaging) ---------------- */

export const messaging = {
  rooms: (q: A.PageQuery = {}) =>
    request<A.Paged<A.NewsRoomSummary>>("GET", "/api/messaging/rooms", {
      query: q,
    }),
  roomMessages: (farmId: string, q: A.PageQuery = {}) =>
    request<A.NewsRoomPage>("GET", `/api/messaging/rooms/${farmId}/messages`, {
      query: q,
    }),
  sendRoom: (farmId: string, text: string, idempotencyKey: string) =>
    request<A.NewsRoomMessage>(
      "POST",
      `/api/messaging/rooms/${farmId}/messages`,
      { body: { text }, idempotencyKey },
    ),
  news: (q: A.PageQuery = {}) =>
    request<A.Paged<A.NewsItem>>("GET", "/api/messaging/news", { query: q }),
  farmNews: (farmId: string, q: A.PageQuery = {}) =>
    request<A.Paged<A.NewsItem>>("GET", `/api/messaging/farms/${farmId}/news`, {
      query: q,
    }),
  react: (broadcastId: string) =>
    request<A.ReactionState>(
      "PUT",
      `/api/messaging/news/${broadcastId}/reaction`,
    ),
  unreact: (broadcastId: string) =>
    request<A.ReactionState>(
      "DELETE",
      `/api/messaging/news/${broadcastId}/reaction`,
    ),
  postNews: (
    input: A.NewsInput,
    idempotencyKey: string = newIdempotencyKey(),
  ) =>
    request<{ broadcastId: string; createdAt: string; recipientCount: number }>(
      "POST",
      "/api/messaging/news",
      { body: input, idempotencyKey },
    ),
  chats: (q: A.PageQuery = {}) =>
    request<A.Paged<A.ChatSummary>>("GET", "/api/messaging/chats", {
      query: q,
    }),
  startChat: (farmId: string, idempotencyKey: string = newIdempotencyKey()) =>
    request<A.StartChatResult>("POST", "/api/messaging/chats", {
      body: { farmId },
      idempotencyKey,
    }),
  messages: (farmId: string, q: A.PageQuery = {}) =>
    request<A.ChatPage>("GET", `/api/messaging/chats/${farmId}/messages`, {
      query: q,
    }),
  reportAiAnswer: (
    farmId: string,
    messageId: string,
    idempotencyKey: string = newIdempotencyKey(),
  ) =>
    request<A.Escalation>(
      "POST",
      `/api/messaging/chats/${farmId}/messages/${messageId}/report`,
      { idempotencyKey },
    ),
  send: (
    farmId: string,
    text: string,
    attachmentIds: string[] = [],
    orderId?: string,
    idempotencyKey: string = newIdempotencyKey(),
    productId?: string,
  ) =>
    request<A.SendMessageResult>(
      "POST",
      `/api/messaging/chats/${farmId}/messages`,
      { body: { text, attachmentIds, orderId, productId }, idempotencyKey },
    ),
  read: (farmId: string, lastReadMessageId: string) =>
    request("PUT", `/api/messaging/chats/${farmId}/read`, {
      body: { lastReadMessageId },
    }),
  producerChats: (q: { needsReply?: boolean } & A.PageQuery = {}) =>
    request<A.Paged<A.ProducerChatSummary>>(
      "GET",
      "/api/messaging/producer/chats",
      { query: q },
    ),
  producerStart: (consumerId: string, roomReplyId?: string) =>
    request<A.Thread>("POST", "/api/messaging/producer/chats", {
      body: { consumerId, roomReplyId },
      idempotencyKey: newIdempotencyKey(),
    }),
  producerMessages: (consumerId: string, q: A.PageQuery = {}) =>
    request<A.ChatPage>(
      "GET",
      `/api/messaging/producer/chats/${consumerId}/messages`,
      { query: q },
    ),
  producerSend: (
    consumerId: string,
    text: string,
    attachmentIds: string[] = [],
    answerToEscalationIds: string[] = [],
    idempotencyKey: string = newIdempotencyKey(),
  ) =>
    request<{ message: A.ChatMessage; thread: A.Thread }>(
      "POST",
      `/api/messaging/producer/chats/${consumerId}/messages`,
      { body: { text, attachmentIds, answerToEscalationIds }, idempotencyKey },
    ),
  producerRead: (consumerId: string, lastReadMessageId: string) =>
    request("PUT", `/api/messaging/producer/chats/${consumerId}/read`, {
      body: { lastReadMessageId },
    }),
  aiMode: (consumerId: string, mode: A.Thread["aiMode"], version: number) =>
    request<A.Thread>(
      "PUT",
      `/api/messaging/producer/chats/${consumerId}/ai-mode`,
      { body: { mode, version }, idempotencyKey: newIdempotencyKey() },
    ),
  aiSettings: () => request<A.AiSettings>("GET", "/api/farms/me/ai-settings"),
  saveAiSettings: (input: A.AiSettings, key: string = newIdempotencyKey()) =>
    request<A.AiSettings>("PUT", "/api/farms/me/ai-settings", {
      body: input,
      idempotencyKey: key,
    }),
  previewAi: (question: string, settings?: A.AiSettings) =>
    request<A.AiPreview>("POST", "/api/farms/me/ai-settings/preview", {
      body: { question, settings },
    }),
  inquiries: (orderId: string) =>
    request<A.Paged<A.Inquiry>>("GET", `/api/orders/${orderId}/inquiries`),
  createInquiry: (
    orderId: string,
    type: A.Inquiry["type"],
    text: string,
    attachmentIds: string[],
    key: string = newIdempotencyKey(),
  ) =>
    request<{ inquiry: A.Inquiry; message: A.ChatMessage; threadId: string }>(
      "POST",
      `/api/orders/${orderId}/inquiries`,
      { body: { type, text, attachmentIds }, idempotencyKey: key },
    ),
  inquiryStatus: (
    inquiryId: string,
    status: A.Inquiry["status"],
    version: number,
  ) =>
    request<A.Inquiry>(
      "PUT",
      `/api/messaging/producer/inquiries/${inquiryId}/status`,
      { body: { status, version }, idempotencyKey: newIdempotencyKey() },
    ),
  questions: (q: { status?: "OPEN" | "ANSWERED" } & A.PageQuery = {}) =>
    request<A.Paged<A.Escalation>>("GET", "/api/messaging/questions", {
      query: q,
    }),
  answer: (escalationId: string, text: string) =>
    request<A.Escalation>(
      "POST",
      `/api/messaging/questions/${escalationId}/answer`,
      { body: { text } },
    ),
};

/* ---------------- admin (/admin) — 개발용 버튼에서만 ---------------- */

export const admin = {
  approveProducer: (farmId: string) =>
    request<{ farmId: string; status: A.FarmStatus }>(
      "POST",
      `/admin/producers/${farmId}/approve`,
    ),
};
