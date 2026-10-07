// API 타입. 원본: docs/spec/screens.md 7장, 데이터 모델·주문 상태: docs/spec/tech-design/README.md.
// 디자인에서 더한 필드(reservedCount, brixRecordCount)는 docs/design/README.md "스펙과 다른 점" 2.

/** 날짜·시각은 ISO 8601 문자열(UTC 저장, 화면은 Asia/Seoul) */
export type ISODate = string;

export type Paged<T> = { items: T[]; nextCursor: string | null };
export type PageQuery = { cursor?: string | null; limit?: number };

/** 오류 응답 본문 {code, message, details} */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

export type ConflictReason =
  | "STAGE_CHANGED"
  | "SOLD_OUT"
  | "QUANTITY_LIMIT"
  | "INVALID_TRANSITION"
  | "IDEMPOTENCY_MISMATCH"
  | "SALES_PAUSED"
  | "TOTAL_LIMIT_REACHED"
  | "CAP_BELOW_COMMITTED"
  | "APPROVED_CAP_EXCEEDED"
  | "CAPACITY_REQUEST_PENDING"
  | "STALE_VERSION"
  | "PERIOD_LOCKED"
  | "NOT_RESUMABLE";
/** 403 FORBIDDEN의 details.reason. 다른 앱 계정의 토큰이면 WRONG_APP(ADR 0010) */
export type ForbiddenReason = "WRONG_APP";

export type ErrorBody = {
  code: ErrorCode;
  message: string;
  details: {
    fields?: Record<string, string>;
    reason?: ConflictReason | ForbiddenReason;
    [k: string]: unknown;
  };
};

/* ---------------- accounts ---------------- */

export type Role = "CONSUMER" | "PRODUCER" | "ADMIN";
export type FarmStatus =
  "NONE" | "PENDING" | "REJECTED" | "APPROVED" | "SUSPENDED";

export type TestAccount = {
  userId: string;
  name: string;
  role: Role;
  farmStatus: FarmStatus;
  farmName: string | null;
};

export type User = {
  userId: string;
  name: string;
  role: Role;
  isTestAccount: boolean;
  farmId: string | null;
  farmStatus: FarmStatus;
  /** 정지 사유(farmStatus=SUSPENDED) */
  suspendReason?: string | null;
};

export type LoginResult = { accessToken: string; user: User };

/** 앱 구분(ADR 0010). 테스트 로그인·계정 목록에 쓴다 */
export type App = "consumer" | "producer";
/** 택배사 코드(screens.md 7.1) */
export type Carrier = "CJ" | "EPOST" | "HANJIN" | "LOTTE" | "LOGEN" | "ETC";

export type ProducerApplicationInput = {
  ownerName: string;
  farmName: string;
  region: string;
  mainItems: string;
  phone: string;
};
export type ProducerApplication = ProducerApplicationInput & {
  farmId: string;
  status: Exclude<FarmStatus, "NONE">;
  rejectReason: string | null;
  submittedAt: ISODate;
  decidedAt: ISODate | null;
};

export type AddressInput = {
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  address: string;
  addressDetail?: string;
  label?: string;
  isDefault?: boolean;
};
export type Address = AddressInput & { addressId: string; isDefault: boolean };

/* ---------------- farms ---------------- */

export type FarmSummary = {
  farmId: string;
  name: string;
  region: string;
  photo: string | null;
  followerCount: number;
};

export type FarmCard = FarmSummary & {
  /** 대표 상품(지금 단계) */
  featured: {
    productId: string;
    name: string;
    currentPrice: number;
    dDay: number;
  } | null;
};

export type SalesState = {
  approvedSupplyGrams: number;
  salesLimitGrams: number;
  reservedGrams: number;
  shippedGrams: number;
  soldQuantity: number;
  remainingGrams: number;
  salesPaused: boolean;
  availability:
    | "PAUSED"
    | "ENDED"
    | "NOT_OPEN"
    | "TOTAL_SOLD_OUT"
    | "PERIOD_SOLD_OUT"
    | "AVAILABLE";
  version: number;
};
export type SalesInput = {
  salesLimitGrams: number;
  maxQuantityPerOrder: number;
  salesPaused: boolean;
  version: number;
};
export type ProductCard = SalesState & {
  productId: string;
  name: string;
  farmId: string;
  farmName: string;
  photo: string | null;
  currentPrice: number | null;
  nextPrice: number | null;
  stageEndsAt: ISODate | null;
  dDay: number | null;
  deliveryWindow: { start: ISODate; end: ISODate };
  soldOut: boolean;
  nextStageStartsAt: ISODate | null;
  /** n명 예약 (디자인 추가 필드) */
  reservedCount: number;
  expectedBrix: number | null;
};

