// I3 소비자 예약·주문 상태·재시도 평가(DEV-168, matrix I3-PRE-01..05) 실행기.
// 로컬 격리 스택에서만 돈다(localhost API·앱, 합성 시드). 행마다 시드를 다시 넣고 한 번 실행한다.
// 원본 기록(JSON·스크린샷)은 커밋하지 않는 .artifacts/i3-journeys/<baseline>/에 쓴다. 토큰은 기록하지 않는다.
//
//   node scripts/i3-preorder/run.mjs [I3-PRE-01 ...]
//
// 환경: FARMCLUB_API_URL(기본 http://localhost:8100), FARMCLUB_CONSUMER_URL(8181), FARMCLUB_PRODUCER_URL(8182),
//       I3_DB(기본 farmclub_i3_pre), I3_DB_CONTAINER(기본 server-db-1), I3_BASELINE(기본 i3-b2-87792b7).
// API는 이 스크립트가 직접 띄우고 끈다(입금 기한 행은 FIXED_NOW를 바꿔 다시 띄운다). 앱 두 개는 미리 띄워 둔다.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../", import.meta.url));
const serverDir = path.join(root, "server");
const API = process.env.FARMCLUB_API_URL ?? "http://localhost:8100";
const CONSUMER = process.env.FARMCLUB_CONSUMER_URL ?? "http://localhost:8181";
const PRODUCER = process.env.FARMCLUB_PRODUCER_URL ?? "http://localhost:8182";
const DB = process.env.I3_DB ?? "farmclub_i3_pre";
const CONTAINER = process.env.I3_DB_CONTAINER ?? "server-db-1";
const BASELINE = process.env.I3_BASELINE ?? "i3-b2-87792b7";
const OUT = path.join(root, ".artifacts", "i3-journeys", BASELINE);
const CLOCK = "2026-10-07T10:00:00+09:00";
const CONSENT_VERSION = "policy-2026-10-23";
for (const url of [API, CONSUMER, PRODUCER]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error(`localhost only: ${url}`);
}
mkdirSync(OUT, { recursive: true });

// ---------- 스택 ----------
let api = null;
async function startApi(fixedNow = CLOCK) {
  await stopApi();
  const port = new URL(API).port;
  api = spawn("uv", ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", port], {
    cwd: serverDir,
    env: { ...process.env, FIXED_NOW: fixedNow, APP_ENV: "local", MOCK_LOGIN_ENABLED: "true" },
    stdio: "ignore",
  });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${API}/health`)).ok) return fixedNow;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("API did not start");
}
async function stopApi() {
  if (!api) return;
  const child = api;
  api = null;
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
}
function reseed() {
  execFileSync("uv", ["run", "python", "-m", "app.core.seed", "--reset"], { cwd: serverDir, stdio: "ignore" });
  return { revision: sql("select version_num from alembic_version"), orders: Number(sql("select count(*) from orders")) };
}
function sql(query) {
  return execFileSync("docker", ["exec", CONTAINER, "psql", "-U", "farmclub", "-d", DB, "-tA", "-F", "|", "-c", query], {
    encoding: "utf8",
  }).trim();
}
const reserved = (stage, option) =>
  Number(sql(`select reserved_count from stage_allocations where stage_id='${stage}' and option_id='${option}'`));
const allocation = (stage, option) => {
  const [quantity, count] = sql(
    `select quantity, reserved_count from stage_allocations where stage_id='${stage}' and option_id='${option}'`,
  ).split("|");
  return { quantity: Number(quantity), reserved: Number(count) };
};
const orderCount = (consumer) => Number(sql(`select count(*) from orders where consumer_id='${consumer}'`));
const newOrders = (consumer, knownIds) =>
  sql(`select id, status, quantity, unit_price, total_amount from orders where consumer_id='${consumer}' order by created_at, id`)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, status, quantity, unitPrice, total] = line.split("|");
      return { id, status, quantity: Number(quantity), unitPrice: Number(unitPrice), total: Number(total) };
    })
    .filter((o) => !knownIds.includes(o.id));
const orderIds = (consumer) => newOrders(consumer, []).map((o) => o.id);

async function call(method, url, { token, body, key } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers["Idempotency-Key"] = key;
  const res = await fetch(API + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json };
}
const login = async (userId, app) => (await call("POST", "/api/auth/test-login", { body: { userId, app } })).json.accessToken;
const key = (label) => `i3pre-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminToken = () =>
  execFileSync("uv", ["run", "python", "-m", "app.accounts.admin_token"], { cwd: serverDir, encoding: "utf8" })
    .trim()
    .split(/\s+/)
    .at(-1);

async function producerProduct(token, id = "p-house") {
  return (await call("GET", `/api/products/mine/${id}`, { token })).json;
}
async function setStagePrice(token, stageId, optionId, { price, quantity }) {
  const p = await producerProduct(token);
  const stages = p.stages.map((s) => ({
    stageId: s.stageId,
    name: s.name,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    options: Object.fromEntries(
      Object.entries(s.options).map(([oid, v]) => [
        oid,
        {
          price: s.stageId === stageId && oid === optionId && price !== undefined ? price : v.price,
          quantity: s.stageId === stageId && oid === optionId && quantity !== undefined ? quantity : v.quantity,
        },
      ]),
    ),
  }));
  return call("PUT", `/api/products/p-house/stages`, { token, key: key("stages"), body: { stages, version: p.version } });
}
async function patchProduct(token, patch) {
  const p = await producerProduct(token);
  return call("PATCH", `/api/products/p-house`, { token, key: key("patch"), body: { ...patch, version: p.version } });
}
async function setPaused(token, paused) {
  const p = await producerProduct(token);
  return call("PUT", `/api/products/p-house/sales-settings`, {
    token,
    key: key("sales"),
    body: {
      salesLimitGrams: p.salesLimitGrams,
      maxQuantityPerOrder: p.maxQuantityPerOrder,
      salesPaused: paused,
      version: p.version,
    },
  });
}
const orderBody = (over = {}) => ({
  productId: "p-house",
  optionId: "opt-5",
  quantity: 1,
  recipientName: "평가 구매자",
  recipientPhone: "010-0000-0168",
  postalCode: "06236",
  address: "서울특별시 강남구 테헤란로 1",
  addressDetail: "101호",
  consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
  consentVersion: CONSENT_VERSION,
  ...over,
});

