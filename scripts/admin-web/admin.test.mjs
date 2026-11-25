// 관리자 페이지 로그인·세션 테스트(DEV-83). 실행: cd scripts/admin-web && npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

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
    ["/admin/products/p-1/changes", "GET"], // 상품 변경 기록(DEV-361)
  ]) {
    assert.equal((await go(path, method)).status, 502, path); // 허용 → 실서버 호출까지 감
  }
  // 주문 환불은 DEV-106 사용자 화면에서 허용했다. 여전히 막는 운영 API로 확인한다
  for (const path of ["/admin/orders/expire-deposits", "/admin/products/p-1/capacity-requests", "/admin/capacity-requests/../orders", "/admin/products/p-1/changes/../capacity-requests"]) {
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
  assert.match(ok.body, /변경 기록 보기/); // 신청 뒤 생산자 변경 기록(DEV-361)
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

test("중계는 사용자 목록(검색어 인코딩 포함)과 테스트 표시·해제만 넘긴다 (DEV-107)", async () => {
  const cookie = await signIn();
  const go = (path, method = "GET") =>
    call(proxy, { method, url: "/api/proxy?path=" + encodeURIComponent(path), headers: { cookie } });
  for (const [path, method] of [
    ["/admin/users", "GET"],
    ["/admin/users?" + new URLSearchParams({ q: "서울증류소", role: "PRODUCER", kind: "real", limit: "100" }), "GET"],
    ["/admin/users/u-kakao-1/mark-tester", "POST"],
    ["/admin/users/u-kakao-1/unmark-tester", "POST"],
  ]) {
    assert.equal((await go(path, method)).status, 502, path); // 허용 → 실서버 호출까지 감
  }
  for (const path of ["/admin/users/u-1/delete", "/admin/users/../orders", "/admin/users?q=a/b", "/admin/users/u-1/mark-tester?x=1"]) {
    assert.equal((await go(path, "POST")).status, 400, path);
  }
});

test("중계는 사용자 상세와 주문 처리 버튼 경로만 넘긴다 (DEV-106)", async () => {
  const cookie = await signIn();
  const go = (path, method = "GET") =>
    call(proxy, { method, url: "/api/proxy?path=" + encodeURIComponent(path), headers: { cookie } });
  for (const [path, method] of [
    ["/admin/users/u-g4", "GET"],
    ["/admin/users/by-order/FC-1021-1234", "GET"],
    // 입금자명(DEV-342)은 한글이라 퍼센트 인코딩해 보낸다
    [`/admin/users/by-order/${encodeURIComponent("김민지76")}`, "GET"],
    ["/admin/orders/o-g4/confirm-deposit", "POST"],
    ["/admin/orders/o-g4/refund", "POST"],
    ["/admin/orders/o-g4/refunds", "GET"],
    ["/admin/orders/o-g4/delivered", "POST"],
  ]) {
    assert.equal((await go(path, method)).status, 502, path);
  }
  for (const path of [
    "/admin/users/u-g4/orders", "/admin/users/by-order/o-1/x", "/admin/orders/expire-deposits",
    // 인코딩한 점·빗금·공백으로 경로를 바꾸지 못한다(DEV-342)
    "/admin/users/by-order/%2e%2e", "/admin/users/by-order/a%2Fb", "/admin/users/by-order/a%20b",
    "/admin/orders/o-g4", "/admin/orders/o-g4/refund?amount=1", "/admin/users/../orders",
  ]) {
    assert.equal((await go(path, "POST")).status, 400, path);
  }
});

test("사용자 화면도 로그인해야 열린다 (DEV-107)", async () => {
  const r = await call(page, { url: "/api/page?name=users" });
  assert.equal(r.headers.location, "/login?next=%2Fusers");
  const cookie = await signIn();
  const ok = await call(page, { url: "/api/page?name=users", headers: { cookie } });
  assert.equal(ok.status, 200);
  assert.match(ok.body, /테스트로 표시/);
});

test("사용자 상세 화면은 로그인해야 열리고 /users/<id>로 돌아온다 (DEV-106)", async () => {
  const r = await call(page, { url: "/api/page?name=user&id=u-g4" });
  assert.equal(r.headers.location, "/login?next=%2Fusers%2Fu-g4");
  const bad = await call(page, { url: "/api/page?name=user&id=..%2Fx" });
  assert.equal(bad.headers.location, "/login?next=%2Fuser");
  const cookie = await signIn();
  const ok = await call(page, { url: "/api/page?name=user&id=u-g4", headers: { cookie } });
  assert.equal(ok.status, 200);
  assert.match(ok.body, /사용자/);
});

test("사용자 상세는 농가 상품·AI 초안을 읽기만 하고 목록 링크는 생산자면 상세(상품·주문) (DEV-303)", async () => {
  const cookie = await signIn();
  const detail = await call(page, { url: "/api/page?name=user&id=u-kang", headers: { cookie } });
  assert.equal(detail.status, 200);
  assert.match(detail.body, /박스 \/ \$\{o\.quantity\}박스/); // 5kg 29,000원 · 38박스 / 180박스
  assert.match(detail.body, /작성 중 · AI 초안/);
  const list = await call(page, { url: "/api/page?name=users", headers: { cookie } });
  assert.match(list.body, /상세\(상품·주문\)/);
  // 상품은 사용자 상세 응답에 들어 있어 새 중계 경로가 없다(읽기 전용)
  const go = (path, method = "GET") =>
    call(proxy, { method, url: "/api/proxy?path=" + encodeURIComponent(path), headers: { cookie } });
  assert.equal((await go("/admin/users/u-kang")).status, 502); // 허용 → 실서버 호출까지 감
  for (const [path, method] of [["/admin/users/u-kang/products", "GET"], ["/admin/products/p-house", "GET"], ["/admin/products/p-house/approve", "POST"]]) {
    assert.equal((await go(path, method)).status, 400, path);
  }
});

test("중계는 문의함 목록·대화 보기·답장·읽음만 넘긴다 (DEV-111)", async () => {
  const cookie = await signIn();
  const go = (path, method = "GET") =>
    call(proxy, { method, url: "/api/proxy?path=" + encodeURIComponent(path), headers: { cookie } });
  for (const [path, method] of [
    ["/admin/support", "GET"],
    ["/admin/support/f-kang/messages", "GET"],
    ["/admin/support/f-kang/messages", "POST"],
    ["/admin/support/f-kang/read", "POST"],
  ]) {
    assert.equal((await go(path, method)).status, 502, path); // 허용 → 실서버 호출까지 감
  }
  for (const path of ["/admin/support/f-kang", "/admin/support/f-kang/delete", "/admin/support/../orders", "/admin/support?x=1"]) {
    assert.equal((await go(path, "POST")).status, 400, path);
  }
});

test("문의함 화면도 로그인해야 열린다 (DEV-111)", async () => {
  const r = await call(page, { url: "/api/page?name=inbox" });
  assert.equal(r.headers.location, "/login?next=%2Finbox");
  const cookie = await signIn();
  const ok = await call(page, { url: "/api/page?name=inbox", headers: { cookie } });
  assert.equal(ok.status, 200);
  assert.match(ok.body, /문의함/);
});

test("중계는 AI 비용 조회만 넘기고 보고 API는 넘기지 않는다 (DEV-144)", async () => {
  const cookie = await signIn();
  const go = (path, method = "GET") =>
    call(proxy, { method, url: "/api/proxy?path=" + encodeURIComponent(path), headers: { cookie } });
  assert.equal((await go("/admin/ai-usage?limit=50&feature=spec_check")).status, 502); // 허용 → 실서버 호출까지 감
  assert.equal((await go("/admin/ai-usage?limit=50&cursor=WzUwXQ==")).status, 502);
  assert.equal((await go("/admin/spec-check-runs")).status, 400);
  assert.equal((await go("/internal/spec-check-runs", "POST")).status, 400);
});

test("AI 비용 화면도 로그인해야 열린다 (DEV-144)", async () => {
  const r = await call(page, { url: "/api/page?name=ai-cost" });
  assert.equal(r.headers.location, "/login?next=%2Fai-cost");
  const cookie = await signIn();
  const ok = await call(page, { url: "/api/page?name=ai-cost", headers: { cookie } });
  assert.equal(ok.status, 200);
  assert.match(ok.body, /AI 비용/);
});

test("중계는 소비자 문의 대화방 보기·답장·읽음도 넘긴다 (DEV-150)", async () => {
  const cookie = await signIn();
  const go = (path, method = "GET") =>
    call(proxy, { method, url: "/api/proxy?path=" + encodeURIComponent(path), headers: { cookie } });
  for (const [path, method] of [
    ["/admin/support/consumers/u-minji/messages", "GET"],
    ["/admin/support/consumers/u-minji/messages", "POST"],
    ["/admin/support/consumers/u-minji/read", "POST"],
  ]) {
    assert.equal((await go(path, method)).status, 502, path); // 허용 → 실서버 호출까지 감
  }
  for (const path of ["/admin/support/consumers", "/admin/support/consumers/u-minji", "/admin/support/consumers/u-minji/delete", "/admin/support/consumers/../orders"]) {
    assert.equal((await go(path, "POST")).status, 400, path);
  }
});

test("중계는 정지·정지 풀기·되돌리기·이력·활동 로그·홈 건수와 계정 필터를 넘긴다 (DEV-307)", async () => {
  const cookie = await signIn();
  const go = (path, method = "GET") =>
    call(proxy, { method, url: "/api/proxy?path=" + encodeURIComponent(path), headers: { cookie } });
  for (const [path, method] of [
    ["/admin/farms/f-kang/suspend-preview", "GET"],
    ["/admin/farms/f-kang/suspend", "POST"],
    ["/admin/farms/f-kang/unsuspend", "POST"],
    ["/admin/farms/f-kang/history", "GET"],
    ["/admin/producers/f-reject/revert", "POST"],
    ["/admin/users/u-g4/activity", "GET"],
    ["/admin/home", "GET"],
    ["/admin/home?kind=all", "GET"],
    ["/admin/support?kind=test", "GET"],
    ["/admin/producers?status=ALL&kind=all", "GET"],
    ["/admin/capacity-requests?status=PENDING&kind=real", "GET"],
    ["/admin/users?kind=all", "GET"],
  ]) {
    assert.equal((await go(path, method)).status, 502, path); // 허용 → 실서버 호출까지 감
  }
  for (const path of [
    "/admin/farms/f-kang/suspend?x=1", "/admin/farms/f-kang/delete", "/admin/users/u-1/activity/x",
    "/admin/home/x", "/admin/home?x=1", "/admin/support?kind=a/b", "/admin/support?kind=wrong", "/admin/producers/f-1/revert/x", "/admin/farms/../orders",
  ]) {
    assert.equal((await go(path, "POST")).status, 400, path);
  }
});

const proxyGo = (cookie) => (path, method = "GET") =>
  call(proxy, { method, url: "/api/proxy?path=" + encodeURIComponent(path), headers: { cookie } });
const source = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("AC-01-22 중계는 아이디 계정 목록·만들기만 넘기고 이웃 경로는 400 (DEV-363)", async () => {
  const go = proxyGo(await signIn());
  for (const [path, method] of [
    ["/admin/id-accounts", "GET"],
    ["/admin/id-accounts?" + new URLSearchParams({ app: "producer", q: "농가", limit: "100" }), "GET"],
    ["/admin/id-accounts", "POST"],
  ]) {
    assert.equal((await go(path, method)).status, 502, path); // 허용 → 실서버 호출까지 감
  }
  for (const path of [
    "/admin/id-accounts/u-pw-1", "/admin/id-accounts/u-pw-1/temporary-password", "/admin/id-accounts/x/delete",
    "/admin/id-accounts?q=a/b", "/admin/id-accounts/../users", "/admin/id-accountsx", "/admin/signups", "/admin/signups/u-1/approve",
  ]) {
    assert.equal((await go(path, "POST")).status, 400, path);
  }
});

test("AC-01-31 중계는 임시 비밀번호 발급 경로만 넘기고 이웃 경로는 400 (DEV-363)", async () => {
  const go = proxyGo(await signIn());
  assert.equal((await go("/admin/users/u-pw-1/temporary-password", "POST")).status, 502);
  for (const path of [
    "/admin/users/u-pw-1/temporary-password/extra", "/admin/users/u-pw-1/temporary-password?x=1",
    "/admin/users/u-pw-1/temporary_password", "/admin/users/u-pw-1/password", "/admin/users/../users/u-1/temporary-password",
  ]) {
    assert.equal((await go(path, "POST")).status, 400, path);
  }
});

test("DEV-439 중계는 기존 사용자 아이디 자격 증명 설정 경로만 넘긴다", async () => {
  const go = proxyGo(await signIn());
  assert.equal((await go("/admin/users/u-uat-p3/id-credentials", "POST")).status, 502);
  for (const path of [
    "/admin/users/u-uat-p3/id-credentials/extra", "/admin/users/u-uat-p3/id-credentials?x=1",
    "/admin/users/u-uat-p3/id_credentials", "/admin/users/../users/u-uat-p3/id-credentials",
  ]) {
    assert.equal((await go(path, "POST")).status, 400, path);
  }
});

// 가짜 실서버로 바꿔 중계 응답 헤더·본문과 콘솔 기록을 본다. 본문 없는 POST는 가짜 req라 body를 문자열로 둔다
async function relaySecret(cookie, path, reqBody, upstreamBody) {
  const realFetch = globalThis.fetch;
  const logged = [], saved = {};
  for (const k of ["log", "info", "warn", "error", "debug"]) { saved[k] = console[k]; console[k] = (...a) => logged.push(a.join(" ")); }
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url, method: init.method, headers: init.headers, body: init.body };
    return new Response(JSON.stringify(upstreamBody), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  };
  try {
    const r = await call(proxy, {
      method: "POST", url: "/api/proxy?path=" + encodeURIComponent(path),
      headers: { cookie, "idempotency-key": "k-1", "content-type": "application/json" }, body: reqBody,
    });
    return { r, seen, logged };
  } finally {
    globalThis.fetch = realFetch;
    Object.assign(console, saved);
  }
}

