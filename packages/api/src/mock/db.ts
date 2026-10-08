// Mock 상태 저장소. 앱별 localStorage(키: farmclub-<앱>:mock-db)에 저장한다.
// 시드 값은 docs/spec/tech-design/README.md "시드 데이터 (I1 데모)" 표를 따른다.
import { readStore, writeStore } from "../client";
import type {
  AiSettings,
  CapacityRequest,
  Thread,
  Inquiry,
  Attachment,
  Address,
  Carrier,
  ChatMessage,
  Draft,
  FarmStatus,
  OrderStatus,
  ProductOption,
  ProductStatus,
  Recipient,
  Role,
  Stage,
  NewsRoomMessage,
} from "../types";

/** 데모 기준일. D-day·단계 계산에 쓴다(배포 뒤에도 예시 값이 그대로 보이게). */
export let TODAY = "2026-10-07";
/** Only the Mock uses the fixture clock; contract tests may inject another Seoul calendar date. */
export function configureMockClock(today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("Invalid Mock date");
  TODAY = today;
}

export type UserRec = {
  userId: string;
  name: string;
  role: Role;
  farmId: string | null;
};
export type FarmRec = {
  farmId: string;
  ownerId: string;
  name: string;
  region: string;
  intro: string;
  detailContent?: import("../types").DetailContent;
  photo: string | null;
  followerCount: number;
  status: Exclude<FarmStatus, "NONE">;
  mainItems: string;
  phone: string;
  rejectReason: string | null;
  suspendReason: string | null;
  submittedAt: string;
  decidedAt: string | null;
};
export type ProductRec = {
  productId: string;
  farmId: string;
  name: string;
  variety: string;
  description: string;
  detailContent?: import("../types").DetailContent;
  photos: string[];
  grade: string | null;
  expectedBrix: number | null;
  measuredBrix: number | null;
  measuredBrixAt: string | null;
  brixRecordCount: number;
  farmerNote: string;
  options: ProductOption[];
  stages: Stage[];
  approvedSupplyGrams: number;
  salesLimitGrams: number;
  salesPaused: boolean;
  version: number;
  shippingFeeType: "FREE" | "SEPARATE";
  shippingFee: number;
  remoteAreaFee: number;
  maxQuantityPerOrder: number;
  deliveryWindow: { start: string; end: string } | null;
  maxDelayUntil: string | null;
  info: {
    origin: string;
    producer: string;
    size: string;
    packedAt: string;
    storage: string;
    contact: string;
  };
  status: ProductStatus;
  rejectReason: string | null;
  reservedCount: number;
  updatedAt: string;
};
export type NewsRec = {
  broadcastId: string;
  farmId: string;
  createdAt: string;
  body: string;
  photos: string[];
  visibility: "PUBLIC" | "FOLLOWERS";
  baseReactions: number;
};
export type OrderRec = Recipient & {
  unitWeightGrams: number;
  releasedQuantity: number;
  orderId: string;
  orderNo: string;
  consumerId: string;
  buyerName: string;
  productId: string;
  optionId: string;
  stageId: string;
  quantity: number;
  unitPrice: number;
  shippingFee: number;
  remoteAreaFee: number;
  status: OrderStatus;
  deliveryWindow: { start: string; end: string };
  proposedDeliveryWindow: { start: string; end: string } | null;
  deliveryNote: string | null;
  carrier: Carrier | null;
  trackingNumber: string | null;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  refundedAt: string | null;
  refundReason: string | null;
};
export type EscalationRec = {
  escalationId: string;
  farmId: string;
  consumerId: string;
  consumerName: string;
  context: string | null;
  question: string;
  reason: string;
  createdAt: string;
  status: "OPEN" | "ANSWERED";
  answer: string | null;
};

export type DB = {
  capacityRequests: CapacityRequest[];
  version: number;
  seq: number;
  users: Record<string, UserRec>;
  tokens: Record<string, string>;
  farms: Record<string, FarmRec>;
  follows: { userId: string; farmId: string }[];
  products: Record<string, ProductRec>;
  news: NewsRec[];
  roomReplies: NewsRoomMessage[];
  reactions: { broadcastId: string; userId: string }[];
  /** key = `${farmId}:${consumerId}` */
  threads: Record<string, ChatMessage[]>;
  unread: Record<string, number>;
  escalations: EscalationRec[];
  orders: Record<string, OrderRec>;
  addresses: Record<string, Address[]>;
  drafts: Record<string, Draft>;
  threadMeta: Record<string, Thread>;
  aiSettings: Record<string, AiSettings>;
  aiHistory: { farmId: string; settings: AiSettings; createdAt: string }[];
  inquiries: Inquiry[];
  attachments: Record<
    string,
    Attachment & {
      ownerId: string;
      orderId?: string;
      threadId?: string;
      bound: boolean;
      createdAt: string;
      dataUrl: string;
    }
  >;
  idempotency: Record<
    string,
    { fingerprint: string; status: number; body: unknown }
  >;
};