// ---------- 화면 ----------
async function consumerPage(browser, name, trace, tag) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const requests = [];
  page.on("request", (r) => {
    if (r.url().startsWith(API) && r.method() !== "GET" && r.method() !== "OPTIONS")
      requests.push({ method: r.method(), path: new URL(r.url()).pathname, key: r.headers()["idempotency-key"] ?? null, body: r.postData() });
  });
  page.on("response", async (r) => {
    if (r.url().startsWith(API) && r.request().method() === "POST") {
      const entry = requests.findLast((q) => q.path === new URL(r.url()).pathname && q.status === undefined);
      if (entry) {
        entry.status = r.status();
        try {
          const j = await r.json();
          entry.response = { orderId: j.orderId, status: j.status, totalAmount: j.totalAmount, code: j.details?.reason ?? j.code };
        } catch {}
      }
    }
  });
  await page.goto(`${CONSUMER}/login`);
  await page.getByRole("radio").filter({ hasText: name }).click();
  await page.getByRole("button", { name: /로그인$/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  const shot = async (label) => {
    const file = path.join(OUT, trace.case, `${tag}-${label}.png`);
    mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true });
    trace.screenshots.push(path.relative(root, file));
  };
  return { context, page, requests, shot };
}
async function openCheckout(page, { option = "5kg", qty = 1 } = {}) {
  await page.goto(`${CONSUMER}/products/p-house`);
  await page.getByRole("button", { name: "예약하기" }).click();
  await page.getByRole("radio").filter({ hasText: option }).first().click();
  for (let i = 1; i < qty; i++) await page.getByRole("button", { name: "더하기" }).click();
  const addresses = page.waitForResponse((r) => r.url().endsWith("/api/auth/me/addresses") && r.request().method() === "GET");
  await page.getByRole("button", { name: "주문서로" }).click();
  const list = await (await addresses).json();
  return list.length;
}
async function enterAddress(page, savedCount, { postal, address, detail, name = "평가 구매자", phone = "010-0000-0168" }) {
  if (savedCount === 0) await page.getByRole("button", { name: "받는 사람과 주소 입력" }).click();
  else {
    await page.getByRole("button", { name: "다른 배송지" }).click();
    await page.getByRole("button", { name: "새 주소 입력" }).click();
  }
  await page.getByLabel("받는 사람").fill(name);
  await page.getByLabel("연락처").fill(phone);
  await page.getByLabel("우편번호").fill(postal);
  await page.getByRole("textbox", { name: "주소", exact: true }).fill(address);
  await page.getByLabel("상세 주소").fill(detail);
  await page.getByRole("button", { name: "이 주소로 받기" }).click();
}
const CONSENT_TITLES = ["받는 시기", "지연 시 환불", "흉작·수량 부족", "취소·반품 조건", "개인정보 제3자 제공 (판매자)"];
async function checkConsents(page, titles = CONSENT_TITLES) {
  for (const title of titles) await page.getByRole("checkbox", { name: title, exact: true }).click();
}
const visible = async (locator) => {
  try {
    await locator.filter({ visible: true }).first().waitFor({ state: "visible", timeout: 8000 });
    return true;
  } catch {
    return false;
  }
};
const won = (n) => `${n.toLocaleString("ko-KR")}원`;

// ---------- 기록 ----------
function newTrace(id) {
  return { case: id, baseline: BASELINE, startUtc: new Date().toISOString(), fixture: {}, steps: [], assertions: [], screenshots: [] };
}
function assert(trace, id, expected, observed, pass) {
  trace.assertions.push({ id, expected, observed, pass: Boolean(pass) });
}
function finish(trace) {
  trace.endUtc = new Date().toISOString();
  trace.verdict = trace.assertions.every((a) => a.pass) ? "PASS" : "FAIL";
  writeFileSync(path.join(OUT, `${trace.case}.json`), JSON.stringify(trace, null, 2));
  console.log(`${trace.case}: ${trace.verdict} (${trace.assertions.filter((a) => a.pass).length}/${trace.assertions.length})`);
  for (const a of trace.assertions.filter((x) => !x.pass)) console.log(`  ✗ ${a.id}: ${JSON.stringify(a.observed)}`);
}
async function reset(trace, fixedNow = CLOCK) {
  await startApi(fixedNow);
  trace.fixture.reset = { ...reseed(), clock: fixedNow, at: new Date().toISOString() };
}

// ---------- 행 ----------
const ROWS = {};

