// 관리자 페이지 로그인·세션 테스트(DEV-83). 실행: cd scripts/admin-web && npm test
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_WEB_PASSWORD = "test-password";
process.env.ADMIN_TOKEN = "test-token";
process.env.FARMCLUB_API_URL = "http://127.0.0.1:9"; // 닿지 않는 주소: 중계까지 가면 502

const { default: page } = await import("./api/page.js");
const { default: login } = await import("./api/login.js");
const { default: logout } = await import("./api/logout.js");
const { default: proxy } = await import("./api/proxy.js");

function call(handler, { method = "GET", url = "/", headers = {}, body } = {}) {
  const req = { method, url, headers: { host: "127.0.0.1:8090", ...headers }, body };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(b) { resolve({ status: this.statusCode, headers: this.headers, body: b ? String(b) : "" }); },
    };
    Promise.resolve(handler(req, res));
  });
}

const cookieOf = (r) => String(r.headers["set-cookie"] || "").split(";")[0];
const signIn = async () => cookieOf(await call(login, { method: "POST", body: { password: "test-password" } }));

test("미로그인으로 관리 화면에 오면 /login?next=로 보낸다", async () => {
  const r = await call(page, { url: "/api/page?name=producers" });
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, "/login?next=%2Fproducers");
  const home = await call(page, { url: "/api/page?name=home" });
  assert.equal(home.headers.location, "/login");
});

test("틀린 비밀번호는 401, 쿠키 없음", async () => {
  const r = await call(login, { method: "POST", body: { password: "nope" } });
  assert.equal(r.status, 401);
  assert.equal(JSON.parse(r.body).code, "BAD_PASSWORD");
  assert.equal(r.headers["set-cookie"], undefined);
});

test("맞는 비밀번호는 HttpOnly·SameSite=Strict 12시간 쿠키, https면 Secure", async () => {
  const r = await call(login, { method: "POST", body: { password: "test-password" } });
  assert.equal(r.status, 200);
  const c = r.headers["set-cookie"];
  assert.match(c, /^fc_admin=v1\.\d+\.[\w-]+; Path=\/; Max-Age=43200; HttpOnly; SameSite=Strict$/);
  const https = await call(login, { method: "POST", headers: { "x-forwarded-proto": "https" }, body: { password: "test-password" } });
  assert.match(https.headers["set-cookie"], /; Secure$/);
});

test("로그인하면 관리 화면이 열리고 /login은 next로 보낸다", async () => {
  const cookie = await signIn();
  const r = await call(page, { url: "/api/page?name=producers", headers: { cookie } });
  assert.equal(r.status, 200);
  assert.match(r.body, /농가 가입 신청/);
  const l = await call(page, { url: "/api/page?name=login&next=/producers", headers: { cookie } });
  assert.equal(l.headers.location, "/producers");
  const evil = await call(page, { url: "/api/page?name=login&next=//evil.example", headers: { cookie } });
  assert.equal(evil.headers.location, "/producers");
});

test("중계는 세션 없거나 서명이 틀리면 401, 다른 사이트 POST는 403", async () => {
  const path = "/api/proxy?path=" + encodeURIComponent("/admin/producers");
  assert.equal((await call(proxy, { url: path })).status, 401);
  const cookie = await signIn();
  const [ver, exp, mac] = cookie.split("=")[1].split(".");
  const forged = `fc_admin=${ver}.${Number(exp) + 1000}.${mac}`;
  assert.equal((await call(proxy, { url: path, headers: { cookie: forged } })).status, 401);
  const post = await call(proxy, {
    method: "POST", url: "/api/proxy?path=" + encodeURIComponent("/admin/producers/f-1/approve"),
    headers: { cookie, origin: "https://evil.example" },
  });
  assert.equal(post.status, 403);
  const ok = await call(proxy, { url: path, headers: { cookie } });
  assert.equal(ok.status, 502); // 세션 통과 → 실서버 호출까지 감
});