const DB_VERSION = 7;
let cache: DB | null = null;
let persistence = {
  read: () => readStore("mock-db"),
  write: (value: string) => writeStore("mock-db", value),
};
/** Inject disk persistence for the local shared Mock server. */
export function configureMockStorage(storage: typeof persistence) {
  persistence = storage;
  cache = null;
}

export function db(): DB {
  if (cache) return cache;
  const raw = persistence.read();
  if (raw) {
    const parsed = JSON.parse(raw) as DB;
    if (parsed.version !== DB_VERSION)
      throw new Error(
        "Mock schema changed: back up and explicitly migrate/reset local data before starting.",
      );
    cache = parsed;
    return cache;
  }
  cache = seed();
  save();
  return cache;
}
export function save() {
  if (cache) persistence.write(JSON.stringify(cache));
}
export function reset() {
  cache = seed();
  save();
}
export function nextId(prefix: string) {
  const d = db();
  d.seq += 1;
  return `${prefix}-${d.seq}`;
}
export const nowIso = () => new Date().toISOString();

/* ---------------- seed ---------------- */

const P = (f: string) => `/photos/${f}`;
const at = (date: string, time = "10:00") =>
  new Date(`${date}T${time}:00+09:00`).toISOString();
const msg = (
  id: string,
  senderType: ChatMessage["senderType"],
  body: string,
  createdAt: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  messageId: id,
  senderType,
  body,
  photos: [],
  createdAt,
  sourceSummary: null,
  handoffStatus: null,
  masked: false,
  ...extra,
});

const OPT5: ProductOption = {
  optionId: "opt-5",
  label: "5kg",
  weightKg: 5,
  note: "약 35~45과",
};
const OPT10: ProductOption = {
  optionId: "opt-10",
  label: "10kg",
  weightKg: 10,
  note: "약 70~90과",
};

function stage(
  seq: number,
  name: string,
  startsAt: string,
  endsAt: string,
  options: Stage["options"],
): Stage {
  return {
    stageId: `st-${seq}-${startsAt}`,
    seq,
    name,
    startsAt,
    endsAt,
    options,
  };
}

const KANG_INFO = {
  origin: "제주 서귀포",
  producer: "강씨네 귤밭 강○○",
  size: "5kg(약 35~45과) / 10kg",
  packedAt: "출하 당일",
  storage: "서늘하고 통풍되는 곳",
  contact: "farmclub 고객센터",
};

function product(
  p: Partial<ProductRec> & Pick<ProductRec, "productId" | "farmId" | "name">,
): ProductRec {
  return {
    variety: "",
    description: "",
    photos: [],
    grade: null,
    expectedBrix: null,
    measuredBrix: null,
    measuredBrixAt: null,
    brixRecordCount: 0,
    farmerNote: "",
    options: [OPT5],
    stages: [],
    approvedSupplyGrams: 0,
    salesLimitGrams: 0,
    salesPaused: false,
    version: 1,
    shippingFeeType: "FREE",
    shippingFee: 0,
    remoteAreaFee: 3000,
    maxQuantityPerOrder: 3,
    deliveryWindow: null,
    maxDelayUntil: null,
    info: KANG_INFO,
    status: "DRAFT",
    rejectReason: null,
    reservedCount: 0,
    updatedAt: at("2026-10-06"),
    ...p,
  };
}

const BUYERS = [
  "최지우",
  "정하늘",
  "윤서연",
  "장민호",
  "임수아",
  "한도윤",
  "오지민",
  "서예린",
  "신우진",
  "권나연",
  "황보람",
  "안태민",
  "송하은",
  "류지환",
  "전소율",
];
const CITIES = [
  "서울 송파구 올림픽로 300",
  "경기 성남시 분당구 판교역로 166",
  "인천 연수구 송도과학로 32",
  "대구 수성구 동대구로 100",
  "광주 서구 상무중앙로 61",
  "울산 남구 삼산로 200",
];