ROWS["I3-PRE-01"] = async (browser) => {
  const t = newTrace("I3-PRE-01");
  await reset(t);
  const kang = await login("u-kang", "producer");
  const patched = await patchProduct(kang, { shippingFeeType: "SEPARATE", shippingFee: 4000, remoteAreaFee: 3000 });
  t.fixture.product = { id: "p-house", patchStatus: patched.status, shippingFeeType: patched.json?.shippingFeeType, shippingFee: patched.json?.shippingFee, remoteAreaFee: patched.json?.remoteAreaFee, maxQuantityPerOrder: patched.json?.maxQuantityPerOrder, stage: "st-house-1", option: "opt-5", unitPrice: 29000 };
  const before = { ids: orderIds("u-minji"), alloc: allocation("st-house-1", "opt-5"), payments: Number(sql("select count(*) from payments")) };
  t.fixture.before = { minjiOrders: before.ids.length, allocation: before.alloc, payments: before.payments };

  const c = await consumerPage(browser, "김민지", t, "consumer");
  const saved = await openCheckout(c.page, { option: "5kg", qty: 2 });
  await enterAddress(c.page, saved, { postal: "63584", address: "제주특별자치도 서귀포시 평가로 1", detail: "1호" });
  await checkConsents(c.page);
  const expectedTotal = 29000 * 2 + 4000 + 3000;
  const sheet = {
    goods: await visible(c.page.getByText(won(58000))),
    shipping: await visible(c.page.getByText(won(4000))),
    remote: await visible(c.page.getByText("도서산간 추가 운임")),
    total: await visible(c.page.getByText(won(expectedTotal))),
  };
  await c.shot("01-order-sheet");
  assert(t, "sheet_total_breakdown", `상품 ${won(58000)}, 배송비 ${won(4000)}, 도서산간 ${won(3000)}, 합계 ${won(expectedTotal)} 표시`, sheet, Object.values(sheet).every(Boolean));
  await c.page.getByRole("button", { name: "예약하기" }).click();
  await c.page.waitForURL(/\/pay/, { timeout: 15000 });
  await c.page.getByText("입금할 금액").waitFor();
  const orderId = new URL(c.page.url()).searchParams.get("orderId");
  t.steps.push({ step: "submit", requests: c.requests.map(({ body, ...r }) => r) });
  const creates = c.requests.filter((r) => r.path === "/api/orders");
  const deposits = c.requests.filter((r) => r.path.endsWith("/deposit"));
  assert(t, "one_keyed_request", "POST /api/orders 1회(멱등 키 1개) + 입금 안내 1회", { creates: creates.length, createKeys: [...new Set(creates.map((r) => r.key))].length, deposits: deposits.length }, creates.length === 1 && creates[0].key && deposits.length === 1 && deposits[0].key);

  const minji = await login("u-minji", "consumer");
  const order = (await call("GET", `/api/orders/${orderId}`, { token: minji })).json;
  t.steps.push({ step: "consumer order", order: { orderId, orderNo: order.orderNo, status: order.status, unitPrice: order.unitPrice, quantity: order.quantity, shippingFee: order.shippingFee, remoteAreaFee: order.remoteAreaFee, totalAmount: order.totalAmount, depositDueAt: order.depositDueAt, hasAccount: !!order.depositAccount } });
  assert(t, "total_formula", `total = 29000×2 + 4000 + 3000 = ${expectedTotal}`, { unitPrice: order.unitPrice, quantity: order.quantity, shippingFee: order.shippingFee, remoteAreaFee: order.remoteAreaFee, totalAmount: order.totalAmount }, order.totalAmount === expectedTotal && order.unitPrice * order.quantity + order.shippingFee + order.remoteAreaFee === order.totalAmount);
  const [consentAt, consentVersion] = sql(`select consent_at, consent_version from orders where id='${orderId}'`).split("|");
  assert(t, "consent_stored", `consent_at 기록, consent_version=${CONSENT_VERSION}`, { consentAt, consentVersion }, !!consentAt && consentVersion === CONSENT_VERSION);
  const created = newOrders("u-minji", before.ids);
  const after = allocation("st-house-1", "opt-5");
  assert(t, "one_awaiting_order_one_hold", "새 주문 1건 AWAITING_DEPOSIT, 단계 물량 선점 +2 한 번", { newOrders: created, reservedBefore: before.alloc.reserved, reservedAfter: after.reserved }, created.length === 1 && created[0].status === "AWAITING_DEPOSIT" && after.reserved - before.alloc.reserved === 2);

  const acct = order.depositAccount ?? {};
  const pay = {
    amount: await visible(c.page.getByText(won(expectedTotal))),
    item: await visible(c.page.getByText(/5kg × 2/)),
    account: acct.accountNumber ? await visible(c.page.getByText(acct.accountNumber)) : false,
    depositorIsOrderNo: await visible(c.page.getByText(order.orderNo)),
    intermediary: await visible(c.page.getByText("farmclub은 통신판매중개자예요")),
  };
  await c.shot("02-deposit-instruction");
  assert(t, "deposit_instruction", "입금 안내에 금액·품목·농가 계좌·입금자명(주문 번호)·중개자 고지", pay, Object.values(pay).every(Boolean));

  // 생산자 입금 대기 화면·API
  const prodApi = (await call("GET", "/api/orders/producer?status=AWAITING_DEPOSIT&limit=50", { token: kang })).json.items.find((o) => o.orderId === orderId);
  const pctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pp = await pctx.newPage();
  await pp.addInitScript(() => localStorage.setItem("farmclub-producer:help-guide-seen", "1"));
  await pp.goto(`${PRODUCER}/login`);
  await pp.getByRole("radio", { name: /강영수/ }).click();
  await pp.getByRole("button", { name: /시작하기$/ }).click();
  await pp.waitForURL((u) => !u.pathname.startsWith("/login"));
  await pp.goto(`${PRODUCER}/ship?status=AWAITING_DEPOSIT`);
  const prodUi = {
    approveButton: await visible(pp.getByRole("button", { name: `${order.orderNo} 입금 승인`, exact: true })),
    amount: await visible(pp.getByText(won(expectedTotal))),
    item: await visible(pp.getByText(/5kg × 2/)),
  };
  const pshot = path.join(OUT, t.case, "producer-03-awaiting-deposit.png");
  await pp.screenshot({ path: pshot, fullPage: true });
  t.screenshots.push(path.relative(root, pshot));
  t.steps.push({ step: "producer view", api: prodApi && { orderNo: prodApi.orderNo, status: prodApi.status, optionLabel: prodApi.optionLabel, quantity: prodApi.quantity, totalAmount: prodApi.totalAmount }, ui: prodUi });
  assert(t, "producer_agrees", "생산자 입금 대기 목록(API·화면)과 소비자 안내의 품목·금액·상태 일치", { api: prodApi && { status: prodApi.status, item: `${prodApi.optionLabel} × ${prodApi.quantity}`, total: prodApi.totalAmount }, ui: prodUi }, prodApi && prodApi.status === "AWAITING_DEPOSIT" && prodApi.totalAmount === expectedTotal && prodApi.quantity === 2 && prodApi.optionLabel === "5kg" && Object.values(prodUi).every(Boolean));

  // 소비자 목록 탭: 입금 대기는 '입금 대기'로만 보이고 결제된 상태(예약 완료·확정)로 보이지 않는다
  await c.page.goto(`${CONSUMER}/orders?filter=pending`);
  const pendingCard = await visible(c.page.getByText("입금 대기 · 입금해 주세요"));
  await c.shot("04-orders-pending-tab");
  await c.page.goto(`${CONSUMER}/orders?filter=confirmed`);
  await c.page.getByRole("tab", { name: /확정/ }).first().waitFor();
  await c.page.waitForTimeout(1500);
  const inConfirmed = await c.page.getByText(order.orderNo).count() + (await c.page.getByText("입금 대기 · 입금해 주세요").count());
  await c.shot("05-orders-confirmed-tab");
  const list = (await call("GET", "/api/orders?limit=50", { token: minji })).json.items;
  const listed = list.find((o) => o.orderId === orderId);
  // 결제 전(PENDING_PAYMENT) 주문은 어느 탭에도 없다: 입금 안내 전 주문 하나를 API로 만든다
  const unpaid = (await call("POST", "/api/orders", { token: minji, key: key("unpaid"), body: orderBody() })).json;
  const list2 = (await call("GET", "/api/orders?limit=50", { token: minji })).json.items;
  await c.page.goto(`${CONSUMER}/orders?filter=pending`);
  await c.page.waitForTimeout(1500);
  const unpaidVisible = await c.page.getByText(unpaid.orderNo).count();
  assert(t, "unpaid_absent_from_paid_tabs", "입금 대기 주문은 '입금 대기' 카드로만(미확정 탭), 확정 탭·결제 상태 문구에 없음; 결제 전(PENDING_PAYMENT) 주문은 목록에 없음", { pendingCard, inConfirmedTab: inConfirmed, listedStatus: listed?.status, unpaidOrderStatus: unpaid.status, unpaidInApiList: list2.some((o) => o.orderId === unpaid.orderId), unpaidOnScreen: unpaidVisible }, pendingCard && inConfirmed === 0 && listed?.status === "AWAITING_DEPOSIT" && unpaid.status === "PENDING_PAYMENT" && !list2.some((o) => o.orderId === unpaid.orderId) && unpaidVisible === 0);
  const pays = Number(sql(`select count(*) from payments where order_id='${orderId}'`));
  const paidAt = sql(`select coalesce(paid_at::text,'') from orders where id='${orderId}'`);
  assert(t, "no_money_moved", "결제 기록 0건, paid_at 없음(입금 확인 미실행)", { paymentsForOrder: pays, paidAt: paidAt || null, paymentsTotalDelta: Number(sql("select count(*) from payments")) - before.payments }, pays === 0 && !paidAt);
  await c.context.close();
  await pctx.close();
  finish(t);
};