test("12시간이 지나면 세션이 끝난다", async () => {
  const cookie = await signIn();
  const now = Date.now;
  Date.now = () => now() + 12 * 3600 * 1000 + 1000;
  try {
    const r = await call(page, { url: "/api/page?name=producers", headers: { cookie } });
    assert.equal(r.status, 302);
  } finally {
    Date.now = now;
  }
  assert.equal((await call(page, { url: "/api/page?name=producers", headers: { cookie } })).status, 200);
});

test("비밀번호를 바꾸면 기존 세션이 풀린다", async () => {
  const cookie = await signIn();
  process.env.ADMIN_WEB_PASSWORD = "changed";
  try {
    const r = await call(page, { url: "/api/page?name=producers", headers: { cookie } });
    assert.equal(r.status, 302);
  } finally {
    process.env.ADMIN_WEB_PASSWORD = "test-password";
  }
});

test("로그아웃은 쿠키를 지우고 /login으로", async () => {
  const r = await call(logout, { method: "POST" });
  assert.equal(r.status, 303);
  assert.equal(r.headers.location, "/login");
  assert.match(r.headers["set-cookie"], /^fc_admin=; Path=\/; Max-Age=0;/);
});

test("중계는 가입 신청·공급 물량 경로만 넘기고 나머지 관리 API는 400 (DEV-87)", async () => {
  const cookie = await signIn();
  const go = (path, method = "GET") =>
    call(proxy, { method, url: "/api/proxy?path=" + encodeURIComponent(path), headers: { cookie } });
  for (const [path, method] of [
    ["/admin/capacity-requests?status=ALL", "GET"],
    ["/admin/products/p-1/capacity-requests/capacity-p-1/approve", "POST"],
    ["/admin/products/p-1/capacity-requests/capacity-p-1/reject", "POST"],
  ]) {
    assert.equal((await go(path, method)).status, 502, path); // 허용 → 실서버 호출까지 감
  }
  for (const path of ["/admin/orders/o-1/refund", "/admin/products/p-1/capacity-requests", "/admin/capacity-requests/../orders"]) {
    assert.equal((await go(path, "POST")).status, 400, path);
  }
});

test("공급 물량 승인 화면도 로그인해야 열린다 (DEV-87)", async () => {
  const r = await call(page, { url: "/api/page?name=capacity" });
  assert.equal(r.headers.location, "/login?next=%2Fcapacity");
  const cookie = await signIn();
  const ok = await call(page, { url: "/api/page?name=capacity", headers: { cookie } });
  assert.equal(ok.status, 200);
  assert.match(ok.body, /공급 물량 승인/);
});

test("중계는 테스트 농가 목록·미리보기·숨기기·되돌리기만 넘긴다 (DEV-98)", async () => {
  const cookie = await signIn();
  const go = (path, method = "GET") =>
    call(proxy, { method, url: "/api/proxy?path=" + encodeURIComponent(path), headers: { cookie } });
  for (const [path, method] of [
    ["/admin/farms", "GET"],
    ["/admin/farms/f-kang/preview", "GET"],
    ["/admin/farms/f-kang/retire", "POST"],
    ["/admin/farms/f-kang/restore", "POST"],
  ]) {
    assert.equal((await go(path, method)).status, 502, path); // 허용 → 실서버 호출까지 감
  }
  for (const path of ["/admin/farms/f-kang", "/admin/farms/f-kang/delete", "/admin/farms/../orders", "/admin/farms/f-kang/retire?x=1"]) {
    assert.equal((await go(path, "POST")).status, 400, path);
  }
});

test("테스트 농가 화면도 로그인해야 열린다 (DEV-98)", async () => {
  const r = await call(page, { url: "/api/page?name=farms" });
  assert.equal(r.headers.location, "/login?next=%2Ffarms");
  const cookie = await signIn();
  const ok = await call(page, { url: "/api/page?name=farms", headers: { cookie } });
  assert.equal(ok.status, 200);
  assert.match(ok.body, /테스트 농가/);
});