export type NewsItem = {
  broadcastId: string;
  farmId: string;
  farmName: string;
  farmPhoto: string | null;
  createdAt: ISODate;
  body: string;
  photos: string[];
  visibility: "PUBLIC" | "FOLLOWERS";
  reactionCount: number;
  myReaction: boolean;
};

export type NewsRoomMessage = {
  messageId: string;
  farmId: string;
  senderId: string;
  senderName: string;
  senderRole: "CONSUMER" | "PRODUCER";
  body: string;
  photos: string[];
  videos: string[];
  createdAt: ISODate;
  broadcastId: string | null;
  reactionCount: number;
  myReaction: boolean;
};
export type NewsRoomSummary = {
  farmId: string;
  farmName: string;
  farmPhoto: string | null;
  lastMessage: string | null;
  lastAt: ISODate | null;
};
export type NewsRoomPage = Paged<NewsRoomMessage> & { room: NewsRoomSummary };

export type Home = {
  hero: {
    label: string;
    title: string;
    caption: string;
    photo: string;
    productId: string | null;
  };
  recommended: ProductCard[];
  /** 디자인: 소식 미리보기 대신 농가 둘러보기 */
  farms: FarmCard[];
};

export type FarmDetail = FarmSummary & {
  intro: string;
  isFollowing: boolean;
  products: ProductCard[];
  shareUrl: string;
};

export type MyFarm = FarmSummary & {
  intro: string;
  status: FarmStatus;
  shareUrl: string | null;
};

export type FollowState = { following: boolean; followerCount: number };

/* ---------------- catalog ---------------- */

export type ProductStatus =
  "DRAFT" | "PENDING_APPROVAL" | "REJECTED" | "PUBLISHED" | "CLOSED";

export type ProductOption = {
  optionId: string;
  label: string;
  weightKg: number;
  note?: string;
};

export type StageOptionValue = {
  price: number;
  quantity: number;
  reservedCount: number;
};

export type Stage = {
  stageId: string;
  seq: number;
  name: string;
  startsAt: ISODate;
  endsAt: ISODate;
  /** optionId → 가격·물량 */
  options: Record<string, StageOptionValue>;
};

export type ProductDetail = ProductCard & {
  variety: string;
  description: string;
  grade: string | null;
  measuredBrix: number | null;
  measuredBrixAt: ISODate | null;
  /** 당도 기록 n회 (디자인 추가 필드) */
  brixRecordCount: number;
  farmerNote: string;
  farmRegion: string;
  farmPhoto: string | null;
  options: ProductOption[];
  stages: Stage[];
  currentStageId: string | null;
  shippingFeeType: "FREE" | "SEPARATE";
  shippingFee: number;
  remoteAreaFee: number;
  maxQuantityPerOrder: number;
  maxDelayUntil: ISODate;
  info: {
    origin: string;
    producer: string;
    size: string;
    packedAt: string;
    storage: string;
    contact: string;
  };
  status: ProductStatus;
};

export type MyProductCard = SalesState & {
  productId: string;
  name: string;
  photo: string | null;
  status: ProductStatus;
  rejectReason: string | null;
  pendingCapacityRequest: CapacityRequest | null;
  reservedCount: number;
  currentStageLabel: string | null;
  updatedAt: ISODate;
};

export type MyProduct = Omit<
  ProductDetail,
  | "farmName"
  | "farmRegion"
  | "farmPhoto"
  | "soldOut"
  | "dDay"
  | "currentPrice"
  | "nextPrice"
  | "stageEndsAt"
  | "nextStageStartsAt"
  | "currentStageId"
  | "brixRecordCount"
  | "farmerNote"
  | "reservedCount"
  | "deliveryWindow"
  | "maxDelayUntil"