ROWS["I3-PRE-02"] = async (browser) => {
  const t = newTrace("I3-PRE-02");
  await reset(t);
  const kang = await login("u-kang", "producer");
  const p0 = await producerProduct(kang);
  t.fixture.product = { id: "p-house", maxQuantityPerOrder: p0.maxQuantityPerOrder };
  // 화면: 수량은 1~3만 고를 수 있다
  const c = await consumerPage(browser, "김민지", t, "consumer");
  await c.page.goto(`${CONSUMER}/products/p-house`);
  await c.page.getByRole("button", { name: "예약하기" }).click();
  await c.page.getByRole("radio").filter({ hasText: "5kg" }).first().click();
  const minus = c.page.getByRole("button", { name: "빼기" });
  const plus = c.page.getByRole("button", { name: "더하기" });
  const atOne = await minus.isDisabled();
  for (let i = 0; i < 5; i++) if (!(await plus.isDisabled())) await plus.click();
  const ui = { minusDisabledAt1: atOne, plusDisabledAt3: await plus.isDisabled(), maxCaption: await visible(c.page.getByText("한 번에 최대 3개")), shown: await visible(c.page.getByText(/5kg ×\s*3/)) };
  await c.shot("01-quantity-max");
  await c.context.close();
  // 서버: 0·4 거부, 주문 없음
  const minji = await login("u-minji", "consumer");
  const beforeIds = orderIds("u-minji");
  const q0 = await call("POST", "/api/orders", { token: minji, key: key("q0"), body: orderBody({ quantity: 0 }) });
  const q4 = await call("POST", "/api/orders", { token: minji, key: key("q4"), body: orderBody({ quantity: 4 }) });
  const createdBad = newOrders("u-minji", beforeIds);
  t.steps.push({ step: "invalid quantity", ui, q0: { status: q0.status, code: q0.json?.details?.reason }, q4: { status: q4.status, code: q4.json?.details?.reason }, newOrders: createdBad });
  assert(t, "invalid_quantity_rejected", "수량 0·4 거부(화면 1~3, 서버 4xx), 주문 생성 없음", { ui, q0: [q0.status, q0.json?.details?.reason], q4: [q4.status, q4.json?.details?.reason], newOrders: createdBad.length }, ui.minusDisabledAt1 && ui.plusDisabledAt3 && ui.maxCaption && q0.status >= 400 && q0.status < 500 && q4.status >= 400 && q4.status < 500 && createdBad.length === 0);

  // 마지막 한 개: st-house-1 opt-10 물량을 예약 수 + 1로 둔다(생산자 단계 저장 API)
  const a0 = allocation("st-house-1", "opt-10");
  const set = await setStagePrice(kang, "st-house-1", "opt-10", { quantity: a0.reserved + 1 });
  const a1 = allocation("st-house-1", "opt-10");
  t.fixture.lastUnit = { stage: "st-house-1", option: "opt-10", putStatus: set.status, before: a0, after: a1 };
  const seojun = await login("u-seojun", "consumer");
  const known = { minji: orderIds("u-minji"), seojun: orderIds("u-seojun") };
  const body10 = orderBody({ optionId: "opt-10" });
  const [ca, cb] = await Promise.all([
    call("POST", "/api/orders", { token: minji, key: key("lastA"), body: body10 }),
    call("POST", "/api/orders", { token: seojun, key: key("lastB"), body: { ...body10, recipientName: "평가 구매자B" } }),
  ]);
  const [da, db] = await Promise.all([
    ca.json?.orderId ? call("POST", `/api/orders/${ca.json.orderId}/deposit`, { token: minji, key: key("depA") }) : null,
    cb.json?.orderId ? call("POST", `/api/orders/${cb.json.orderId}/deposit`, { token: seojun, key: key("depB") }) : null,
  ]);
  const a2 = allocation("st-house-1", "opt-10");
  const results = [
    { who: "u-minji", create: [ca.status, ca.json?.status ?? ca.json?.details?.reason], deposit: da && [da.status, da.json?.status ?? da.json?.details?.reason] },
    { who: "u-seojun", create: [cb.status, cb.json?.status ?? cb.json?.details?.reason], deposit: db && [db.status, db.json?.status ?? db.json?.details?.reason] },
  ];
  const holders = [...newOrders("u-minji", known.minji), ...newOrders("u-seojun", known.seojun)].filter((o) => o.status === "AWAITING_DEPOSIT");
  t.steps.push({ step: "concurrent last unit", results, allocationAfter: a2, holders });
  const wins = [da, db].filter((r) => r?.status === 200 && r.json.status === "AWAITING_DEPOSIT").length;
  const loser = [da, db].find((r) => r && r.status !== 200);
  assert(t, "one_last_unit_winner", "동시 요청 중 하나만 입금 대기(선점)", { wins, holders: holders.length }, wins === 1 && holders.length === 1);
  assert(t, "loser_conflict", "다른 하나는 품절/한도 409", loser && { status: loser.status, code: loser.json?.details?.reason, message: loser.json?.message }, loser && loser.status === 409 && ["SOLD_OUT", "TOTAL_LIMIT_REACHED", "QUANTITY_LIMIT"].includes(loser.json?.details?.reason));
  const negatives = Number(sql("select count(*) from stage_allocations where reserved_count > quantity or reserved_count < 0"));
  assert(t, "stock_never_negative", "예약 수 ≤ 물량(남은 물량 ≥ 0), 음수 없음", { allocation: a2, remaining: a2.quantity - a2.reserved, violatingRows: negatives }, a2.reserved === a2.quantity && negatives === 0);
  finish(t);
};

