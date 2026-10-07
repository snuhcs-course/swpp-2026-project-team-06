// Mock 라우터: "METHOD /path/:param" 패턴으로 핸들러를 찾는다. 응답은 실제 서버처럼 {status, body}.
import type { ConflictReason, ErrorBody, ErrorCode } from "../types";
import { db, save, type DB, type UserRec } from "./db";

export type Ctx = {
  db: DB;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  user: UserRec | null;
  /** 로그인 필요. 없으면 401 */
  me(): UserRec;
};
export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;
export type Routes = Record<string, Handler>;

export class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
  ) {
    super(body.message);
  }
}

export function fail(
  status: number,
  code: ErrorCode,
  message: string,
  details: ErrorBody["details"] = {},
): never {
  throw new MockHttpError(status, { code, message, details });
}
export function notFound(message = "찾을 수 없어요."): never {
  return fail(404, "NOT_FOUND", message);
}
export function conflict(
  reason: ConflictReason,
  message: string,
  details: Record<string, unknown> = {},
): never {
  return fail(409, "CONFLICT", message, { reason, ...details });
}
export function invalid(
  fields: Record<string, string>,
  message = "입력값을 확인해 주세요.",
): never {
  return fail(400, "VALIDATION_ERROR", message, { fields });
}

const table: {
  method: string;
  parts: string[];
  handler: Handler;
  app: RouteApp;
}[] = [];

/** 경로가 어느 앱 계정용인가(screens.md 7.2 권한 열). any = 공개·로그인(두 계정 모두) */
type RouteApp = "consumer" | "producer" | "any";
const PRODUCER_ROUTES = [
  /^\/api\/auth\/producer-application$/,
  /^\/api\/farms\/me(\/|$)/,
  /^\/api\/products\/(mine|drafts|stage-presets)(\/|$)/,
  /^\/api\/orders\/producer(\/|$)/,
  /^\/api\/messaging\/producer(\/|$)/,
  /^\/api\/messaging\/questions(\/|$)/,
];
const CONSUMER_ROUTES = [
  /^\/api\/auth\/me\/addresses(\/|$)/,
  /^\/api\/farms\/following$/,
  /^\/api\/farms\/:farmId\/follow$/,
  /^\/api\/messaging\/chats(\/|$)/,
  /^\/api\/messaging\/news\/:broadcastId\/reaction$/,
];
function routeApp(method: string, path: string): RouteApp {
  if (PRODUCER_ROUTES.some((r) => r.test(path))) return "producer";
  if (method === "POST" && path === "/api/products") return "producer";
  if (
    (method === "PATCH" && path === "/api/products/:productId") ||
    /^\/api\/products\/:productId\/(stages|sales-settings)$/.test(path)
  )
    return "producer";
  if (method === "POST" && path === "/api/messaging/news") return "producer";
  if (path === "/api/orders/:orderId/ship") return "producer";
  if (CONSUMER_ROUTES.some((r) => r.test(path))) return "consumer";
  if (method === "GET" && path === "/api/messaging/news") return "consumer";
  if (
    path === "/api/orders" ||
    /^\/api\/orders\/:orderId(\/(pay|cancel|confirm|delivery-window-response))?$/.test(
      path,
    )
  )
    return "consumer";
  return "any";
}

export function register(routes: Routes) {
  for (const [key, handler] of Object.entries(routes)) {
    const [method, path] = key.split(" ");
    table.push({
      method,
      parts: path.split("/").filter(Boolean),
      handler,
      app: routeApp(method, path),
    });
  }
}

