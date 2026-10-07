// /api/auth Mock (FEAT-01, FEAT-08 배송지)
import type {
  Address,
  App,
  ProducerApplication,
  TestAccount,
  User,
} from "../types";
import { nextId, nowIso, type DB, type UserRec } from "./db";
import { fail, invalid, notFound, register } from "./router";

const PHONE = /^01[016789]-?\d{3,4}-?\d{4}$/;

const TEST_ACCOUNTS: Record<App, string[]> = {
  consumer: ["u-minji", "u-seojun"],
  producer: ["u-kang", "u-misook", "u-new", "u-soonja", "u-taeho"],
};
function appOf(v: unknown): App {
  if (v === "consumer" || v === "producer") return v;
  return fail(
    400,
    "VALIDATION_ERROR",
    "app을 consumer나 producer로 보내 주세요.",
    { fields: { app: "consumer·producer 중 하나" } },
  );
}

export function userView(d: DB, u: UserRec): User {
  const f = u.farmId ? d.farms[u.farmId] : null;
  return {
    userId: u.userId,
    name: u.name,
    role: u.role,
    isTestAccount: true,
    farmId: f?.farmId ?? null,
    farmStatus: f?.status ?? "NONE",
    suspendReason: f?.suspendReason ?? null,
  };
}

function application(d: DB, u: UserRec): ProducerApplication {
  const f = u.farmId ? d.farms[u.farmId] : null;
  if (!f) notFound("신청 내역이 없어요.");
  return {
    farmId: f.farmId,
    ownerName: u.name,
    farmName: f.name,
    region: f.region,
    mainItems: f.mainItems,
    phone: f.phone,
    status: f.status,
    rejectReason: f.rejectReason,
    submittedAt: f.submittedAt,
    decidedAt: f.decidedAt,
  };
}

register({
  // 앱별 시드 테스트 계정(ADR 0009·0010). 소비자 앱엔 소비자만, 생산자 앱엔 생산자만
  "GET /api/auth/test-accounts": ({ db, query }) =>
    TEST_ACCOUNTS[appOf(query.app)].map((id): TestAccount => {
      const u = db.users[id];
      const f = u.farmId ? db.farms[u.farmId] : null;
      return {
        userId: u.userId,
        name: u.name,
        role: u.role,
        farmStatus: f?.status ?? "NONE",
        farmName: f?.name ?? null,
      };
    }),

  "POST /api/auth/test-login": ({ db, body }) => {
    const u = db.users[String(body.userId ?? "")];
    if (
      !u ||
      ![...TEST_ACCOUNTS.consumer, ...TEST_ACCOUNTS.producer].includes(u.userId)
    )
      notFound("테스트 계정이 아니에요.");
    const app = appOf(body.app);
    if ((app === "consumer") !== (u.role === "CONSUMER"))
      fail(403, "FORBIDDEN", "이 앱의 계정이 아니에요.", {
        reason: "WRONG_APP",
      });
    const token = `mock-${u.userId}-${Math.random().toString(36).slice(2, 10)}`;
    db.tokens[token] = u.userId;
    return { accessToken: token, user: userView(db, u) };
  },

  "GET /api/auth/me": (ctx) => userView(ctx.db, ctx.me()),

  "POST /api/auth/producer-application": (ctx) => {
    const u = ctx.me();
    const b = ctx.body as Record<string, string>;
    const fields: Record<string, string> = {};
    if (!b.ownerName?.trim()) fields.ownerName = "대표자 이름을 적어 주세요";
    if (!b.farmName?.trim()) fields.farmName = "농가 이름을 적어 주세요";
    if (!b.region?.trim()) fields.region = "지역을 적어 주세요";
    if (!b.mainItems?.trim()) fields.mainItems = "주로 키우는 것을 적어 주세요";
    if (!PHONE.test((b.phone ?? "").trim()))
      fields.phone = "휴대폰 번호 형식으로 입력해 주세요";
    if (Object.keys(fields).length) invalid(fields);
    const existing = u.farmId ? ctx.db.farms[u.farmId] : null;
    if (existing && existing.status !== "REJECTED")
      fail(409, "CONFLICT", "이미 신청했어요.", {
        reason: "INVALID_TRANSITION",
      });
    const farmId = existing?.farmId ?? nextId("f");
    ctx.db.farms[farmId] = {
      farmId,
      ownerId: u.userId,
      name: b.farmName.trim(),
      region: b.region.trim(),
      intro: existing?.intro ?? "",
      photo: existing?.photo ?? null,
      followerCount: 0,
      status: "PENDING",
      mainItems: b.mainItems.trim(),
      phone: b.phone.trim(),
      rejectReason: null,
      suspendReason: null,
      submittedAt: nowIso(),
      decidedAt: null,
    };
    u.farmId = farmId;
    // 생산자 계정은 가입 신청 때 대표자 이름을 받는다(SCR-20). 역할은 바꾸지 않는다(ADR 0010)
    u.name = b.ownerName.trim();
    return application(ctx.db, u);
  },

  "GET /api/auth/producer-application": (ctx) => application(ctx.db, ctx.me()),

  "GET /api/auth/me/addresses": (ctx) =>
    ctx.db.addresses[ctx.me().userId] ?? [],

  "POST /api/auth/me/addresses": (ctx) => {
    const u = ctx.me();
    const b = ctx.body as Partial<Address>;
    const fields: Record<string, string> = {};
    if (!b.recipientName?.trim())
      fields.recipientName = "받는 사람을 적어 주세요";
    if (!PHONE.test((b.recipientPhone ?? "").trim()))
      fields.recipientPhone = "휴대폰 번호 형식으로 입력해 주세요";
    if (!b.postalCode?.trim() || !b.address?.trim())
      fields.address = "우편번호를 찾아 주소를 넣어 주세요";
    if (Object.keys(fields).length) invalid(fields);
    const list = (ctx.db.addresses[u.userId] ??= []);
    const isDefault = b.isDefault || list.length === 0;
    if (isDefault) list.forEach((a) => (a.isDefault = false));
    const a: Address = {
      addressId: nextId("a"),
      recipientName: b.recipientName!.trim(),
      recipientPhone: b.recipientPhone!.trim(),
      postalCode: b.postalCode!.trim(),
      address: b.address!.trim(),
      addressDetail: b.addressDetail?.trim() ?? "",
      label: b.label,
      isDefault: !!isDefault,
    };
    list.push(a);
    return a;
  },

  "PATCH /api/auth/me/addresses/:addressId": (ctx) => {
    const list = ctx.db.addresses[ctx.me().userId] ?? [];
    const a = list.find((x) => x.addressId === ctx.params.addressId);
    if (!a) notFound();
    const b = ctx.body as Partial<Address>;
    if (b.isDefault) list.forEach((x) => (x.isDefault = false));
    Object.assign(a, b);
    return a;
  },

  "DELETE /api/auth/me/addresses/:addressId": (ctx) => {
    const uid = ctx.me().userId;
    const list = ctx.db.addresses[uid] ?? [];
    const target = list.find((x) => x.addressId === ctx.params.addressId);
    if (!target) notFound();
    ctx.db.addresses[uid] = list.filter((x) => x !== target);
    if (target.isDefault && ctx.db.addresses[uid][0])
      ctx.db.addresses[uid][0].isDefault = true;
    return null;
  },
});