ROWS["I3-PRE-03"] = async (browser) => {
  const t = newTrace("I3-PRE-03");
  await reset(t);
  const kang = await login("u-kang", "producer");
  const minji = await login("u-minji", "consumer");
  const beforeIds = orderIds("u-minji");
  const c = await consumerPage(browser, "김민지", t, "consumer");
  const saved = await openCheckout(c.page, { option: "10kg", qty: 2 });
  await enterAddress(c.page, saved, { postal: "04524", address: "서울특별시 중구 평가로 3", detail: "3호", name: "평가 수정확인" });
  await checkConsents(c.page, CONSENT_TITLES.slice(0, 4));
  const reserve = c.page.getByRole("button", { name: "예약하기" });
  const ui = { disabled: await reserve.isDisabled(), countText: await visible(c.page.getByText("5개 중 4개 동의했어요. 모두 동의하면 예약할 수 있어요.")) };
  await reserve.click({ force: true }).catch(() => {});
  await c.page.waitForTimeout(800);
  ui.createRequests = c.requests.filter((r) => r.path === "/api/orders").length;
  await c.shot("01-missing-consent");
  const server = await call("POST", "/api/orders", { token: minji, key: key("noconsent"), body: orderBody({ consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: false } }) });
  const afterConsent = newOrders("u-minji", beforeIds);
  t.steps.push({ step: "missing consent", ui, server: { status: server.status, code: server.json?.details?.reason, fields: server.json?.details?.fields }, newOrders: afterConsent });
  assert(t, "missing_consent_rejected", "화면: 버튼 꺼짐·요청 없음; 서버: 400 consents; 주문 없음", { ui, server: [server.status, server.json?.details?.fields] , newOrders: afterConsent.length }, ui.disabled && ui.countText && ui.createRequests === 0 && server.status === 400 && server.json?.details?.fields?.consents && afterConsent.length === 0);

  // 판매 중지: 주문서를 연 채 생산자가 중지 → 예약하기
  await checkConsents(c.page, CONSENT_TITLES.slice(4));
  const paused = await setPaused(kang, true);
  t.fixture.paused = { putStatus: paused.status, salesPaused: paused.json?.salesPaused };
  await reserve.click();
  await c.page.waitForTimeout(2500);
  const createResp = c.requests.filter((r) => r.path === "/api/orders").at(-1);
  const retained = {
    stillOnCheckout: /\/checkout\/p-house/.test(c.page.url()) && !/\/pay/.test(c.page.url()),
    recipient: await visible(c.page.getByText(/평가 수정확인/)),
    address: await visible(c.page.getByText(/평가로 3/)),
    choice: await visible(c.page.getByText(/10kg ×\s*2/)),
    consentsStillChecked: await c.page.getByRole("checkbox", { name: "모두 동의해요" }).isChecked().catch(() => null),
  };
  const notice = await c.page.getByText("농가가 잠시 예약을 쉬고 있어요.").count();
  const buttonLabel = await c.page.getByRole("button", { name: /예약하기/ }).first().textContent().catch(() => null);
  await c.shot("02-paused");
  const direct = await call("POST", "/api/orders", { token: minji, key: key("paused"), body: orderBody() });
  const afterPause = newOrders("u-minji", beforeIds);
  t.steps.push({ step: "paused sale", ui: { create: createResp && { status: createResp.status, code: createResp.response?.code }, retained, notice, buttonLabel }, direct: { status: direct.status, code: direct.json?.details?.reason }, newOrders: afterPause });
  assert(t, "paused_rejected", "중지된 판매 예약 거부(화면 요청·API 모두 409 SALES_PAUSED), 주문 없음", { ui: createResp && [createResp.status, createResp.response?.code], api: [direct.status, direct.json?.details?.reason], newOrders: afterPause.length }, createResp?.status === 409 && createResp.response?.code === "SALES_PAUSED" && direct.status === 409 && direct.json?.details?.reason === "SALES_PAUSED" && afterPause.length === 0);
  assert(t, "input_retained", "주소·받는 사람·옵션×수량이 그대로 남아 고칠 수 있음", retained, retained.stillOnCheckout && retained.recipient && retained.address && retained.choice);
  t.observations = { pausedNoticeShown: notice > 0, buttonLabelAfterPause: buttonLabel };
  await c.context.close();
  finish(t);
};