test("AC-01-22 아이디 계정 만들기 응답은 no-store로 그대로 넘기고 멱등 키를 붙이며 콘솔에 남기지 않는다 (DEV-363)", async () => {
  const cookie = await signIn();
  const secret = "Tmp-Create-5678";
  const { r, seen, logged } = await relaySecret(cookie, "/admin/id-accounts", JSON.stringify({ app: "consumer", username: "uat01", nickname: "테스터" }), {
    userId: "u-pw-2", role: "CONSUMER", username: "uat01", mustChangePassword: true, consented: false, issueId: "abc", temporaryPassword: secret,
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(JSON.parse(r.body).temporaryPassword, secret);
  assert.equal(seen.method, "POST");
  assert.match(seen.url, /\/admin\/id-accounts$/);
  assert.equal(seen.headers["idempotency-key"], "k-1"); // 서버가 멱등 키를 요구한다
  assert.equal(JSON.parse(seen.body).username, "uat01");
  assert.ok(!logged.some((l) => l.includes(secret)), "임시 비밀번호가 콘솔에 남으면 안 된다");
});

test("AC-01-31 임시 비밀번호 응답은 no-store로 그대로 넘기고 콘솔에 남기지 않는다 (DEV-363)", async () => {
  const cookie = await signIn();
  const secret = "Tmp-Secret-1234";
  const { r, seen, logged } = await relaySecret(cookie, "/admin/users/u-pw-1/temporary-password", "", {
    userId: "u-pw-1", username: "minji01", temporaryPassword: secret, mustChangePassword: true,
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(JSON.parse(r.body).temporaryPassword, secret);
  assert.equal(seen.method, "POST");
  assert.match(seen.url, /\/admin\/users\/u-pw-1\/temporary-password$/);
  assert.ok(!logged.some((l) => l.includes(secret)), "임시 비밀번호가 콘솔에 남으면 안 된다");
  assert.doesNotMatch(source("./api/proxy.js") + source("./server.mjs"), /console\.(log|info|warn|error|debug)\([^)]*(body|text\(\))/);
});

test("DEV-439 기존 사용자 자격 증명 응답은 no-store로 전달하고 평문을 기록하지 않는다", async () => {
  const cookie = await signIn();
  const secret = "Tmp-Uat-Secret-567";
  const { r, seen, logged } = await relaySecret(
    cookie,
    "/admin/users/u-uat-p3/id-credentials",
    JSON.stringify({ username: "uatproducer3" }),
    { userId: "u-uat-p3", username: "uatproducer3", temporaryPassword: secret, mustChangePassword: true },
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(JSON.parse(r.body).temporaryPassword, secret);
  assert.match(seen.url, /\/admin\/users\/u-uat-p3\/id-credentials$/);
  assert.equal(JSON.parse(seen.body).username, "uatproducer3");
  assert.ok(!logged.some((line) => line.includes(secret)));
});

test("AC-01-37 DEV-439 연결 농가가 있는 활성 시드 생산자만 로그인 설정을 표시한다", async () => {
  const elements = new Map();
  const context = {
    URLSearchParams,
    $: (selector) => {
      if (!elements.has(selector)) elements.set(selector, {});
      return elements.get(selector);
    },
    esc: String,
    call: async () => ({ items: [], total: 0 }),
    toast() {},
  };
  const script = source("./api/_views/users.html").match(/<script>([\s\S]*?)<\/script>/)[1];
  runInNewContext(script, context);
  await Promise.resolve();
  const producer = {
    userId: "u-uat-p3", isTestAccount: true, role: "PRODUCER", signup: "SEED",
    farmId: "f-uat-3", farmName: "UAT 농가 3", farmStatus: "APPROVED", createdAt: "2026-11-16",
  };
  const eligible = context.card(producer);
  assert.match(eligible, /data-act="provision-id-login"/);
  assert.doesNotMatch(eligible, /<form/); // Enter must not submit/navigate the containing page.
  for (const patch of [
    { farmId: null }, { withdrawn: true }, { isTestAccount: false },
    { role: "CONSUMER" }, { signup: "KAKAO" }, { signup: "PASSWORD", username: "uatp3" },
  ]) {
    assert.doesNotMatch(context.card({ ...producer, ...patch }), /data-act="provision-id-login"/);
  }
  assert.match(context.card({ ...producer, signup: "PASSWORD", username: "uatp3" }), /data-act="temp-password"/);
});

function provisioningHarness(reply) {
  const slot = { innerHTML: "" };
  const input = { value: "uatp3", reportValidity: () => true };
  const row = { signup: "SEED", username: null };
  const button = {
    dataset: {}, disabled: false,
    closest: () => ({ querySelector: () => input }),
  };
  const article = { dataset: { id: "u-uat-p3" }, querySelector: () => slot };
  const calls = [];
  const context = {
    document: { querySelector: () => ({}), querySelectorAll: () => [article] },
    addEventListener() {}, location: { pathname: "/users" },
  };
  runInNewContext(source("./assets/admin.js"), context);
  context.renderList = () => {};
  context.toast = () => {};
  context.call = async (...args) => { calls.push(args); return reply(); };
  return { slot, input, row, button, calls, issue: () => context.provisionIdLogin(button, slot, "u-uat-p3", "UAT 생산자 3", row) };
}

test("AC-01-37 DEV-439 확인한 아이디만 한 번 발급하고 응답 비밀번호를 표시한다", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const h = provisioningHarness(() => pending);
  await h.issue();
  assert.equal(h.calls.length, 0);
  h.input.value = "uatp4";
  await h.issue();
  assert.equal(h.calls.length, 0); // A changed username needs fresh confirmation.
  const issuance = h.issue();
  await h.issue(); // Duplicate click while pending must not issue twice.
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0], "/admin/users/u-uat-p3/id-credentials");
  assert.equal(h.calls[0][2].username, "uatp4");
  assert.equal(h.button.disabled, true);
  finish({ username: "uatp4", temporaryPassword: "Synthetic-Only-123" });
  await issuance;
  assert.equal(h.row.signup, "PASSWORD");
  assert.equal(h.row.username, "uatp4");
  assert.match(h.slot.innerHTML, /Synthetic-Only-123/);
  assert.equal(h.button.disabled, false);
});

test("AC-01-37 DEV-439 잘못된 입력과 발급 실패는 계정을 바꾸지 않고 재시도를 허용한다", async () => {
  let fail = true;
  const h = provisioningHarness(() => {
    if (fail) throw new Error("already in use");
    return { username: "uatp3", temporaryPassword: "Synthetic-Only-456" };
  });
  h.input.reportValidity = () => false;
  await h.issue();
  assert.equal(h.calls.length, 0);
  h.input.reportValidity = () => true;
  await h.issue(); await h.issue();
  assert.equal(h.row.signup, "SEED");
  assert.equal(h.slot.innerHTML, "");
  assert.equal(h.button.disabled, false);
  fail = false;
  await h.issue(); await h.issue();
  assert.equal(h.calls.length, 2);
  assert.equal(h.row.signup, "PASSWORD");
});

test("AC-01-22 아이디 계정 화면은 로그인해야 열리고 메뉴는 가입 신청 바로 다음, 가입 승인 화면은 없다 (DEV-363)", async () => {
  const r = await call(page, { url: "/api/page?name=id-accounts" });
  assert.equal(r.headers.location, "/login?next=%2Fid-accounts");
  const cookie = await signIn();
  const ok = await call(page, { url: "/api/page?name=id-accounts", headers: { cookie } });
  assert.equal(ok.status, 200);
  assert.match(ok.body, /<h1>아이디 계정<\/h1>/);
  assert.match(ok.body, /아이디 계정 만들기/);
  assert.match(ok.body, /call\("\/admin\/id-accounts", "POST", body\)/);
  assert.match(ok.body, /err\.fields/); // 서버 details.fields를 칸별 빨간 오류로
  assert.match(ok.body, /이 창을 닫으면 다시 볼 수 없어요\. 사용자에게 아이디와 함께 알려 주면, 처음 로그인할 때 새 비밀번호로 바꾸고 약관에 동의해요\./);
  assert.match(ok.body, /임시 비밀번호 사용 중/);
  assert.match(ok.body, /약관 동의 전/);
  assert.match(ok.body, /data-act="temp-password"/);
  // 공개 아이디 가입이 없어져(PM 11/18) 가입 승인 화면·경로를 지웠다
  const gone = await call(page, { url: "/api/page?name=signups", headers: { cookie } });
  assert.equal(gone.status, 302);
  assert.equal(gone.headers.location, "/");
  const rewrites = JSON.parse(source("./vercel.json")).rewrites;
  assert.ok(rewrites.some((w) => w.source === "/id-accounts" && w.destination === "/api/page?name=id-accounts"));
  assert.ok(!rewrites.some((w) => w.source === "/signups"));
  const nav = [...source("./assets/admin.js").matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(nav[nav.indexOf("/producers") + 1], "/id-accounts");
  assert.ok(!nav.includes("/signups"));
});

test("AC-01-31 임시 비밀번호는 아이디 계정·사용자 화면에서 한 번만 보이고 저장·기록하지 않는다 (DEV-363)", async () => {
  const cookie = await signIn();
  const users = (await call(page, { url: "/api/page?name=users", headers: { cookie } })).body;
  const ids = (await call(page, { url: "/api/page?name=id-accounts", headers: { cookie } })).body;
  const shared = source("./assets/admin.js");
  assert.match(users, /signup === "PASSWORD"/);
  assert.match(users, /u\.isTestAccount && u\.role === "PRODUCER" && u\.signup === "SEED"/);
  assert.match(users, /data-act="provision-id-login"/);
  assert.match(users, /provisionIdLogin\(b, slot, id, who, u\)/);
  assert.match(shared, /기존 비밀번호·로그인은 무효화되며, 농가 연결과 테스트 분류는 유지됩니다/);
  assert.match(users, /issueTemporaryPassword\(b, slot, id, who\)/);
  assert.doesNotMatch(users, /signupStatus|\/signups/); // 가입 승인 상태는 없어졌다
  assert.match(shared, /이 사용자의 지금 비밀번호와 모든 로그인이 바로 풀려요/);
  assert.match(shared, /이 창을 닫으면 다시 볼 수 없어요\. 사용자에게 알려 주면, 로그인한 뒤 바로 새 비밀번호로 바꿔요\./);
  assert.match(shared, /addEventListener\("pagehide", clearSecrets\)/);
  for (const [name, text] of [["users.html", users], ["id-accounts.html", ids], ["admin.js", shared]]) {
    for (const banned of [/localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /console\./]) {
      assert.doesNotMatch(text, banned, `${name}: ${banned}`);
    }
  }
});

// DEV-479: execute the public user-page handlers; the VM supplies only a tiny DOM/API adapter.
async function productVisibilityHarness({ hidden = false, status = "PUBLISHED", post } = {}) {
  const product = {
    productId: "p-target-479", name: "(테스트)황금향", status, isHidden: hidden, version: 7,
    options: [], photos: [], approvedSupplyGrams: 10000, salesLimitGrams: 8000,
    salesPaused: false, availability: "AVAILABLE", updatedAt: "2026-11-24T00:00:00Z",
  };
  const detail = {
    userId: "u-kang", nickname: "강영수", name: "강영수", role: "PRODUCER",
    isTestAccount: true, accountKind: "SEED_TEST", signup: "SEED", withdrawn: false,
    farm: { farmId: "f-kang", name: "강씨네 귤밭", approvalStatus: "APPROVED" },
    products: [product], drafts: [], orders: [], consents: [], ordersTruncated: false,
  };
  const error = { textContent: "", innerHTML: "" };
  const reload = { hidden: true };
  let markup = "", reason = { value: "", focus() {}, reportValidity: () => true };
  const slot = {
    get innerHTML() { return markup; },
    set innerHTML(value) {
      markup = String(value);
      const textarea = /<textarea\b[^>]*data-f=["']visibility-reason["'][^>]*>([\s\S]*?)<\/textarea>/i.exec(markup);
      const input = /<input\b[^>]*data-f=["']visibility-reason["'][^>]*>/i.exec(markup);
      const initial = textarea?.[1] ?? (input ? /\bvalue=["']([^"']*)/.exec(input[0])?.[1] ?? "" : "");
      reason = { value: initial, focus() {}, reportValidity: () => true };
    },
    querySelector(selector) {
      if (selector.includes("visibility-reload")) return reload;
      if (selector === "input" || selector.includes("visibility-reason")) return /data-f=["']visibility-reason["']/.test(markup) ? reason : null;
      if (selector.includes("data-visibility-error")) return error;
      return null;
    },
    querySelectorAll() { return []; },
  };
  const article = {
    dataset: { productId: product.productId },
    querySelector(selector) { return selector === ".slot" ? slot : slot.querySelector(selector); },
    querySelectorAll() { return []; },
  };
  const nodes = new Map([["#view", { innerHTML: "", onclick: null }]]);
  const calls = [], notifications = [];
  const context = {
    location: { pathname: "/users/u-kang", search: "", href: "http://127.0.0.1:8090/users/u-kang" },
    URL, URLSearchParams, console,
    $: (selector) => {
      if (!nodes.has(selector)) nodes.set(selector, { innerHTML: "", textContent: "", value: "" });
      return nodes.get(selector);
    },
    document: { querySelector: (selector) => context.$(selector), querySelectorAll: () => [article] },
    esc: (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
    when: (value) => String(value ?? ""), won: (value) => `${value ?? 0}원`,
    toast: (...args) => notifications.push(args),
    call: async (route, method = "GET", body) => {
      calls.push({ route, method, body });
      if (method === "POST") {
        const result = post ? await post(route, method, body) : {
          productId: product.productId, isHidden: body.isHidden, version: product.version + 1,
        };
        Object.assign(product, result);
        return result;
      }
      return detail;
    },
  };
  context.window = context;
  const script = source("./api/_views/user.html").match(/<script>([\s\S]*?)<\/script>/)[1];
  runInNewContext(script, context);
  await new Promise((resolve) => setImmediate(resolve));
  await context.load("u-kang");
  calls.length = 0;
  const buttons = [];
  function button(act) {
    const b = {
      dataset: { act }, disabled: false,
      closest(selector) {
        if (selector === "button[data-act]") return this;
        if (selector === "article") return article;
        if (selector === ".slot") return slot;
        return null;
      },
    };
    buttons.push(b);
    return b;
  }
  return {
    context, product, slot, calls, notifications, error,
    get input() { return reason; },
    button,
    click: async (actOrButton) => {
      const target = typeof actOrButton === "string" ? button(actOrButton) : actOrButton;
      return nodes.get("#view").onclick({ target, preventDefault() {} });
    },
  };
}

test("AC_23_13 product cards expose hide/restore only for eligible products and explain the isolated effect", async () => {
  const h = await productVisibilityHarness();
  const visible = h.context.productCard(h.product);
  const hidden = h.context.productCard({ ...h.product, isHidden: true });
  assert.match(visible, /data-act="visibility-form"/);
  assert.match(hidden, /data-act="visibility-form"/);
  assert.match(visible, />공개</);
  assert.match(hidden, />숨김</);
  assert.notEqual(hidden, visible, "the card must distinguish hidden from visible");
  assert.doesNotMatch(h.context.productCard({ ...h.product, status: "DRAFT" }), /data-act="visibility-form"/);
  assert.match(h.context.productCard({ ...h.product, status: "DRAFT", isHidden: true }), /data-act="visibility-form"/);
  await h.click("visibility-form");
  assert.match(h.slot.innerHTML, /\(테스트\)황금향/);
  assert.match(h.slot.innerHTML, /주문/);
  assert.match(h.slot.innerHTML, /그대로|유지|계속/);
  assert.ok(h.input);
  assert.equal(h.calls.length, 0);
  await h.click("cancel");
  assert.equal(h.calls.length, 0);
  assert.doesNotMatch(h.slot.innerHTML, /data-act="visibility-save"/);
});

test("AC_23_14 visibility handler requires a reason, trims it, blocks duplicate clicks and reloads after success", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const h = await productVisibilityHarness({ post: () => pending });
  await h.click("visibility-form");
  h.input.value = "  \n ";
  await h.click("visibility-save");
  assert.equal(h.calls.length, 0);
  assert.match(h.slot.innerHTML, /data-act="visibility-save"/);
  h.input.value = "  합성 테스트 상품만 숨겨요  ";
  const save = h.button("visibility-save");
  const saving = h.click(save);
  await h.click(save);
  const mutations = () => h.calls.filter((entry) => entry.method === "POST");
  assert.equal(mutations().length, 1);
  assert.equal(mutations()[0].route, "/admin/products/p-target-479/visibility");
  assert.deepEqual(JSON.parse(JSON.stringify(mutations()[0].body)), { isHidden: true, version: 7, reason: "합성 테스트 상품만 숨겨요" });
  assert.equal(save.disabled, true);
  finish({ productId: "p-target-479", isHidden: true, version: 8 });
  await saving;
  assert.ok(h.calls.some((entry) => entry.method === "GET" && entry.route === "/admin/users/u-kang"));
});

test("AC_23_14 restore sends inverse visibility and a failed request preserves reason with refresh available", async () => {
  const h = await productVisibilityHarness({ hidden: true, post: async () => { throw new Error("version changed"); } });
  await h.click("visibility-form");
  h.input.value = "확인 후 다시 공개";
  await h.click("visibility-save");
  const mutation = h.calls.find((entry) => entry.method === "POST");
  assert.equal(mutation.route, "/admin/products/p-target-479/visibility");
  assert.deepEqual(JSON.parse(JSON.stringify(mutation.body)), { isHidden: false, version: 7, reason: "확인 후 다시 공개" });
  assert.equal(h.input.value, "확인 후 다시 공개");
  assert.ok(/visibility-reload/.test(h.slot.innerHTML) || /visibility-reload/.test(h.error.innerHTML));
  assert.equal(h.calls.filter((entry) => entry.method === "GET").length, 0);
  await h.click("visibility-reload");
  assert.ok(h.calls.some((entry) => entry.method === "GET" && entry.route === "/admin/users/u-kang"));
});

test("AC_23_13 visibility proxy permits only the exact safe POST path with session and same origin", async () => {
  const target = "/admin/products/p-target_479/visibility";
  const url = "/api/proxy?path=" + encodeURIComponent(target);
  assert.equal((await call(proxy, { method: "POST", url })).status, 401);
  const cookie = await signIn();
  assert.equal((await call(proxy, { method: "POST", url, headers: { cookie, origin: "https://evil.example" } })).status, 403);
  assert.equal((await call(proxy, { method: "POST", url, headers: { cookie, origin: "http://127.0.0.1:8090" } })).status, 502);
  for (const [route, method] of [
    [target, "GET"], [target, "DELETE"], [target + "/extra", "POST"], [target + "?x=1", "POST"],
    ["/admin/products/../orders/visibility", "POST"], ["/admin/products/p%2Fother/visibility", "POST"],
    ["/admin/products/p-target_479/visibility-reset", "POST"],
  ]) {
    const response = await call(proxy, { method, url: "/api/proxy?path=" + encodeURIComponent(route), headers: { cookie } });
    assert.equal(response.status, 400, `${method} ${route}`);
  }
});
