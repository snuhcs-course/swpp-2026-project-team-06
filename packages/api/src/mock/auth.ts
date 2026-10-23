// /api/auth Mock (FEAT-01, FEAT-08 배송지)
import type {
  Address,
  App,
  Consent,
  ConsentKind,
  ProducerApplication,
  TestAccount,
  User,
} from "../types";
import { CONSENT_VERSION, consentRequired, needsOnboarding, nextId, nowIso, type DB, type UserRec } from "./db";
import { conflict, fail, invalid, notFound, register } from "./router";

const PHONE = /^01[016789]-?\d{3,4}-?\d{4}$/;
/** 저장 배송지는 계정당 50개까지(서버 ADDRESS_LIMIT과 같다) */
export const ADDRESS_LIMIT = 50;
const CONSENT_KINDS: ConsentKind[] = ["TERMS", "PRIVACY", "AGE14", "MARKETING"];
/** Mock 카카오 로그인이 만드는 소비자 계정. 처음엔 온보딩이 남아 있다 */
export const MOCK_KAKAO_USER = "u-kakao";
/** Mock 카카오 로그인이 만드는 생산자 계정(DEV-74). 처음엔 농가가 없어 가입 신청으로 간다 */
export const MOCK_KAKAO_PRODUCER = "u-kakao-farm";
/** Mock 가입 토큰(DEV-132). 서버는 서명된 30분 토큰을 쓴다 */
const MOCK_SIGNUP_PREFIX = "mock-signup-";
const MOCK_KAKAO_EMAIL = { consumer: "kakao.user@example.com", producer: "kakao.farm@example.com" } as const;