ROWS["I3-PRE-04"] = async (browser) => {
  const t = newTrace("I3-PRE-04");
  await reset(t);
  const minji = await login("u-minji", "consumer");
  const beforeIds = orderIds("u-minji");
  const a0 = allocation("st-house-1", "opt-5");
  t.fixture.before = { minjiOrders: beforeIds.length, allocation: a0 };
  const c = await consumerPage(browser, "김민지", t, "consumer");
  const saved = await openCheckout(c.page, { option: "5kg", qty: 1 });
  await enterAddress(c.page, saved, { postal: "06236", address: "서울특별시 강남구 평가로 4", detail: "4호" });
  await checkConsents(c.page);
  // 첫 주문 요청: 서버까지 보내 커밋시킨 뒤 브라우저에는 응답을 끊는다(응답 유실)
  let lost = null;
  await c.page.route(`${API}/api/orders`, async (route) => {
    if (route.request().method() !== "POST" || lost) return route.continue();
    const resp = await route.fetch();
    const j = await resp.json();
    lost = { status: resp.status(), orderId: j.orderId, totalAmount: j.totalAmount };
    await route.abort("connectionreset");
  });
  await c.page.getByRole("button", { name: "예약하기" }).click();
  const toast = await visible(c.page.getByText("연결이 불안정해요"));
  await c.shot("01-lost-response-toast");
  const afterLost = newOrders("u-minji", beforeIds);
  t.steps.push({ step: "lost response", lost, toast, dbAfterLost: afterLost });
  await c.page.getByText("연결이 불안정해요").locator("xpath=..").getByRole("button").first().click();
  await c.page.waitForURL(/\/pay/, { timeout: 15000 });
  const orderId = new URL(c.page.url()).searchParams.get("orderId");
  await c.shot("02-pay-after-retry");
  const creates = c.requests.filter((r) => r.path === "/api/orders");
  t.steps.push({ step: "retry", requests: c.requests.map(({ body, ...r }) => r) });
  const afterRetry = newOrders("u-minji", beforeIds);
  const a1 = allocation("st-house-1", "opt-5");
  assert(t, "retry_same_order", "응답 유실 뒤 같은 키 재전송 → 같은 주문·금액, 주문 1건, 선점 1회", { lost, creates: creates.map((r) => ({ key: r.key, status: r.status, orderId: r.response?.orderId })), payOrderId: orderId, newOrders: afterRetry, reservedDelta: a1.reserved - a0.reserved }, lost?.status === 200 && creates.length === 2 && creates[0].key === creates[1].key && creates[1].response?.orderId === lost.orderId && orderId === lost.orderId && afterRetry.length === 1 && afterRetry[0].status === "AWAITING_DEPOSIT" && a1.reserved - a0.reserved === 1);

  // API: 같은 키 같은 본문 / 같은 키 다른 본문 / 입금 안내 재요청
  const sentBody = JSON.parse(creates[0].body);
  const replay = await call("POST", "/api/orders", { token: minji, key: creates[0].key, body: sentBody });
  const changed = await call("POST", "/api/orders", { token: minji, key: creates[0].key, body: { ...sentBody, quantity: 2 } });
  const depAgain = await call("POST", `/api/orders/${orderId}/deposit`, { token: minji, key: key("dep-again") });
  const a2 = allocation("st-house-1", "opt-5");
  t.steps.push({ step: "api replay", replay: { status: replay.status, orderId: replay.json?.orderId, totalAmount: replay.json?.totalAmount, status_: replay.json?.status }, changed: { status: changed.status, code: changed.json?.details?.reason }, depositAgain: { status: depAgain.status, orderStatus: depAgain.json?.status }, allocation: a2 });
  assert(t, "same_key_same_body", "같은 키·같은 본문 → 같은 주문·금액(처음 결과)", { status: replay.status, orderId: replay.json?.orderId, totalAmount: replay.json?.totalAmount }, replay.status === 200 && replay.json?.orderId === orderId && replay.json?.totalAmount === lost.totalAmount);
  assert(t, "same_key_changed_body", "같은 키·다른 본문 → 409 충돌", { status: changed.status, code: changed.json?.details?.reason }, changed.status === 409 && changed.json?.details?.reason === "IDEMPOTENCY_MISMATCH");
  assert(t, "single_hold", "입금 안내를 다시 받아도 선점은 한 번", { depositAgain: [depAgain.status, depAgain.json?.status], reservedDelta: a2.reserved - a0.reserved, newOrders: newOrders("u-minji", beforeIds).length }, depAgain.status === 200 && a2.reserved - a0.reserved === 1 && newOrders("u-minji", beforeIds).length === 1);

  // 뒤로·새로고침
  // (1) 입금 안내에서 뒤로 → 주문서(앱 안 스택) → 다시 예약하기: 같은 키로 같은 주문이어야 한다
  const mark0 = c.requests.length;
  await c.page.goBack();
  await c.page.waitForURL((u) => !u.pathname.endsWith("/pay"), { timeout: 10000 }).catch(() => {});
  await c.page.waitForTimeout(1500);
  const backUrl0 = c.page.url();
  await c.shot("03a-back-to-sheet");
  const again = c.page.getByRole("button", { name: /예약하기$/ }).filter({ visible: true }).first();
  const againEnabled = await again.isEnabled().catch(() => false);
  if (againEnabled) {
    await again.click();
    await c.page.waitForURL(/\/pay/, { timeout: 15000 }).catch(() => {});
    await c.page.waitForTimeout(1000);
  }
  const backResubmit = { backUrl: backUrl0, againEnabled, landed: c.page.url(), requests: c.requests.slice(mark0).map(({ body, ...r }) => r) };
  const resubmitCreates = backResubmit.requests.filter((r) => r.path === "/api/orders");
  t.steps.push({ step: "back then resubmit", backResubmit, newOrders: newOrders("u-minji", beforeIds) });
  assert(t, "back_resubmit_same_order", "뒤로 간 주문서에서 다시 예약하기 → 같은 멱등 키·같은 주문(추가 주문 없음)", { againEnabled, creates: resubmitCreates.map((r) => ({ key: r.key, sameKey: r.key === creates[0].key, orderId: r.response?.orderId })), landed: backResubmit.landed.replace(CONSUMER, ""), newOrders: newOrders("u-minji", beforeIds).length }, newOrders("u-minji", beforeIds).length === 1 && (!againEnabled || resubmitCreates.length > 0) && resubmitCreates.every((r) => r.key === creates[0].key && r.response?.orderId === orderId));
  // (2) 입금 안내 새로고침, 주문 상세 새로고침
  const mark = c.requests.length;
  await c.page.reload();
  await c.page.getByText("입금할 금액").waitFor();
  await c.page.waitForTimeout(1000);
  const reloadPay = { url: c.page.url(), mutating: c.requests.slice(mark).map(({ body, ...r }) => r) };
  const mark2 = c.requests.length;
  await c.page.goto(`${CONSUMER}/orders/${orderId}`);
  await c.page.reload();
  await c.page.waitForTimeout(2000);
  await c.shot("04-detail-reload");
  const detailMutating = c.requests.slice(mark2).map(({ body, ...r }) => r);
  const finalOrders = newOrders("u-minji", beforeIds);
  const a3 = allocation("st-house-1", "opt-5");
  t.steps.push({ step: "reload", reloadPay, detailMutating, finalOrders, allocation: a3 });
  assert(t, "reload_no_extra_order", "입금 안내 새로고침·상세 새로고침 뒤에도 주문 1건, 추가 쓰기 요청 없음", { reloadPayMutating: reloadPay.mutating.length, detailMutating: detailMutating.length, newOrders: finalOrders.length, reservedDelta: a3.reserved - a0.reserved }, reloadPay.mutating.length === 0 && detailMutating.length === 0 && finalOrders.length === 1 && a3.reserved - a0.reserved === 1);
  await c.context.close();
  finish(t);
};