> & {
  deliveryWindow: { start: ISODate; end: ISODate } | null;
  maxDelayUntil: ISODate | null;
  rejectReason: string | null;
  pendingCapacityRequest: CapacityRequest | null;
  photos: string[];
  missingFields: string[];
  reservedCount: number;
};

export type ProductPatch = { version: number } & Partial<{
  name: string;
  variety: string;
  description: string;
  grade: string | null;
  expectedBrix: number | null;
  measuredBrix: number | null;
  options: ProductOption[];
  maxQuantityPerOrder: number;
  deliveryWindow: { start: ISODate; end: ISODate } | null;
  maxDelayUntil: ISODate | null;
  shippingFeeType: "FREE" | "SEPARATE";
  shippingFee: number;
  remoteAreaFee: number;
  photos: string[];
  info: Partial<ProductDetail["info"]>;
}>;

export type DraftFields = {
  name: string | null;
  variety: string | null;
  options: string[] | null;
  expectedBrix: number | null;
  grade: string | null;
  deliveryWindow: string | null;
  description: string | null;
};

export type Draft = {
  draftId: string;
  inputText: string;
  extracted: DraftFields;
  missingFields: (keyof DraftFields)[];
  /** AI 실패·시간 초과면 true, extracted는 비어 있다 */
  failed: boolean;
  /** 문구에 가격이 있었는지(AC-03-2: 채우지 않고 안내만) */
  priceMentioned: string | null;
};

export type StagePreset = {
  presetId: string;
  label: string;
  stageCount: number;
  stepPrice: number;
};

export type StageInput = {
  stageId?: string;
  name?: string;
  startsAt: ISODate;
  endsAt: ISODate;
  options: Record<string, { price: number; quantity: number }>;
};

/* ---------------- orders ---------------- */

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "RESERVED"
  | "PREPARING"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type Recipient = {
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  address: string;
  addressDetail?: string;
};

export type OrderInput = Recipient & {
  productId: string;
  optionId: string;
  quantity: number;
  deliveryNote?: string;
  consents: {
    deliveryWindow: boolean;
    delayRefund: boolean;
    shortage: boolean;
    cancelPolicy: boolean;
  };
  consentVersion: string;
  saveAddress?: boolean;
};

export type OrderAction = "cancel" | "confirm" | "respondDeliveryWindow";

export type Order = Recipient & {
  unitWeightGrams: number;
  releasedQuantity: number;
  orderId: string;
  orderNo: string;
  productId: string;
  productName: string;
  farmId: string;
  farmName: string;
  photo: string | null;
  optionId: string;
  optionLabel: string;
  quantity: number;
  unitPrice: number;
  shippingFee: number;
  remoteAreaFee: number;
  totalAmount: number;
  status: OrderStatus;
  deliveryWindow: { start: ISODate; end: ISODate };
  /** 받는 시기 변경 요청(응답 대기) */
  proposedDeliveryWindow: { start: ISODate; end: ISODate } | null;
  deliveryNote: string | null;
  carrier: Carrier | null;
  trackingNumber: string | null;
  createdAt: ISODate;
  paidAt: ISODate | null;
  shippedAt: ISODate | null;
  deliveredAt: ISODate | null;
  refundedAt: ISODate | null;
  refundReason: string | null;
  actions: OrderAction[];
};

export type PayResult = {
  order: Order;
  result: "success" | "fail";
  failReason: string | null;
};

export type Dashboard = {
  todo: { openQuestions: number; toShip: number; pendingProducts: number };
  /** 판매 중 대표 상품 요약(예약한 사람 수·주문 수) */
  product:
    | (SalesState & {
        productId: string;
        productName: string;
        reservedCount: number;
        orderCount: number;
      })
    | null;
  /** 단계마다 옵션별 예약 박스 / 물량(D-03) */
  stages: {
    stageName: string;
    current: boolean;
    endsAt: ISODate;
    options: {
      optionId: string;
      label: string;
      price: number;
      reserved: number;
      quantity: number;
    }[];
  }[];
  recentOrders: {
    orderId: string;
    buyerName: string;
    optionLabel: string;
    quantity: number;
    createdAt: ISODate;
    region: string;
    status: OrderStatus;
  }[];
};