function match(method: string, path: string) {
  const parts = path.split("/").filter(Boolean);
  // 고정 경로를 경로 변수보다 먼저 (screens.md 7.1 경로 순서)
  const candidates = table.filter(
    (r) => r.method === method && r.parts.length === parts.length,
  );
  let best: {
    handler: Handler;
    params: Record<string, string>;
    score: number;
    app: RouteApp;
  } | null = null;
  for (const r of candidates) {
    const params: Record<string, string> = {};
    let score = 0;
    let ok = true;
    r.parts.forEach((p, i) => {
      if (!ok) return;
      if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(parts[i]);
      else if (p === parts[i]) score += 1;
      else ok = false;
    });
    if (ok && (!best || score > best.score))
      best = { handler: r.handler, params, score, app: r.app };
  }
  return best;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function dispatch(req: {
  method: string;
  path: string;
  body?: unknown;
  headers: Record<string, string>;
}) {
  const [pathname, qs = ""] = req.path.split("?");
  const query: Record<string, string> = {};
  qs.split("&")
    .filter(Boolean)
    .forEach((kv) => {
      const [k, v = ""] = kv.split("=");
      query[decodeURIComponent(k)] = decodeURIComponent(v);
    });
  await sleep(
    pathname === "/api/products/drafts" ? 1500 : 180 + Math.random() * 220,
  );
  const m = match(req.method, pathname);
  if (!m)
    return {
      status: 404,
      body: { code: "NOT_FOUND", message: "없는 주소예요.", details: {} },
    };
  const d = db();
  const token = (req.headers.Authorization ?? "").replace(/^Bearer /, "");
  const user =
    token && d.tokens[token] ? (d.users[d.tokens[token]] ?? null) : null;
  const ctx: Ctx = {
    db: d,
    params: m.params,
    query,
    body: (req.body ?? {}) as Record<string, unknown>,
    headers: req.headers,
    user,
    me() {
      if (!user) fail(401, "UNAUTHENTICATED", "로그인이 필요해요.");
      return user as UserRec;
    },
  };
  try {
    // 다른 앱 계정의 토큰이면 403 WRONG_APP (ADR 0010, screens.md 7.1)
    if (
      user &&
      m.app !== "any" &&
      (m.app === "consumer") !== (user.role === "CONSUMER")
    ) {
      fail(403, "FORBIDDEN", "이 앱의 계정이 아니에요. 다시 로그인해 주세요.", {
        reason: "WRONG_APP",
      });
    }
    if (m.app !== "any") ctx.me();
    if (
      m.app === "producer" &&
      !pathname.startsWith("/api/auth/") &&
      (!user?.farmId || d.farms[user.farmId]?.status !== "APPROVED")
    )
      fail(403, "FORBIDDEN", "승인된 농가만 사용할 수 있어요.");
    const body = await m.handler(ctx);
    save();
    return {
      status: body === null ? 204 : 200,
      body: body === undefined ? null : body,
    };
  } catch (e) {
    if (e instanceof MockHttpError) return { status: e.status, body: e.body };
    return {
      status: 500,
      body: {
        code: "INTERNAL_ERROR",
        message: "잠시 뒤 다시 시도해 주세요.",
        details: {},
      },
    };
  }
}

/** cursor = 시작 인덱스 문자열 */
export function paginate<T>(items: T[], query: Record<string, string>) {
  const limit = Math.min(Number(query.limit) || 20, 50);
  const start = Number(query.cursor) || 0;
  const page = items.slice(start, start + limit);
  return {
    items: page,
    nextCursor: start + limit < items.length ? String(start + limit) : null,
  };
}

/** 멱등 키: 같은 사용자·같은 키는 처음 결과, 같은 키에 다른 본문이면 409 */
export function idempotent(ctx: Ctx, scope: string, run: () => unknown) {
  const key = ctx.headers["Idempotency-Key"];
  if (!key) fail(400, "VALIDATION_ERROR", "Idempotency-Key 헤더가 필요해요.");
  const id = `${ctx.me().userId}:${scope}:${key}`;
  const fingerprint = JSON.stringify(ctx.body);
  const prev = ctx.db.idempotency[id];
  if (prev) {
    if (prev.fingerprint !== fingerprint)
      conflict("IDEMPOTENCY_MISMATCH", "같은 요청 키에 다른 내용이 왔어요.");
    if (prev.status >= 400)
      throw new MockHttpError(prev.status, prev.body as ErrorBody);
    return prev.body;
  }
  try {
    const body = run();
    ctx.db.idempotency[id] = {
      fingerprint,
      status: 200,
      body: JSON.parse(JSON.stringify(body)),
    };
    return body;
  } catch (e) {
    if (e instanceof MockHttpError && e.status === 409)
      ctx.db.idempotency[id] = { fingerprint, status: e.status, body: e.body };
    throw e;
  }
}