ROWS["I3-PRE-05"] = async (browser) => {
  const t = newTrace("I3-PRE-05");
  await reset(t);
  const kang = await login("u-kang", "producer");
  const minji = await login("u-minji", "consumer");
  const seojun = await login("u-seojun", "consumer");
  // 기한 초과 픽스처: 이서준의 입금 대기 2건(하나는 '입금했어요' 신호)
  const mk = async (optionId, label) => {
    const o = (await call("POST", "/api/orders", { token: seojun, key: key(label), body: orderBody({ optionId, recipientName: "평가 기한" }) })).json;
    return (await call("POST", `/api/orders/${o.orderId}/deposit`, { token: seojun, key: key(`${label}-dep`) })).json;
  };
  const noHint = await mk("opt-5", "nohint");
  const withHint = await mk("opt-10", "hint");
  const reported = await call("POST", `/api/orders/${withHint.orderId}/deposit-reported`, { token: seojun });
  t.fixture.overdue = { noHint: { orderId: noHint.orderId, status: noHint.status, unitPrice: noHint.unitPrice, totalAmount: noHint.totalAmount, depositDueAt: noHint.depositDueAt }, withHint: { orderId: withHint.orderId, status: withHint.status, depositDueAt: withHint.depositDueAt, reportedStatus: reported.status, depositReportedAt: reported.json?.depositReportedAt } };
  const old = (await call("GET", "/api/orders/o-42", { token: minji })).json;
  const snapBefore = { o42: { unitPrice: old.unitPrice, totalAmount: old.totalAmount, status: old.status }, noHint: { unitPrice: noHint.unitPrice, totalAmount: noHint.totalAmount } };

  // 주문서를 연 뒤 생산자가 지금 단계 가격을 바꾼다
  const beforeIds = orderIds("u-minji");
  const c = await consumerPage(browser, "김민지", t, "consumer");
  const saved = await openCheckout(c.page, { option: "5kg", qty: 1 });
  await enterAddress(c.page, saved, { postal: "06236", address: "서울특별시 강남구 평가로 5", detail: "5호", name: "평가 단계변경" });
  await checkConsents(c.page);
  const shownBefore = await visible(c.page.getByText(won(29000)).first());
  await c.shot("01-sheet-before-change");
  const put = await setStagePrice(kang, "st-house-1", "opt-5", { price: 30000 });
  t.fixture.stageChange = { stage: "st-house-1", option: "opt-5", from: 29000, to: 30000, putStatus: put.status };
  await c.page.getByRole("button", { name: "예약하기" }).click();
  await c.page.waitForTimeout(3000);
  const firstCreate = c.requests.find((r) => r.path === "/api/orders");
  const afterSubmit = { url: c.page.url(), create: firstCreate && { status: firstCreate.status, code: firstCreate.response?.code, totalAmount: firstCreate.response?.totalAmount } };
  await c.shot("02-after-submit");
  const notice = await visible(c.page.getByText(/바뀌었어요/));
  const retained = { recipient: await visible(c.page.getByText(/평가 단계변경/)), choice: await visible(c.page.getByText(/5kg ×\s*1/)) };
  const reconfirmButton = await visible(c.page.getByRole("button", { name: "바뀐 금액으로 예약하기" }));
  let confirmed = null;
  if (reconfirmButton) {
    await c.page.getByRole("button", { name: "바뀐 금액으로 예약하기" }).click();
    await c.page.waitForURL(/\/pay/, { timeout: 15000 }).catch(() => {});
    confirmed = { url: c.page.url() };
    await c.shot("03-after-reconfirm");
  }
  const created = newOrders("u-minji", beforeIds);
  t.steps.push({ step: "stage change before submit", shownBefore, afterSubmit, notice, retained, reconfirmButton, confirmed, requests: c.requests.map(({ body, ...r }) => r), newOrders: created });
  assert(t, "renewed_confirmation", "제출 시 409 STAGE_CHANGED → 바뀐 가격 안내·입력 유지·다시 확인 뒤에만 주문", { shownPriceBefore: 29000, firstCreate: afterSubmit.create, landedOn: afterSubmit.url.replace(CONSUMER, ""), notice, retained, reconfirmButton, ordersCreated: created.map((o) => ({ status: o.status, unitPrice: o.unitPrice, total: o.total })) }, afterSubmit.create?.status === 409 && afterSubmit.create.code === "STAGE_CHANGED" && notice && retained.recipient && retained.choice && reconfirmButton);
  const o42 = (await call("GET", "/api/orders/o-42", { token: minji })).json;
  const nh = (await call("GET", `/api/orders/${noHint.orderId}`, { token: seojun })).json;
  const snapAfter = { o42: { unitPrice: o42.unitPrice, totalAmount: o42.totalAmount, status: o42.status }, noHint: { unitPrice: nh.unitPrice, totalAmount: nh.totalAmount } };
  assert(t, "old_snapshot_stable", "가격 변경 전 주문(o-42 예약 완료, 입금 대기 1건)의 단가·합계 그대로", { before: snapBefore, after: snapAfter }, JSON.stringify(snapBefore) === JSON.stringify(snapAfter));
  await c.context.close();

  // 기한 초과: 시계를 기한 뒤로 옮겨 API를 다시 띄운다(FIXED_NOW, 다른 데이터는 그대로)
  const r5 = allocation("st-house-1", "opt-5");
  const r10 = allocation("st-house-1", "opt-10");
  const later = "2026-10-08T10:30:00+09:00";
  await startApi(later);
  t.fixture.clockAdvanced = { to: later, reason: "입금 기한(안내 시각 + 24시간) 경과" };
  const seojun2 = await login("u-seojun", "consumer");
  const kang2 = await login("u-kang", "producer");
  const list = (await call("GET", "/api/orders?limit=50", { token: seojun2 })).json.items;
  const nh2 = list.find((o) => o.orderId === noHint.orderId);
  const wh2 = list.find((o) => o.orderId === withHint.orderId);
  const r5b = allocation("st-house-1", "opt-5");
  const r10b = allocation("st-house-1", "opt-10");
  const late = await call("POST", `/api/orders/${noHint.orderId}/confirm-deposit`, { token: kang2 });
  const admin = adminToken();
  const overdue = (await call("GET", "/admin/orders/deposit-overdue", { token: admin })).json;
  t.steps.push({ step: "expiry", noHint: nh2 && { status: nh2.status, cancelReason: nh2.cancelReason }, withHint: wh2 && { status: wh2.status, depositReportedAt: wh2.depositReportedAt }, reserved: { opt5: [r5.reserved, r5b.reserved], opt10: [r10.reserved, r10b.reserved] }, lateConfirm: { status: late.status, code: late.json?.details?.reason }, operatorOverdue: Array.isArray(overdue) ? overdue.map((o) => o.orderId) : overdue });
  assert(t, "overdue_no_hint_cancels", "신호 없는 기한 초과 주문 → 취소(사유 '입금 기한 초과'), 물량 1 반환, 늦은 입금 확인 409", { status: nh2?.status, cancelReason: nh2?.cancelReason, opt5Reserved: [r5.reserved, r5b.reserved], lateConfirm: [late.status, late.json?.details?.reason] }, nh2?.status === "CANCELED" && nh2.cancelReason === "입금 기한 초과" && r5.reserved - r5b.reserved === 1 && late.status === 409);
  assert(t, "overdue_with_hint_pending", "'입금했어요' 신호가 있는 기한 초과 주문 → 입금 대기 유지, 물량 유지, 운영자 목록에 표시", { status: wh2?.status, opt10Reserved: [r10.reserved, r10b.reserved], inOperatorList: Array.isArray(overdue) && overdue.some((o) => o.orderId === withHint.orderId) }, wh2?.status === "AWAITING_DEPOSIT" && r10.reserved === r10b.reserved && Array.isArray(overdue) && overdue.some((o) => o.orderId === withHint.orderId));
  await startApi(CLOCK);
  finish(t);
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ROWS);
const browser = await chromium.launch();
try {
  for (const id of wanted) {
    try {
      await ROWS[id](browser);
    } catch (error) {
      console.error(`${id}: harness error`, error);
      writeFileSync(path.join(OUT, `${id}.error.txt`), String(error?.stack ?? error));
    }
  }
} finally {
  await browser.close();
  await stopApi();
}