/** 농가에 보이는 소비자 이름(R-15): 닉네임, 없으면 이름 앞 글자 + ○○ */
export function publicName(u: UserRec | undefined | null): string {
  if (!u) return "고○○";
  if (u.nickname) return u.nickname;
  return `${(u.name || "고").slice(0, 1)}○○`;
}

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
    isTestAccount: !u.kakao,
    farmId: f?.farmId ?? null,
    farmStatus: f?.status ?? "NONE",
    suspendReason: f?.suspendReason ?? null,
    nickname: u.nickname ?? null,
    email: u.email ?? null,
    phone: u.phone ?? "",
    needsOnboarding: needsOnboarding(u),
    consentRequired: consentRequired(u),
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

  // 카카오 로그인 Mock(ADR 0003, DEV-32·74·132): 리다이렉트 없이 로그인한다.
  // 소비자 앱은 카카오 계정 u-kakao, 생산자 앱은 농가 없는 u-kakao-farm. 처음이면 계정 없이 가입 토큰만 주고,
  // 필수 약관에 동의(POST /api/auth/kakao/signup)해야 계정이 생긴다(서버와 같은 규칙)
  "GET /api/auth/kakao/config": () => ({
    enabled: true,
    clientId: "mock",
    redirectPath: "/auth/kakao",
  }),

  "POST /api/auth/kakao": ({ db, body }) => {
    const app = appOf(body.app);
    if (!String(body.code ?? ""))
      invalid({ code: "인가 코드가 없어요" }, "카카오 로그인에 실패했어요.");
    const u = db.users[app === "consumer" ? MOCK_KAKAO_USER : MOCK_KAKAO_PRODUCER];
    if (!u)
      return {
        accessToken: null,
        user: null,
        signup: { signupToken: `${MOCK_SIGNUP_PREFIX}${app}`, email: MOCK_KAKAO_EMAIL[app] },
      };
    const token = `mock-${u.userId}-${Math.random().toString(36).slice(2, 10)}`;
    db.tokens[token] = u.userId;
    return { accessToken: token, user: userView(db, u) };
  },

  "POST /api/auth/kakao/signup": ({ db, body }) => {
    const b = body as { signupToken?: string; consents?: Partial<Consent>[] };
    const raw = String(b.signupToken ?? "");
    const app = raw.startsWith(MOCK_SIGNUP_PREFIX) ? raw.slice(MOCK_SIGNUP_PREFIX.length) : "";
    if (app !== "consumer" && app !== "producer")
      invalid({ signupToken: "가입 요청이 만료됐어요" }, "카카오 로그인부터 다시 해 주세요.");
    const required = app === "consumer" ? ["TERMS", "PRIVACY", "AGE14"] : ["TERMS", "PRIVACY"];
    const list = b.consents ?? [];
    const agreed = new Set(
      list
        .filter((c) => (c.agreed ?? true) && String(c.version ?? "").trim() === CONSENT_VERSION)
        .map((c) => c.kind),
    );
    if (required.some((k) => !agreed.has(k as ConsentKind)))
      invalid({ consents: "필수 약관에 모두 동의해 주세요" });
    const id = app === "consumer" ? MOCK_KAKAO_USER : MOCK_KAKAO_PRODUCER;
    const at = nowIso();
    if (!db.users[id])
      db.users[id] = {
        userId: id,
        // 소비자는 온보딩에서 이름을 받는다. 생산자는 가입 신청 전까지 자리 이름
        name: app === "consumer" ? "" : "카카오 사용자",
        role: app === "consumer" ? "CONSUMER" : "PRODUCER",
        farmId: null,
        kakao: true,
        email: MOCK_KAKAO_EMAIL[app],
        phone: "",
        consents: [],
      };
    const u = db.users[id];
    const rows = (u.consents ??= []);
    for (const c of list) {
      if (!c.kind || !CONSENT_KINDS.includes(c.kind)) continue;
      const next: Consent = { kind: c.kind, version: String(c.version), agreed: c.agreed ?? true, agreedAt: at };
      const row = rows.find((r) => r.kind === c.kind);
      if (row) Object.assign(row, next);
      else rows.push(next);
    }
    const token = `mock-${u.userId}-${Math.random().toString(36).slice(2, 10)}`;
    db.tokens[token] = u.userId;
    return { accessToken: token, user: userView(db, u) };
  },

  "GET /api/auth/me": (ctx) => userView(ctx.db, ctx.me()),

  "PATCH /api/auth/me": (ctx) => {
    const u = ctx.me();
    if (u.role !== "CONSUMER")
      fail(403, "FORBIDDEN", "이 앱의 계정이 아니에요. 다시 로그인해 주세요.", {
        reason: "WRONG_APP",
      });
    const b = ctx.body as { nickname?: string; name?: string; phone?: string };
    const fields: Record<string, string> = {};
    if (b.nickname !== undefined) {
      const n = b.nickname.trim().length;
      if (n < 2 || n > 12) fields.nickname = "닉네임은 2~12자로 적어 주세요";
    }
    if (b.name !== undefined) {
      const n = b.name.trim().length;
      if (n < 2 || n > 20) fields.name = "이름은 2~20자로 적어 주세요";
    }
    if (b.phone !== undefined && !PHONE.test(b.phone.trim()))
      fields.phone = "휴대폰 번호 형식으로 입력해 주세요";
    if (Object.keys(fields).length) invalid(fields);
    if (b.nickname !== undefined) u.nickname = b.nickname.trim();
    if (b.name !== undefined) u.name = b.name.trim();
    if (b.phone !== undefined) u.phone = b.phone.trim();
    return userView(ctx.db, u);
  },

  "GET /api/auth/me/consents": (ctx) => ctx.me().consents ?? [],

  "POST /api/auth/me/consents": (ctx) => {
    const u = ctx.me();
    const list = (ctx.body as { consents?: Partial<Consent>[] }).consents ?? [];
    if (!list.length || list.some((c) => !CONSENT_KINDS.includes(c.kind!) || !c.version))
      invalid({ consents: "동의 항목과 버전을 보내 주세요" });
    const rows = (u.consents ??= []);
    const at = nowIso();
    for (const c of list) {
      const row = rows.find((r) => r.kind === c.kind);
      const next: Consent = {
        kind: c.kind!,
        version: String(c.version),
        agreed: c.agreed ?? true,
        agreedAt: at,
      };
      if (row) Object.assign(row, next);
      else rows.push(next);
    }
    return [...rows].sort((a, b) => a.kind.localeCompare(b.kind));
  },

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
      bankName: existing?.bankName ?? null,
      accountNumber: existing?.accountNumber ?? null,
      accountHolder: existing?.accountHolder ?? null,
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
    if (list.length >= ADDRESS_LIMIT)
      conflict(
        "ADDRESS_LIMIT",
        `배송지는 ${ADDRESS_LIMIT}개까지 저장할 수 있어요. 안 쓰는 배송지를 지워 주세요.`,
        { limit: ADDRESS_LIMIT },
      );
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
    const merged = { ...a, ...b };
    const fields: Record<string, string> = {};
    if (!merged.recipientName?.trim())
      fields.recipientName = "받는 사람을 적어 주세요";
    if (!PHONE.test((merged.recipientPhone ?? "").trim()))
      fields.recipientPhone = "휴대폰 번호 형식으로 입력해 주세요";
    if (!merged.postalCode?.trim() || !merged.address?.trim())
      fields.address = "우편번호와 주소를 입력해 주세요";
    if (Object.keys(fields).length) invalid(fields);
    if (b.isDefault) list.forEach((x) => (x.isDefault = false));
    Object.assign(a, b, { isDefault: b.isDefault ? true : a.isDefault });
    return a;
  },

  "DELETE /api/auth/me/addresses/:addressId": (ctx) => {
    const uid = ctx.me().userId;
    const list = ctx.db.addresses[uid] ?? [];
    const target = list.find((x) => x.addressId === ctx.params.addressId);
    if (!target) notFound();
    ctx.db.addresses[uid] = list.filter((x) => x !== target);
    // 기본을 지우면 가장 최근에 저장한 배송지가 기본이 된다(서버와 같다)
    const rest = ctx.db.addresses[uid];
    if (target.isDefault && rest.length) rest[rest.length - 1].isDefault = true;
    return null;
  },
});