export type ProducerOrder = Recipient & {
  orderId: string;
  orderNo: string;
  productId: string;
  productName: string;
  optionLabel: string;
  quantity: number;
  status: OrderStatus;
  deliveryNote: string | null;
  carrier: Carrier | null;
  trackingNumber: string | null;
  createdAt: ISODate;
};

export type HarvestProduct = {
  productId: string;
  name: string;
  photo: string | null;
  reservedOrders: number;
};

/* ---------------- messaging ---------------- */

export type NewsInput = {
  body: string;
  photos: string[];
  videos?: string[];
  visibility: "PUBLIC" | "FOLLOWERS";
};
export type ReactionState = { reactionCount: number; myReaction: boolean };

export type ChatSummary = {
  farmId: string;
  farmName: string;
  farmPhoto: string | null;
  lastMessage: string;
  lastSenderType: SenderType;
  lastAt: ISODate;
  unreadCount: number;
};

export type SenderType = "CONSUMER" | "PRODUCER" | "AI";

export type ChatMessage = {
  messageId: string;
  senderType: SenderType;
  body: string;
  photos: string[];
  createdAt: ISODate;
  attachmentIds?: string[];
  orderId?: string;
  inquiryId?: string;
  sourceRefs?: string[];
  settingsVersion?: number | null;
  needsHuman?: boolean;
  /** AI 근거 요약 */
  sourceSummary: string | null;
  handoffStatus: "FORWARDED" | null;
  /** 연락처 가림이 적용됐는지 */
  masked: boolean;
};

export type StartChatResult = { farmId: string; autoFollowed: boolean };
export type SendMessageResult = {
  message: ChatMessage;
  reply: ChatMessage | null;
};

export type Escalation = {
  escalationId: string;
  consumerId: string;
  /** 소비자 이름 앞 글자 + ○○ */
  consumerName: string;
  context: string | null;
  question: string;
  reason: string;
  createdAt: ISODate;
  status: "OPEN" | "ANSWERED";
  answer: string | null;
  /** 그 소비자와의 채팅 전체(AI 안내 포함). screens.md SCR-28 "전달된 질문과 그 채팅" */
  thread: ChatMessage[];
};

export type Thread = {
  threadId: string;
  farmId: string;
  consumerId: string;
  aiMode: "AUTO" | "HUMAN";
  version: number;
  consumerLastReadMessageId: string | null;
  producerLastReadMessageId: string | null;
};
export type ProducerChatSummary = {
  threadId: string;
  consumerId: string;
  consumerName: string;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
  needsReply: boolean;
  aiMode: Thread["aiMode"];
};
export type AiSettings = {
  enabled: boolean;
  version: number;
  smallOrderPolicy: string;
  reservationShippingPolicy: string;
  faqs: { id?: string; question: string; answer: string }[];
  handoffTopics: string[];
};
export type AiPreview = {
  action: "ANSWER" | "HANDOFF" | "DISABLED";
  answer: string | null;
  reason: string;
  sourceRefs: string[];
  settingsVersion: number | null;
};
export type Attachment = {
  attachmentId: string;
  mimeType: string;
  size: number;
};
export type Inquiry = {
  inquiryId: string;
  orderId: string;
  threadId: string;
  type: "DAMAGE" | "CONDITION" | "TASTE" | "OTHER";
  text: string;
  attachments: Attachment[];
  status: "OPEN" | "RESOLVED";
  version: number;
  createdAt: string;
  resolvedAt: string | null;
};
export type LinkedOrder = {
  orderId: string;
  productName: string;
  optionLabel: string;
  quantity: number;
  status: OrderStatus;
};
export type ChatPage = Paged<ChatMessage> & {
  thread: Thread;
  inquiries: Inquiry[];
  orders: LinkedOrder[];
  escalations?: Escalation[];
};

export type CapacityRequest = {
  requestId: string;
  productId: string;
  kind: "INITIAL" | "INCREASE";
  requestedTotalGrams: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  version: number;
};
