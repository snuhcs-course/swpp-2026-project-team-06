// 관리자 페이지 로그인·세션 테스트(DEV-83). 실행: cd scripts/admin-web && npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