export function seed(): DB {
  const d: DB = {
    version: DB_VERSION,
    capacityRequests: [],
    threadMeta: {},
    aiSettings: {},
    aiHistory: [],
    inquiries: [],
    attachments: {},
    roomReplies: [],
    seq: 1000,
    users: {
      "u-minji": {
        userId: "u-minji",
        name: "김민지",
        role: "CONSUMER",
        farmId: null,
      },
      "u-seojun": {
        userId: "u-seojun",
        name: "이서준",
        role: "CONSUMER",
        farmId: null,
      },
      "u-kang": {
        userId: "u-kang",
        name: "강영수",
        role: "PRODUCER",
        farmId: "f-kang",
      },
      "u-misook": {
        userId: "u-misook",
        name: "오미숙",
        role: "PRODUCER",
        farmId: "f-wimi",
      },
      "u-soonja": {
        userId: "u-soonja",
        name: "박순자",
        role: "PRODUCER",
        farmId: "f-reject",
      },
      "u-taeho": {
        userId: "u-taeho",
        name: "최태호",
        role: "PRODUCER",
        farmId: "f-stop",
      },
      "u-new": {
        userId: "u-new",
        name: "신규 생산자",
        role: "PRODUCER",
        farmId: null,
      },
    },
    tokens: {},
    farms: {
      "f-kang": {
        farmId: "f-kang",
        ownerId: "u-kang",
        name: "강씨네 귤밭",
        region: "제주 서귀포",
        photo: P("farmer.jpg"),
        followerCount: 128,
        status: "APPROVED",
        intro:
          "3대째 효돈 하우스 감귤. 밭 소식은 일주일에 두 번, 당도는 잴 때마다 올려요.",
        mainItems: "하우스 감귤, 레드향",
        phone: "010-2222-3333",
        rejectReason: null,
        suspendReason: null,
        submittedAt: at("2026-09-01"),
        decidedAt: at("2026-09-03"),
      },
      "f-halla": {
        farmId: "f-halla",
        ownerId: "u-halla",
        name: "한라네 과수원",
        region: "제주 제주시",
        photo: P("harvest-hand.jpg"),
        followerCount: 86,
        status: "APPROVED",
        intro: "노지에서 햇볕 듬뿍 받고 자란 귤을 보내요.",
        mainItems: "노지 감귤",
        phone: "010-4444-5555",
        rejectReason: null,
        suspendReason: null,
        submittedAt: at("2026-09-02"),
        decidedAt: at("2026-09-04"),
      },
      "f-hyodon": {
        farmId: "f-hyodon",
        ownerId: "u-hyodon",
        name: "효돈 하우스농원",
        region: "제주 서귀포",
        photo: P("greenhouse-aisle.jpg"),
        followerCount: 41,
        status: "APPROVED",
        intro: "작은 하우스에서 한 그루씩 돌봐요.",
        mainItems: "하우스 감귤",
        phone: "010-6666-7777",
        rejectReason: null,
        suspendReason: null,
        submittedAt: at("2026-09-05"),
        decidedAt: at("2026-09-07"),
      },
      "f-namwon": {
        farmId: "f-namwon",
        ownerId: "u-namwon",
        name: "남원 귤빛농원",
        region: "제주 남원",
        photo: P("branch.jpg"),
        followerCount: 19,
        status: "APPROVED",
        intro: "11월에 첫 상품을 올릴 예정이에요.",
        mainItems: "노지 감귤",
        phone: "010-8888-9999",
        rejectReason: null,
        suspendReason: null,
        submittedAt: at("2026-09-10"),
        decidedAt: at("2026-09-12"),
      },
      "f-wimi": {
        farmId: "f-wimi",
        ownerId: "u-misook",
        name: "위미 감귤농장",
        region: "제주 서귀포시 남원읍",
        photo: null,
        followerCount: 0,
        status: "PENDING",
        intro: "",
        mainItems: "노지 감귤, 레드향",
        phone: "010-4321-8765",
        rejectReason: null,
        suspendReason: null,
        submittedAt: at("2026-10-07"),
        decidedAt: null,
      },
      "f-reject": {
        farmId: "f-reject",
        ownerId: "u-soonja",
        name: "하례 귤밭",
        region: "제주 서귀포",
        photo: null,
        followerCount: 0,
        status: "REJECTED",
        intro: "",
        mainItems: "노지 감귤",
        phone: "010-1111-0000",
        rejectReason:
          "적어 주신 번호로 세 번 연락했지만 닿지 않았어요. 받을 수 있는 번호로 다시 신청해 주세요.",
        suspendReason: null,
        submittedAt: at("2026-10-05"),
        decidedAt: at("2026-10-09"),
      },
      "f-stop": {
        farmId: "f-stop",
        ownerId: "u-taeho",
        name: "신례 감귤원",
        region: "제주 서귀포",
        photo: null,
        followerCount: 12,
        status: "SUSPENDED",
        intro: "",
        mainItems: "하우스 감귤",
        phone: "010-2020-3030",
        rejectReason: null,
        suspendReason: "메시지에 연락처를 적어 직거래를 유도했어요 (10월 9일)",
        submittedAt: at("2026-09-01"),
        decidedAt: at("2026-09-02"),
      },
    },
    follows: [
      { userId: "u-minji", farmId: "f-kang" },
      { userId: "u-minji", farmId: "f-halla" },
      { userId: "u-minji", farmId: "f-hyodon" },
    ],
    products: {
      "p-house": product({
        productId: "p-house",
        farmId: "f-kang",
        name: "하우스 감귤 5kg / 10kg",
        variety: "궁천조생",
        photos: [P("basket.jpg"), P("greenhouse.jpg")],
        grade: "특",
        expectedBrix: 12,
        measuredBrix: 11.8,
        measuredBrixAt: at("2026-10-05", "09:40"),
        brixRecordCount: 5,
        status: "PUBLISHED",
        reservedCount: 37,
        description:
          "효돈 하우스에서 물을 아껴 키운 감귤이에요. 10월 말부터 당도 측정값을 소식으로 올리고, 수확이 시작되면 실측 당도를 표시해요. 원물 그대로 선별해 보내드려요.",
        farmerNote:
          "물을 아껴 키워서 단맛이 꽉 찹니다. 수확하는 날 원물 그대로 선별해 보내드려요.",
        options: [OPT5, OPT10],
        stages: [
          stage(1, "1단계", "2026-10-01", "2026-10-12", {
            "opt-5": { price: 29000, quantity: 80, reservedCount: 38 },
            "opt-10": { price: 55000, quantity: 20, reservedCount: 6 },
          }),
          stage(2, "2단계", "2026-10-13", "2026-11-05", {
            "opt-5": { price: 33000, quantity: 60, reservedCount: 0 },
            "opt-10": { price: 62000, quantity: 25, reservedCount: 0 },
          }),
          stage(3, "3단계", "2026-11-06", "2026-11-09", {
            "opt-5": { price: 36000, quantity: 40, reservedCount: 0 },
            "opt-10": { price: 68000, quantity: 15, reservedCount: 0 },
          }),
        ],
        deliveryWindow: { start: "2026-11-10", end: "2026-11-20" },
        maxDelayUntil: "2026-11-30",
      }),
      "p-redhyang": product({
        productId: "p-redhyang",
        farmId: "f-kang",
        name: "레드향 3kg",
        variety: "레드향",
        photos: [P("tangerine-box.jpg")],
        grade: "상",
        expectedBrix: 13,
        brixRecordCount: 2,
        status: "PUBLISHED",
        reservedCount: 60,
        description: "두툼한 껍질 속 진한 레드향이에요.",
        farmerNote: "올해 레드향은 알이 굵어요.",
        options: [{ optionId: "opt-3", label: "3kg", weightKg: 3 }],
        stages: [
          stage(1, "1단계", "2026-10-01", "2026-10-31", {
            "opt-3": { price: 32000, quantity: 60, reservedCount: 60 },
          }),
          stage(2, "2단계", "2026-11-01", "2026-11-30", {
            "opt-3": { price: 36000, quantity: 40, reservedCount: 0 },
          }),
        ],
        deliveryWindow: { start: "2026-12-20", end: "2026-12-30" },
        maxDelayUntil: "2027-01-10",
      }),
      "p-cheonhye": product({
        productId: "p-cheonhye",
        farmId: "f-kang",
        name: "천혜향 3kg",
        variety: "천혜향",
        photos: [P("tangerine-sky.jpg")],
        status: "REJECTED",
        rejectReason: "받는 시기가 비어 있어요",
        options: [{ optionId: "opt-3", label: "3kg", weightKg: 3 }],
      }),
      "p-cheonggyeon": product({
        productId: "p-cheonggyeon",
        farmId: "f-kang",
        name: "청견 5kg",
        variety: "청견",
        photos: [P("branch.jpg")],
        status: "PENDING_APPROVAL",
        deliveryWindow: { start: "2027-01-10", end: "2027-01-20" },
        maxDelayUntil: "2027-01-31",
        updatedAt: at("2026-10-06"),
        stages: [
          stage(1, "1단계", "2026-10-15", "2026-11-15", {
            "opt-5": { price: 27000, quantity: 50, reservedCount: 0 },
          }),
        ],
      }),
      "p-hallabong": product({
        productId: "p-hallabong",
        farmId: "f-kang",
        name: "한라봉 5kg",
        variety: "한라봉",
        photos: [P("basket-floor.jpg")],
        status: "DRAFT",
        description: "꼭지가 볼록한 한라봉이에요.",
      }),
      "p-josaeng": product({
        productId: "p-josaeng",
        farmId: "f-kang",
        name: "조생 감귤 5kg",
        variety: "조생",
        photos: [P("orchard-crate.jpg")],
        status: "CLOSED",
        reservedCount: 52,
        stages: [
          stage(1, "1단계", "2026-08-20", "2026-09-30", {
            "opt-5": { price: 21000, quantity: 60, reservedCount: 52 },
          }),
        ],
        deliveryWindow: { start: "2026-09-25", end: "2026-10-05" },
        maxDelayUntil: "2026-10-15",
      }),
      "p-noji": product({
        productId: "p-noji",
        farmId: "f-halla",
        name: "노지 감귤 10kg",
        variety: "온주밀감",
        photos: [P("tangerine-sky.jpg")],
        grade: "상",
        expectedBrix: 11,
        brixRecordCount: 1,
        status: "PUBLISHED",
        reservedCount: 12,
        description: "노지에서 자란 새콤달콤한 귤이에요.",
        farmerNote: "아침 이슬 마르면 바로 땁니다.",
        options: [OPT10],
        stages: [
          stage(1, "1단계", "2026-10-01", "2026-10-25", {
            "opt-10": { price: 24000, quantity: 40, reservedCount: 12 },
          }),
          stage(2, "2단계", "2026-10-26", "2026-11-20", {
            "opt-10": { price: 27000, quantity: 40, reservedCount: 0 },
          }),
        ],
        deliveryWindow: { start: "2026-12-01", end: "2026-12-15" },
        maxDelayUntil: "2026-12-31",
        info: {
          ...KANG_INFO,
          origin: "제주 제주시",
          producer: "한라네 과수원 한○○",
          size: "10kg(약 70~90과)",
        },
      }),
      "p-hyodon": product({
        productId: "p-hyodon",
        farmId: "f-hyodon",
        name: "하우스 감귤 3kg",
        variety: "궁천조생",
        photos: [P("greenhouse-aisle.jpg")],
        grade: "특",
        expectedBrix: 12,
        brixRecordCount: 3,
        status: "PUBLISHED",
        reservedCount: 7,
        description: "작은 하우스에서 한 그루씩 돌본 감귤이에요.",
        farmerNote: "작지만 달아요.",
        options: [{ optionId: "opt-3", label: "3kg", weightKg: 3 }],
        stages: [
          stage(1, "1단계", "2026-10-01", "2026-10-16", {
            "opt-3": { price: 19000, quantity: 30, reservedCount: 7 },
          }),
          stage(2, "2단계", "2026-10-17", "2026-11-10", {
            "opt-3": { price: 22000, quantity: 30, reservedCount: 0 },
          }),
        ],
        deliveryWindow: { start: "2026-11-15", end: "2026-11-25" },
        maxDelayUntil: "2026-12-05",
        info: {
          ...KANG_INFO,
          producer: "효돈 하우스농원 고○○",
          size: "3kg(약 20~25과)",
        },
      }),
    },
    news: [
      {
        broadcastId: "n-1",
        farmId: "f-kang",
        createdAt: at("2026-10-07", "08:30"),
        body: "첫 바구니 따봤어요. 아직 신맛이 조금 남아서 일주일 더 기다립니다.",
        photos: [P("basket.jpg")],
        visibility: "FOLLOWERS",
        baseReactions: 42,
      },
      {
        broadcastId: "n-2",
        farmId: "f-kang",
        createdAt: at("2026-10-05", "09:40"),
        body: "하우스 안 온도가 잘 유지돼서 실측 11.8Brix 나왔어요. 10일 전후로 첫 수확 시작합니다.",
        photos: [P("greenhouse.jpg")],
        visibility: "PUBLIC",
        baseReactions: 127,
      },
      {
        broadcastId: "n-3",
        farmId: "f-halla",
        createdAt: at("2026-10-04", "18:10"),
        body: "태풍 지나가고 밭 둘러봤는데 낙과가 거의 없어요. 걱정해 주셔서 감사합니다.",
        photos: [],
        visibility: "PUBLIC",
        baseReactions: 54,
      },
      {
        broadcastId: "n-4",
        farmId: "f-hyodon",
        createdAt: at("2026-10-02", "11:00"),
        body: "하우스 통로 정리 끝. 이제 한 그루씩 열매 솎기 들어가요.",
        photos: [P("greenhouse-aisle.jpg")],
        visibility: "PUBLIC",
        baseReactions: 23,
      },
    ],
    reactions: [{ broadcastId: "n-2", userId: "u-minji" }],
    threads: {
      "f-kang:u-minji": [
        msg(
          "m-1",
          "CONSUMER",
          "지금 당도 얼마예요? 10kg도 같은 귤인가요?",
          at("2026-10-06", "15:12"),
        ),
        msg(
          "m-2",
          "AI",
          "10월 5일 실측 당도는 11.8Brix예요. 5kg과 10kg은 같은 하우스 감귤이고, 10kg은 55,000원이에요.",
          at("2026-10-06", "15:12"),
          { sourceSummary: "10월 5일 소식 · 상품 정보" },
        ),
        msg(
          "m-3",
          "CONSUMER",
          "12일 이후에 받을 수 있게 맞춰주실 수 있나요?",
          at("2026-10-06", "15:15"),
        ),
        msg(
          "m-4",
          "AI",
          "농가에 전달했어요. 농가가 답하면 여기서 볼 수 있어요.",
          at("2026-10-06", "15:15"),
          { handoffStatus: "FORWARDED" },
        ),
        msg(
          "m-5",
          "PRODUCER",
          "네, 12일 이후 출하로 맞춰드릴게요. 급하면 ●●●-●●●●-●●●●로 연락 주세요.",
          at("2026-10-07", "08:05"),
          { masked: true },
        ),
      ],
      "f-halla:u-minji": [
        msg(
          "m-6",
          "CONSUMER",
          "10kg은 몇 개쯤 들어있어요?",
          at("2026-10-06", "20:01"),
        ),
        msg("m-7", "AI", "10kg은 약 70~90과예요.", at("2026-10-06", "20:01"), {
          sourceSummary: "상품 정보",
        }),
      ],
      "f-hyodon:u-minji": [
        msg(
          "m-8",
          "CONSUMER",
          "택배사는 어디로 보내세요?",
          at("2026-10-02", "13:20"),
        ),
      ],
      "f-kang:u-seojun": [
        msg(
          "m-9",
          "CONSUMER",
          "농약은 언제 마지막으로 치셨어요?",
          at("2026-10-06", "10:02"),
        ),
        msg(
          "m-10",
          "AI",
          "농가에 전달했어요. 농가가 답하면 여기서 볼 수 있어요.",
          at("2026-10-06", "10:02"),
          { handoffStatus: "FORWARDED" },
        ),
      ],
      "f-kang:u-buyer-park": [
        msg(
          "m-11",
          "CONSUMER",
          "10박스 사면 좀 깎아주실 수 있나요?",
          at("2026-10-05", "16:40"),
        ),
        msg(
          "m-12",
          "AI",
          "농가에 전달했어요. 농가가 답하면 여기서 볼 수 있어요.",
          at("2026-10-05", "16:40"),
          { handoffStatus: "FORWARDED" },
        ),
      ],
    },
    unread: { "f-kang:u-minji": 1, "f-halla:u-minji": 1 },
    escalations: [
      {
        escalationId: "e-1",
        farmId: "f-kang",
        consumerId: "u-minji",
        consumerName: "김○○",
        context: "하우스 감귤 5kg 예약",
        question: "12일 이후에 받을 수 있게 맞춰주실 수 있나요?",
        reason: "배송 날짜 약속은 농가만 할 수 있어요",
        createdAt: at("2026-10-06", "15:15"),
        status: "OPEN",
        answer: null,
      },
      {
        escalationId: "e-2",
        farmId: "f-kang",
        consumerId: "u-seojun",
        consumerName: "이○○",
        context: null,
        question: "농약은 언제 마지막으로 치셨어요?",
        reason: "재배 방식은 농가가 직접 답해야 해요",
        createdAt: at("2026-10-06", "10:02"),
        status: "OPEN",
        answer: null,
      },
      {
        escalationId: "e-3",
        farmId: "f-kang",
        consumerId: "u-buyer-park",
        consumerName: "박○○",
        context: null,
        question: "10박스 사면 좀 깎아주실 수 있나요?",
        reason: "가격 흥정은 AI가 답하지 않아요",
        createdAt: at("2026-10-05", "16:40"),
        status: "OPEN",
        answer: null,
      },
    ],
    orders: {},
    addresses: {
      "u-minji": [
        {
          addressId: "a-1",
          recipientName: "김민지",
          recipientPhone: "010-2345-6789",
          postalCode: "04001",
          address: "서울 마포구 월드컵북로 12",
          addressDetail: "302호",
          isDefault: true,
        },
        {
          addressId: "a-2",
          recipientName: "김민지",
          recipientPhone: "010-2345-6789",
          postalCode: "04524",
          address: "서울 중구 세종대로 110",
          addressDetail: "7층",
          label: "회사",
          isDefault: false,
        },
      ],
    },
    drafts: {},
    idempotency: {},
  };

  // 소비자 김민지 주문 4건
  const house = d.products["p-house"];
  const mk = (
    o: Partial<OrderRec> &
      Pick<
        OrderRec,
        | "orderId"
        | "orderNo"
        | "consumerId"
        | "buyerName"
        | "productId"
        | "optionId"
        | "quantity"
        | "unitPrice"
        | "status"
        | "createdAt"
      >,
  ): OrderRec => ({
    unitWeightGrams: 0,
    releasedQuantity: 0,
    stageId: d.products[o.productId].stages[0]?.stageId ?? "",
    shippingFee: 0,
    remoteAreaFee: 0,
    recipientName: o.buyerName,
    recipientPhone: "010-2345-6789",
    postalCode: "04001",
    address: "서울 마포구 월드컵북로 12",
    addressDetail: "302호",
    deliveryWindow: d.products[o.productId].deliveryWindow ?? {
      start: TODAY,
      end: TODAY,
    },
    proposedDeliveryWindow: null,
    deliveryNote: null,
    carrier: null,
    trackingNumber: null,
    paidAt: o.createdAt,
    shippedAt: null,
    deliveredAt: null,
    refundedAt: null,
    refundReason: null,
    ...o,
  });
  const list: OrderRec[] = [
    mk({
      orderId: "o-42",
      orderNo: "FC-1007-0042",
      consumerId: "u-minji",
      buyerName: "김민지",
      productId: "p-house",
      optionId: "opt-5",
      quantity: 2,
      unitPrice: 29000,
      status: "RESERVED",
      createdAt: at("2026-10-07", "09:12"),
      deliveryNote: "문 앞에 두고 벨 눌러 주세요",
    }),
    mk({
      orderId: "o-11",
      orderNo: "FC-0921-0011",
      consumerId: "u-minji",
      buyerName: "김민지",
      productId: "p-noji",
      optionId: "opt-10",
      quantity: 1,
      unitPrice: 24000,
      status: "RESERVED",
      createdAt: at("2026-09-21"),
      proposedDeliveryWindow: { start: "2026-12-08", end: "2026-12-22" },
    }),
    mk({
      orderId: "o-07",
      orderNo: "FC-0918-0007",
      consumerId: "u-minji",
      buyerName: "김민지",
      productId: "p-josaeng",
      optionId: "opt-5",
      quantity: 1,
      unitPrice: 21000,
      status: "DELIVERED",
      createdAt: at("2026-09-18"),
      shippedAt: at("2026-10-02"),
      deliveredAt: at("2026-10-04"),
      carrier: "CJ",
      trackingNumber: "6012-3456-7001",
    }),
    mk({
      orderId: "o-03",
      orderNo: "FC-0915-0003",
      consumerId: "u-minji",
      buyerName: "김민지",
      productId: "p-redhyang",
      optionId: "opt-3",
      quantity: 1,
      unitPrice: 32000,
      status: "REFUNDED",
      createdAt: at("2026-09-15"),
      refundedAt: at("2026-09-28"),
      refundReason: "직접 취소(출하 전)",
    }),
    mk({
      orderId: "o-40",
      orderNo: "FC-1006-0040",
      consumerId: "u-buyer-choi",
      buyerName: "최유진",
      productId: "p-house",
      optionId: "opt-5",
      quantity: 2,
      unitPrice: 29000,
      status: "PREPARING",
      createdAt: at("2026-10-06", "18:20"),
      postalCode: "06236",
      address: "서울 강남구 테헤란로 152",
      addressDetail: "15층",
      recipientPhone: "010-6789-2345",
    }),
    mk({
      orderId: "o-38",
      orderNo: "FC-1006-0038",
      consumerId: "u-seojun",
      buyerName: "이서준",
      productId: "p-house",
      optionId: "opt-10",
      quantity: 1,
      unitPrice: 55000,
      status: "PREPARING",
      createdAt: at("2026-10-06", "14:05"),
      postalCode: "48094",
      address: "부산 해운대구 해운대로 570",
      addressDetail: "1203호",
      recipientPhone: "010-3456-7890",
    }),
    mk({
      orderId: "o-35",
      orderNo: "FC-1006-0035",
      consumerId: "u-buyer-park",
      buyerName: "박지윤",
      productId: "p-house",
      optionId: "opt-5",
      quantity: 1,
      unitPrice: 29000,
      status: "PREPARING",
      createdAt: at("2026-10-06", "10:30"),
      postalCode: "34141",
      address: "대전 유성구 대학로 99",
      addressDetail: "",
      recipientPhone: "010-5678-1234",
    }),
  ];
  // 하우스 감귤 주문 40건 = 시드 표: 예약 완료 30 · 출하 준비 7 · 출하 3, 5kg 34건 38박스 · 10kg 6건 6박스, 소비자 37명.
  // 출하 준비 목록은 10월 6일까지 들어온 주문만이다.
  type G = {
    id: string;
    consumerId: string;
    name: string;
    opt: "opt-5" | "opt-10";
    qty: number;
    status: OrderStatus;
    date: string;
    carrier?: Carrier;
  };
  const g: G[] = [
    {
      id: "o-g0",
      consumerId: "u-g0",
      name: "최지우",
      opt: "opt-5",
      qty: 2,
      status: "PREPARING",
      date: "2026-10-05",
    },
    {
      id: "o-g1",
      consumerId: "u-g1",
      name: "정하늘",
      opt: "opt-10",
      qty: 1,
      status: "PREPARING",
      date: "2026-10-05",
    },
    {
      id: "o-g2",
      consumerId: "u-g2",
      name: "윤서연",
      opt: "opt-5",
      qty: 1,
      status: "PREPARING",
      date: "2026-10-04",
    },
    {
      id: "o-g3",
      consumerId: "u-g3",
      name: "장민호",
      opt: "opt-5",
      qty: 1,
      status: "PREPARING",
      date: "2026-10-03",
    },
    {
      id: "o-g4",
      consumerId: "u-g4",
      name: "임수아",
      opt: "opt-5",
      qty: 1,
      status: "SHIPPED",
      date: "2026-10-01",
      carrier: "CJ",
    },
    {
      id: "o-g5",
      consumerId: "u-g5",
      name: "한도윤",
      opt: "opt-10",
      qty: 1,
      status: "SHIPPED",
      date: "2026-10-01",
      carrier: "EPOST",
    },
    {
      id: "o-g6",
      consumerId: "u-g6",
      name: "오지민",
      opt: "opt-5",
      qty: 1,
      status: "SHIPPED",
      date: "2026-10-02",
      carrier: "HANJIN",
    },
  ];
  BUYERS.slice(7).forEach((name, k) => {
    const i = k + 7;
    g.push({
      id: `o-g${i}`,
      consumerId: `u-g${i}`,
      name,
      opt: i % 2 === 1 && i < 12 ? "opt-10" : "opt-5",
      qty: i === 8 ? 2 : 1,
      status: "RESERVED",
      date: `2026-10-0${2 + (k % 5)}`,
    });
  });
  for (let i = 0; i < 21; i += 1) {
    // 마지막 3건은 이미 주문한 소비자의 두 번째 주문(40건, 37명)
    const repeat = i >= 18 ? g[7 + (i - 18) * 2] : null;
    g.push({
      id: `o-r${i}`,
      consumerId: repeat ? repeat.consumerId : `u-r${i}`,
      name: repeat ? repeat.name : `예약자${i + 1}`,
      opt: "opt-5",
      qty: 1,
      status: "RESERVED",
      date: `2026-10-0${1 + (i % 7)}`,
    });
  }
  // 주문 번호는 날짜순으로 1번부터. 35·38·40·42는 예시 주문이 쓴다.
  g.sort((x, y) =>
    x.date === y.date ? x.id.localeCompare(y.id) : x.date.localeCompare(y.date),
  );
  let n = 0;
  g.forEach((o, k) => {
    do n += 1;
    while ([35, 38, 40, 42].includes(n));
    const mmdd = o.date.slice(5).replace("-", "");
    const shipped = o.status === "SHIPPED";
    list.push(
      mk({
        orderId: o.id,
        orderNo: `FC-${mmdd}-${String(n).padStart(4, "0")}`,
        consumerId: o.consumerId,
        buyerName: o.name,
        productId: "p-house",
        optionId: o.opt,
        quantity: o.qty,
        unitPrice: o.opt === "opt-10" ? 55000 : 29000,
        status: o.status,
        createdAt: at(
          o.date,
          `${String(9 + (k % 10)).padStart(2, "0")}:${String((k * 7) % 60).padStart(2, "0")}`,
        ),
        postalCode: "06000",
        address: CITIES[k % CITIES.length],
        addressDetail: `${100 + k}호`,
        recipientName: o.name,
        recipientPhone: `010-${1000 + k * 37}-${2000 + k * 53}`,
        carrier: shipped ? (o.carrier ?? "CJ") : null,
        trackingNumber: shipped ? `6012-3456-${7100 + k}` : null,
        shippedAt: shipped ? at("2026-10-06", "17:00") : null,
      }),
    );
  });
  list.forEach((o) => {
    o.deliveryWindow =
      o.productId === "p-house"
        ? (house.deliveryWindow as { start: string; end: string })
        : o.deliveryWindow;
    d.orders[o.orderId] = o;
  });
  // Explicit demo capacity allocation; not a conversion rule for real farm approvals.
  const capacity: Record<string, number> = {
    "p-house": 2400000,
    "p-redhyang": 300000,
    "p-josaeng": 300000,
    "p-noji": 800000,
    "p-hyodon": 180000,
  };
  for (const p of Object.values(d.products)) {
    if (p.status === "PUBLISHED" || p.status === "CLOSED") {
      p.approvedSupplyGrams = capacity[p.productId];
      p.salesLimitGrams = p.approvedSupplyGrams;
    }
    if (p.status === "PENDING_APPROVAL")
      d.capacityRequests.push({
        requestId: `capacity-${p.productId}`,
        productId: p.productId,
        kind: "INITIAL",
        requestedTotalGrams: 250000,
        status: "PENDING",
        reason: null,
        createdAt: at(TODAY),
        decidedAt: null,
        version: 1,
      });
  }
  for (const o of Object.values(d.orders)) {
    const option = d.products[o.productId]?.options.find(
      (x) => x.optionId === o.optionId,
    );
    if (!option) throw new Error("Seed order has no weight option");
    o.unitWeightGrams = Math.round(option.weightKg * 1000);
    o.releasedQuantity =
      o.status === "REFUNDED" && !o.shippedAt ? o.quantity : 0;
  }
  for (const p of Object.values(d.products)) {
    const orders = Object.values(d.orders).filter(
      (o) =>
        o.productId === p.productId &&
        o.paidAt &&
        o.quantity > o.releasedQuantity,
    );
    p.reservedCount = new Set(orders.map((o) => o.consumerId)).size;
    for (const stage of p.stages)
      for (const [id, allocation] of Object.entries(stage.options))
        allocation.reservedCount = orders
          .filter((o) => o.stageId === stage.stageId && o.optionId === id)
          .reduce((n, o) => n + o.quantity - o.releasedQuantity, 0);
  }
  // Deliberately unallocated current period shows the period-sold-out demo state.
  d.products["p-redhyang"].stages[0].options["opt-3"].quantity = 0;
  for (const farmId of Object.keys(d.farms))
    d.aiSettings[farmId] = {
      enabled: true,
      version: 1,
      smallOrderPolicy: "",
      reservationShippingPolicy: "",
      faqs: [],
      handoffTopics: [],
    };
  for (const [k, messages] of Object.entries(d.threads)) {
    const [farmId, consumerId] = k.split(":");
    d.threadMeta[k] = {
      threadId: `thread-${k}`,
      farmId,
      consumerId,
      aiMode: messages.some((m) => m.senderType === "PRODUCER")
        ? "HUMAN"
        : "AUTO",
      version: 1,
      consumerLastReadMessageId: null,
      producerLastReadMessageId: null,
    };
  }
  return d;
}
