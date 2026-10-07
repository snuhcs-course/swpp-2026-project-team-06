// 엔드포인트 함수. 경로·요청·응답은 docs/spec/screens.md 7.2 표를 따른다.
import { appName, newIdempotencyKey, request, setToken } from "./client";
import type * as A from "./types";

/* ---------------- accounts (/api/auth) ---------------- */

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
  logout: () => setToken(null),
  me: () => request<A.User>("GET", "/api/auth/me"),
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
      photo: string | null;
    }>,
  ) => request<A.MyFarm>("PATCH", "/api/farms/me", { body: patch }),
};

/* ---------------- catalog (/api/products) ---------------- */

export const catalog = {
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
  pay: (
    orderId: string,
    mockResult: "success" | "fail",
    idempotencyKey: string = newIdempotencyKey(),
  ) =>
    request<A.PayResult>("POST", `/api/orders/${orderId}/pay`, {
      body: { mockResult },
      idempotencyKey,
    }),
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
  send: (
    farmId: string,
    text: string,
    attachmentIds: string[] = [],
    orderId?: string,
    idempotencyKey: string = newIdempotencyKey(),
  ) =>
    request<A.SendMessageResult>(
      "POST",
      `/api/messaging/chats/${farmId}/messages`,
      { body: { text, attachmentIds, orderId }, idempotencyKey },
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
