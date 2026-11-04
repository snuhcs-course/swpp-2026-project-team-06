// I3-DISC-01..05 (DEV-166) — one planned execution per row on the isolated local stack (DEV-165).
// Usage: node scripts/i3-discovery/run.mjs [I3-DISC-01 ...]   (API :8000 and consumer web :8081 must be running)
// Each row: reseed the local DB → row setup (SQL on the local DB or producer API) → steps in Chromium → assertions.
// Raw traces/screenshots go to .artifacts/i3-journeys/<baseline>/ (gitignored). No production host is ever contacted.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const serverDir = path.join(root, "server");
const BASELINE = process.env.I3_BASELINE ?? "i3-b2-87792b7";
const API = process.env.FARMCLUB_API_URL ?? "http://localhost:8000";
const WEB = process.env.FARMCLUB_CONSUMER_URL ?? "http://localhost:8081";
const DB = process.env.I3_DB ?? "farmclub_i3_disc";
const out = path.join(root, ".artifacts", "i3-journeys", BASELINE);
mkdirSync(out, { recursive: true, mode: 0o700 });
for (const u of [API, WEB]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(u).hostname)) throw new Error(`local only: ${u}`);
}

const sh = (bin, args, cwd = root) => execFileSync(bin, args, { cwd, encoding: "utf8" }).trim();
const sql = (q) =>
  sh("docker", ["compose", "exec", "-T", "db", "psql", "-U", "farmclub", "-d", DB, "-tA", "-F", "|", "-c", q], serverDir);

function reset() {
  const envDb = sh("grep", ["^DATABASE_URL=", ".env"], serverDir);
  if (!envDb.endsWith(`/${DB}`)) throw new Error(`server/.env is not on ${DB}`);
  sh("uv", ["run", "python", "-m", "app.core.seed", "--reset"], serverDir);
  return {
    db: DB,
    alembic: sql("select version_num from alembic_version"),
    counts: sql(
      "select (select count(*) from farms)||' farms, '||(select count(*) from products)||' products, '||(select count(*) from follows)||' follows, '||(select count(*) from broadcasts)||' broadcasts, '||(select count(*) from thread_messages)||' thread messages'",
    ),
    at: new Date().toISOString(),
  };
}

async function api(p, { token, method = "GET", body } = {}) {
  const r = await fetch(API + p, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(method !== "GET" ? { "Idempotency-Key": `i3-disc-${Date.now()}-${Math.random().toString(36).slice(2)}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json };
}
const token = async (userId, app) =>
  (await api("/api/auth/test-login", { method: "POST", body: { userId, app } })).json.accessToken;

class Run {
  constructor(id) {
    this.id = id;
    this.steps = [];
    this.assertions = [];
    this.data = {};
    this.shots = [];
  }
  step(s) { this.steps.push({ at: new Date().toISOString(), s }); }
  check(id, expected, observed, pass) { this.assertions.push({ id, expected, observed, pass: !!pass }); }
  async shot(page, name) {
    const file = `${this.id}-${String(this.shots.length + 1).padStart(2, "0")}-${name}.png`;
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    this.shots.push(file);
  }
}

async function loginConsumer(page, name) {
  await page.goto(`${WEB}/login`);
  await page.getByRole("radio").filter({ hasText: name }).click();
  await page.getByRole("button", { name: /로그인$/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
const text = (page) => page.locator("body").innerText();
const order = (hay, names) => names.map((n) => hay.indexOf(n));
const homeProducts = (page) =>
  page.locator('[aria-label$=" 상품 상세"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label").replace(/ 상품 상세$/, "")));
const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
const APPROVED = ["강씨네 귤밭", "효돈 하우스농원", "한라네 과수원", "남원 귤빛농원"];

// ---------------- rows ----------------

async function disc01(run, page) {
  // Setup: farm A = f-halla / product A = p-noji (cultivar 한라봉) ends tomorrow 10-08; farm B = f-hyodon / p-hyodon ends next week 10-14.
  const setup = [
    "update farms set main_items='한라봉' where id='f-halla'",
    "update products set variety='한라봉', name='한라봉 10kg' where id='p-noji'",
    "update stages set ends_at='2026-10-08' where id='st-noji-1'",
    "update stages set starts_at='2026-10-09' where id='st-noji-2'",
    "update stages set ends_at='2026-10-14' where id='st-hyodon-1'",
    "update stages set starts_at='2026-10-15' where id='st-hyodon-2'",
  ];
  setup.forEach(sql);
  run.data.setup = setup;
  const A = { farm: "f-halla", farmName: "한라네 과수원", product: "p-noji", productName: "한라봉 10kg" };
  const B = { farm: "f-hyodon", farmName: "효돈 하우스농원", product: "p-hyodon", productName: "하우스 감귤 3kg" };

  await loginConsumer(page, "김민지");
  run.step("Login u-minji (consumer web), open home");
  const homeApi = (await api("/api/home")).json;
  run.data.homeApi = homeApi.recommended.map((c) => ({ id: c.productId, farm: c.farmId, price: c.currentPrice, ends: c.stageEndsAt, dDay: c.dDay }));
  await page.goto(WEB);
  await page.getByText("농가의 제철 상품").waitFor();
  await page.locator('[aria-label$=" 상품 상세"]').first().waitFor();
  const homeOrder = await homeProducts(page);
  run.data.homeUiOrder = homeOrder;
  await run.shot(page, "home");
  const [ia, ib] = [homeOrder.indexOf(A.productName), homeOrder.indexOf(B.productName)];
  run.check("home-reco-order", "추천 상품에서 A(10-08 마감)가 B(10-14 마감)보다 앞", `UI index A=${ia}, B=${ib}; API order ${run.data.homeApi.map((c) => c.id).join(" > ")}`, ia >= 0 && ib >= 0 && ia < ib);

  run.step("Open farm list (/farms)");
  const farmsApi = (await api("/api/farms")).json.items;
  run.data.farmsApi = farmsApi.map((f) => ({ id: f.farmId, featured: f.featured }));
  await page.goto(`${WEB}/farms`);
  await page.getByText(/마감 임박순 · 농가 \d+곳/).waitFor();
  const listText = await text(page);
  const [fa, fb] = order(listText, [A.farmName, B.farmName]);
  await run.shot(page, "farm-list");
  run.check("farm-list-order", "농가 목록에서 A가 B보다 위", `text offset A=${fa}, B=${fb}; API order ${farmsApi.map((f) => f.farmId).join(" > ")}`, fa >= 0 && fb >= 0 && fa < fb);

  run.step("Search 한라봉");
  const searchResp = page.waitForResponse((r) => r.url().includes("/api/farms?") && r.url().includes("q="));
  await page.getByLabel("농가 검색").fill("한라봉");
  const sr = await searchResp;
  const sj = await sr.json();
  await page.getByText(/마감 임박순 · 농가 \d+곳|찾는 농가가 없어요/).waitFor();
  await page.waitForTimeout(300);
  const st = await text(page);
  const shown = APPROVED.filter((n) => st.includes(n));
  run.data.search = { status: sr.status(), items: sj.items.map((f) => f.farmId), shown };
  await run.shot(page, "search-hallabong");
  run.check("search-finds-A-only", "‘한라봉’ 검색 결과에 A만 나온다", `API ${sr.status()} items=[${sj.items.map((f) => f.farmId)}]; UI farms shown=[${shown}]`, sj.items.length === 1 && sj.items[0].farmId === A.farm && shown.length === 1 && shown[0] === A.farmName);

  run.step("Open farm A from the search result, then product A");
  await page.getByText(A.farmName).locator("visible=true").first().click();
  await page.waitForURL(/\/farms\/f-halla/);
  const farmApi = (await api(`/api/farms/${A.farm}`)).json;
  const shelf = page.getByText(A.productName).locator("visible=true").first();
  await shelf.waitFor();
  await run.shot(page, "farm-A");
  const farmText = await text(page);
  await shelf.click();
  await page.waitForURL(/\/products\/p-noji/);
  await page.getByRole("button", { name: "예약하기" }).waitFor();
  const prodApi = (await api(`/api/products/${A.product}`)).json;
  const prodText = await text(page);
  await run.shot(page, "product-A");
  const dbPrice = Number(sql("select price from stage_prices where stage_id='st-noji-1' order by option_id limit 1"));
  const homeA = homeApi.recommended.find((c) => c.productId === A.product);
  const farmCardA = farmsApi.find((f) => f.farmId === A.farm);
  const farmProdA = farmApi.products.find((c) => c.productId === A.product);
  run.data.identity = {
    db: { price: dbPrice, ends: "2026-10-08" },
    home: homeA && { farm: homeA.farmId, name: homeA.name, price: homeA.currentPrice, ends: homeA.stageEndsAt, window: homeA.deliveryWindow },
    farmCard: farmCardA.featured,
    farmDetail: farmProdA && { name: farmProdA.name, price: farmProdA.currentPrice, ends: farmProdA.stageEndsAt, window: farmProdA.deliveryWindow },
    product: { farm: prodApi.farmId, farmName: prodApi.farmName, name: prodApi.name, variety: prodApi.variety, price: prodApi.currentPrice, ends: prodApi.stageEndsAt, dDay: prodApi.dDay, window: prodApi.deliveryWindow },
  };
  const views = [homeA, farmProdA, prodApi].filter(Boolean);
  const sameApi =
    views.length === 3 &&
    views.every((v) => v.farmId === A.farm && v.name === A.productName && v.currentPrice === dbPrice && v.stageEndsAt === "2026-10-08") &&
    farmCardA.featured?.productId === A.product && farmCardA.featured.currentPrice === dbPrice && farmCardA.featured.dDay === 1 &&
    prodApi.farmName === A.farmName;
  const uiHas = [A.productName, A.farmName, won(dbPrice), "마감 D-1"].map((s) => [s, prodText.includes(s)]);
  run.check("identity-price-period-agree", `홈·농가 카드·농가 상세·상품 상세의 농가/상품 ID·이름, 현재가 ${won(dbPrice)}(DB 단계 가격), 마감 10-08 일치`, `API views agree=${sameApi}; product UI contains ${uiHas.map(([s, v]) => `${s}:${v}`).join(", ")}; farm page lists A=${farmText.includes(A.productName)}`, sameApi && uiHas.every(([, v]) => v) && farmText.includes(A.productName));

  // Diagnostic, outside the planned denominator: is the product cultivar field itself searched?
  run.data.diagnostic = {
    note: "outside denominator — cultivar present only in products.variety",
    q_gungcheon: (await api(`/api/farms?q=${encodeURIComponent("궁천조생")}`)).json.items.map((f) => f.farmId),
    variety_of: Object.fromEntries(sql("select id||'='||variety from products where status='PUBLISHED' order by id").split("\n").map((l) => l.split("="))),
  };
}

async function disc02(run, page) {
  // Setup: no saleable products (other published products ended = CLOSED); p-noji sold out in its current stage, next stage 10-26.
  const setup = [
    "update products set status='CLOSED' where id in ('p-house','p-hyodon','p-redhyang')",
    "update stage_allocations set reserved_count=quantity where stage_id='st-noji-1'",
  ];
  setup.forEach(sql);
  run.data.setup = setup;
  run.data.allocations = sql("select stage_id||':'||option_id||' '||reserved_count||'/'||quantity from stage_allocations where product_id='p-noji' order by 1");
  await loginConsumer(page, "김민지");
  const homeApi = (await api("/api/home")).json;
  run.data.homeApi = { recommended: homeApi.recommended.map((c) => c.productId), farms: homeApi.farms.map((f) => f.farmId) };
  const newsApi = [];
  for (const f of homeApi.farms) newsApi.push(...(await api(`/api/messaging/farms/${f.farmId}/news?limit=3`)).json.items.map((n) => n.broadcastId));
  run.data.publicNewsIds = newsApi;
  run.step("Open home");
  await page.goto(WEB);
  await page.getByText("농가의 제철 상품").waitFor();
  await page.waitForLoadState("networkidle");
  const ht = await text(page);
  await run.shot(page, "home-no-saleable");
  const newsCards = await page.getByLabel("농가 소식 가로 목록").locator("img").count().catch(() => -1);
  run.check("home-no-saleable-message", "홈에 ‘현재 예약 가능한 상품이 없어요’", `recommended=${homeApi.recommended.length}; message shown=${ht.includes("현재 예약 가능한 상품이 없어요")}`, homeApi.recommended.length === 0 && ht.includes("현재 예약 가능한 상품이 없어요"));
  run.check("home-news-remains", "소식 목록은 그대로 보인다", `public news via API=${newsApi.length}; ‘첫 소식을 기다려요’ shown=${ht.includes("농가의 첫 소식을 기다려요")}; load error=${ht.includes("소식을 불러오지 못했어요")}; images in news carousel=${newsCards}`, newsApi.length > 0 && !ht.includes("농가의 첫 소식을 기다려요") && !ht.includes("소식을 불러오지 못했어요"));
  run.step("Open sold-out product /products/p-noji");
  await page.goto(`${WEB}/products/p-noji`);
  const reserve = page.getByRole("button", { name: "예약하기" });
  await reserve.waitFor();
  const p = (await api("/api/products/p-noji")).json;
  run.data.product = { soldOut: p.soldOut, availability: p.availability, nextStageStartsAt: p.nextStageStartsAt, currentStageId: p.currentStageId };
  const pt = await text(page);
  await run.shot(page, "product-sold-out");
  const disabled = (await reserve.isDisabled()) || (await reserve.getAttribute("aria-disabled")) === "true";
  run.check("product-sold-out-distinguished", "상품 상세가 품절을 구분해 보인다", `availability=${p.availability}, soldOut=${p.soldOut}; UI ‘이번 기간 품절’=${pt.includes("이번 기간 품절")}, ‘품절’=${pt.includes("품절")}`, p.soldOut && pt.includes("품절"));
  run.check("product-next-stage-date", "다음 단계 시작일(10월 26일)이 보인다", `nextStageStartsAt=${p.nextStageStartsAt}; UI ‘10월 26일’=${pt.includes("10월 26일")}`, p.nextStageStartsAt === "2026-10-26" && pt.includes("10월 26일"));
  run.check("reserve-disabled", "예약하기가 눌리지 않는다", `disabled=${disabled}`, disabled);
}

async function disc03(run, page) {
  run.data.setup = ["none (fault injected in the browser: first GET /api/farms?q=… answered 503 by a Playwright route; server never sees it)"];
  const Q = "한라네";
  let injected = 0;
  const seen = [];
  await page.route(/\/api\/farms\?.*q=/, async (route) => {
    seen.push(route.request().url());
    if (injected === 0) {
      injected += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "UNAVAILABLE", message: "일시적인 오류예요." }) });
    } else await route.continue();
  });
  await loginConsumer(page, "김민지");
  run.step("Open farm list, search 한라네 (farm A = f-halla in the unmutated seed; first search request fails with 503)");
  await page.goto(`${WEB}/farms`);
  await page.getByText(/마감 임박순 · 농가 \d+곳/).waitFor();
  const failed = page.waitForResponse((r) => r.url().includes("q=") && r.status() === 503);
  await page.getByLabel("농가 검색").fill(Q);
  await failed;
  await page.waitForTimeout(800);
  const ft = await text(page);
  await run.shot(page, "search-failed");
  const shownAfterFail = APPROVED.filter((n) => ft.includes(n));
  const countLine = (ft.match(/마감 임박순 · 농가 \d+곳/) || [""])[0];
  const errMsg = /불러오지 못했어요|다시 시도해 주세요|일시적인 오류/.test(ft);
  const retryBtn = await page.getByRole("button", { name: "다시 시도" }).count();
  run.data.afterFailure = { shownAfterFail, countLine, errMsg, retryButtons: retryBtn, zeroResults: ft.includes("찾는 농가가 없어요") };
  run.check("failure-visible", "검색 실패가 화면에 드러난다(오류 안내)", `error message=${errMsg}; ‘다시 시도’ buttons=${retryBtn}; list still shows [${shownAfterFail}] with ‘${countLine}’ under query ${Q}`, errMsg);
  run.check("failure-not-zero-results", "실패가 ‘결과 0건’처럼 보이지 않는다", `‘찾는 농가가 없어요’ shown=${ft.includes("찾는 농가가 없어요")}`, !ft.includes("찾는 농가가 없어요"));
  run.step("Retry from the failure state (the only retry control on screen: ‘다시 시도’)");
  if (retryBtn > 0) {
    const ok = page.waitForResponse((r) => r.url().includes("q=") && r.status() === 200);
    await page.getByRole("button", { name: "다시 시도" }).first().click();
    await ok;
  } else {
    run.step("No retry control; re-entering the query instead");
    await page.getByLabel("농가 검색").fill("");
    await page.waitForTimeout(500);
    const ok = page.waitForResponse((r) => r.url().includes("q=") && r.status() === 200);
    await page.getByLabel("농가 검색").fill(Q);
    await ok;
  }
  await page.waitForTimeout(800);
  const rt = await text(page);
  await run.shot(page, "search-retried");
  const occurrences = Object.fromEntries(APPROVED.map((n) => [n, rt.split(n).length - 1]));
  const cards = await page.getByRole("link").filter({ hasText: "제주" }).allInnerTexts();
  run.data.afterRetry = { occurrences, countLine: (rt.match(/마감 임박순 · 농가 \d+곳/) || [""])[0], cards: cards.map((c) => c.split("\n")[0]), requests: seen.length };
  const apiQ = (await api(`/api/farms?q=${encodeURIComponent(Q)}`)).json.items.map((f) => f.farmId);
  run.data.apiDirect = apiQ;
  run.check("retry-returns-A-no-duplicates", "재시도 성공 시 A가 나오고 카드가 중복되지 않는다(결과는 A 하나)", `cards after retry=[${run.data.afterRetry.cards}] (‘${run.data.afterRetry.countLine}’); API q=${Q} → [${apiQ}]`, run.data.afterRetry.cards.length === apiQ.length && run.data.afterRetry.cards.every((c, i, a) => a.indexOf(c) === i) && apiQ.length >= 1);
}

async function disc04(run, page) {
  // Setup: u-minji not following f-halla (seeded 1:1 thread thread-halla-minji kept), f-halla has one PUBLIC news.
  const setup = ["delete from follows where consumer_id='u-minji' and farm_id='f-halla'"];
  setup.forEach(sql);
  run.data.setup = setup;
  const before = sql("select id||' '||sender_type from thread_messages where thread_id='thread-halla-minji' order by created_at");
  const news = sql("select id||' '||visibility||' '||left(body,20) from broadcasts where farm_id='f-halla' and deleted_at is null");
  run.data.before = { threadMessages: before.split("\n"), news };
  const followCount = () => Number(sql("select count(*) from follows where consumer_id='u-minji' and farm_id='f-halla'"));
  let fail = true;
  await page.route(/\/api\/farms\/f-halla\/follow$/, async (route) => {
    if (route.request().method() === "PUT" && fail) {
      fail = false;
      await route.abort("failed");
    } else await route.continue();
  });
  await loginConsumer(page, "김민지");
  run.step("Open farm A room /farms/f-halla, click 팔로우 (first PUT aborted before reaching the server)");
  await page.goto(`${WEB}/farms/f-halla`);
  const btn = page.getByRole("button", { name: /^(팔로우|팔로잉)$/ });
  await btn.waitFor();
  const initial = (await btn.innerText()).trim();
  await btn.click();
  await page.waitForTimeout(1000);
  const ft = await text(page);
  await run.shot(page, "follow-failed");
  const afterFail = { button: (await btn.innerText()).trim(), rows: followCount(), message: (ft.match(/팔로우를 변경하지 못했어요|[^\n]*(네트워크|연결|실패|다시)[^\n]*/) || [null])[0] };
  run.data.afterFail = { initial, ...afterFail };
  run.check("follow-failure-visible", "팔로우 실패가 보이고 관계가 생기지 않는다", `initial=${initial}; after failure button=${afterFail.button}, message=${JSON.stringify(afterFail.message)}, follow rows=${afterFail.rows}`, initial === "팔로우" && afterFail.button === "팔로우" && !!afterFail.message && afterFail.rows === 0);
  run.step("Retry 팔로우");
  const putOk = page.waitForResponse((r) => r.url().endsWith("/api/farms/f-halla/follow") && r.request().method() === "PUT");
  await btn.click();
  const pr = await putOk;
  await page.getByRole("button", { name: "팔로잉", exact: true }).waitFor();
  const rowsAfterRetry = followCount();
  run.check("one-relation-after-retry", "재시도 성공 후 팔로우 관계 정확히 1건", `PUT ${pr.status()}; follow rows=${rowsAfterRetry}`, pr.status() === 200 && rowsAfterRetry === 1);
  run.step("Reload farm room, open 내 정보 follow list and 채팅 > 소식방 list, open A news room");
  await page.reload();
  await page.getByRole("button", { name: /^(팔로우|팔로잉)$/ }).waitFor();
  await page.waitForTimeout(500);
  const btnReload = (await page.getByRole("button", { name: /^(팔로우|팔로잉)$/ }).innerText()).trim();
  const roomText = await text(page);
  await run.shot(page, "room-after-reload");
  await page.goto(`${WEB}/me`);
  await page.getByText("팔로우한 농가").waitFor();
  await page.waitForLoadState("networkidle");
  const meText = await text(page);
  await run.shot(page, "me-follow-list");
  await page.goto(`${WEB}/chats?view=news`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const chatsText = await text(page);
  await run.shot(page, "chats-news");
  const newsBody = news.split(" ").slice(2).join(" ").slice(0, 10);
  const followingApi = (await api("/api/farms/following", { token: await token("u-minji", "consumer") })).json.items.map((f) => f.farmId);
  run.data.afterReload = { button: btnReload, meHasA: meText.includes("한라네 과수원"), chatsNewsHasA: chatsText.includes("한라네 과수원"), roomShowsNews: roomText.includes(newsBody), followingApi };
  run.check("agree-after-reload", "새로고침 후 버튼·팔로우 목록·소식방이 일치(팔로잉/목록에 A/소식방에 A와 소식)", JSON.stringify(run.data.afterReload), btnReload === "팔로잉" && run.data.afterReload.meHasA && run.data.afterReload.chatsNewsHasA && run.data.afterReload.roomShowsNews && followingApi.includes("f-halla"));
  run.step("Unfollow then refollow in farm A room; open 1:1 chat with A");
  await page.goto(`${WEB}/farms/f-halla`);
  await page.getByRole("button", { name: "팔로잉", exact: true }).waitFor();
  const del = page.waitForResponse((r) => r.url().endsWith("/api/farms/f-halla/follow") && r.request().method() === "DELETE");
  await page.getByRole("button", { name: "팔로잉", exact: true }).click();
  const dr = await del;
  await page.getByRole("button", { name: "팔로우", exact: true }).waitFor();
  const rowsUnf = followCount();
  const put2 = page.waitForResponse((r) => r.url().endsWith("/api/farms/f-halla/follow") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "팔로우", exact: true }).click();
  const pr2 = await put2;
  await page.getByRole("button", { name: "팔로잉", exact: true }).waitFor();
  const rowsRef = followCount();
  await page.goto(`${WEB}/chats?view=private`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const privText = await text(page);
  await run.shot(page, "chats-private");
  await page.goto(`${WEB}/chats/f-halla`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  const chatText = await text(page);
  await run.shot(page, "chat-A");
  const after = sql("select id||' '||sender_type from thread_messages where thread_id='thread-halla-minji' order by created_at");
  const bodies = sql("select left(body,12) from thread_messages where thread_id='thread-halla-minji' order by created_at").split("\n");
  const chatApi = (await api("/api/messaging/chats/f-halla/messages", { token: await token("u-minji", "consumer") })).json;
  const apiIds = (chatApi.items ?? chatApi.messages ?? []).map((m) => m.messageId ?? m.id);
  run.data.refollow = { deleteStatus: dr.status(), rowsAfterUnfollow: rowsUnf, putStatus: pr2.status(), rowsAfterRefollow: rowsRef, threadBefore: before.split("\n"), threadAfter: after.split("\n"), apiIds, uiShowsBodies: bodies.map((b) => [b, chatText.includes(b)]), privateListHasA: privText.includes("한라네 과수원"), chatShowsNews: chatText.includes(newsBody) };
  run.check("prior-chat-retained", "다시 팔로우 후 이전 1:1 채팅이 그대로 보인다(같은 메시지 ID)", `unfollow ${dr.status()} rows=${rowsUnf}; refollow ${pr2.status()} rows=${rowsRef}; thread ids before=after: ${before === after}; UI shows prior bodies: ${bodies.map((b) => chatText.includes(b)).join("/")}; 1:1 list has A=${run.data.refollow.privateListHasA}`, rowsUnf === 0 && rowsRef === 1 && before === after && bodies.every((b) => chatText.includes(b)) && run.data.refollow.privateListHasA);
  run.check("chat-has-no-news", "1:1 대화에는 소식이 나오지 않는다(AC-12-5)", `news body in 1:1 view=${run.data.refollow.chatShowsNews}`, !run.data.refollow.chatShowsNews);
}

async function disc05(run, page) {
  // Setup: farm A = f-kang (owner u-kang has a test login), product A = p-house, saleable; u-minji follows f-kang (seed).
  run.data.setup = ["none beyond seed: p-house AVAILABLE, follows(u-minji,f-kang) present; pause/resume through the producer API PUT /api/products/p-house/sales-settings as u-kang"];
  const prod = await token("u-kang", "producer");
  const cons = await token("u-minji", "consumer");
  const mine = (await api("/api/products/mine/p-house", { token: prod })).json;
  const base = { salesLimitGrams: mine.salesLimitGrams ?? mine.sales?.salesLimitGrams, maxQuantityPerOrder: mine.maxQuantityPerOrder, version: mine.version ?? mine.sales?.version };
  run.data.before = { ...base, follow: sql("select count(*) from follows where consumer_id='u-minji' and farm_id='f-kang'"), price: (await api("/api/products/p-house")).json.currentPrice };
  await loginConsumer(page, "김민지");
  run.step("Producer u-kang pauses p-house (sales-settings salesPaused=true)");
  const paused = await api("/api/products/p-house/sales-settings", { token: prod, method: "PUT", body: { ...base, salesPaused: true } });
  run.data.pause = { status: paused.status, body: paused.json };
  run.step("Consumer reloads home, farm list, farm A room and product A");
  const homeApi = (await api("/api/home")).json;
  const inReco = homeApi.recommended.find((c) => c.productId === "p-house");
  await page.goto(WEB);
  await page.getByText("농가의 제철 상품").waitFor();
  await page.locator('[aria-label$=" 상품 상세"]').first().waitFor();
  const homeOrder = await homeProducts(page);
  const homeText = await text(page);
  await run.shot(page, "home-paused");
  const farmsApi = (await api("/api/farms")).json.items;
  const kangCard = farmsApi.find((f) => f.farmId === "f-kang");
  await page.goto(`${WEB}/farms`);
  await page.getByText(/마감 임박순 · 농가 \d+곳/).waitFor();
  await page.waitForTimeout(500);
  await run.shot(page, "farm-list-paused");
  const listText = await text(page);
  await page.goto(`${WEB}/products/p-house`);
  const reserve = page.getByRole("button", { name: "예약하기" });
  await reserve.waitFor();
  await page.waitForTimeout(500);
  const pApi = (await api("/api/products/p-house")).json;
  const pText = await text(page);
  await run.shot(page, "product-paused");
  const disabled = (await reserve.isDisabled()) || (await reserve.getAttribute("aria-disabled")) === "true";
  let sheetOpened = null;
  if (!disabled) {
    await reserve.click();
    sheetOpened = await page.getByRole("button", { name: "주문서로" }).isVisible({ timeout: 3000 }).catch(() => false);
    await run.shot(page, "product-paused-reserve-click");
  }
  run.data.whilePaused = {
    homeApi: inReco ? { soldOut: inReco.soldOut, availability: inReco.availability, salesPaused: inReco.salesPaused } : "absent",
    homeUiListsA: homeOrder.includes("하우스 감귤 5kg / 10kg"),
    homeUiPausedLabel: /일시 중지|판매 중지|쉬고 있어요/.test(homeText),
    farmCardFeatured: kangCard.featured,
    farmListPausedLabel: /일시 중지|판매 중지/.test(listText),
    product: { soldOut: pApi.soldOut, availability: pApi.availability, salesPaused: pApi.salesPaused },
    productUiPausedLabel: pText.includes("판매 일시 중지"),
    reserveDisabled: disabled,
    reserveSheetOpened: sheetOpened,
  };
  const w = run.data.whilePaused;
  run.check("paused-not-offered", "일시 중지 동안 A가 판매 가능 상품으로 제시되지 않는다(홈 추천·농가 목록 대표 상품·상세)", JSON.stringify({ homeApi: w.homeApi, homeUiListsA: w.homeUiListsA, homeUiPausedLabel: w.homeUiPausedLabel, farmCardFeatured: w.farmCardFeatured?.productId ?? null, productUiPausedLabel: w.productUiPausedLabel }), !w.homeUiListsA && (!w.farmCardFeatured || w.farmCardFeatured.productId !== "p-house") && w.productUiPausedLabel);
  run.check("reserve-disabled-while-paused", "예약하기가 눌리지 않는다", `disabled=${disabled}; product availability=${pApi.availability}, soldOut=${pApi.soldOut}; click opened option sheet=${sheetOpened}`, disabled);
  await page.goto(`${WEB}/farms/f-kang`);
  await page.getByRole("button", { name: /^(팔로우|팔로잉)$/ }).waitFor();
  await page.waitForTimeout(800);
  const roomBtn = (await page.getByRole("button", { name: /^(팔로우|팔로잉)$/ }).innerText()).trim();
  const roomText = await text(page);
  await run.shot(page, "room-paused");
  const followingApi = (await api("/api/farms/following", { token: cons })).json.items.map((f) => f.farmId);
  const roomMsgs = (await api("/api/messaging/rooms/f-kang/messages", { token: cons })).json;
  const newsCount = (roomMsgs.items ?? roomMsgs.messages ?? []).length;
  const newsBodies = sql("select left(body,10) from broadcasts where farm_id='f-kang' and deleted_at is null").split("\n");
  run.data.followWhilePaused = { roomBtn, followingApi, roomMessages: newsCount, roomShowsNews: newsBodies.map((b) => [b, roomText.includes(b)]) };
  run.check("follow-news-persist", "팔로우와 소식방이 그대로 유지된다", JSON.stringify(run.data.followWhilePaused), roomBtn === "팔로잉" && followingApi.includes("f-kang") && newsBodies.every((b) => roomText.includes(b)));
  run.step("Producer resumes p-house; consumer reloads product A");
  const mine2 = (await api("/api/products/mine/p-house", { token: prod })).json;
  const resumed = await api("/api/products/p-house/sales-settings", { token: prod, method: "PUT", body: { ...base, version: mine2.version ?? mine2.sales?.version ?? paused.json?.version, salesPaused: false } });
  run.data.resume = { status: resumed.status, body: resumed.json };
  await page.goto(`${WEB}/products/p-house`);
  await page.getByRole("button", { name: "예약하기" }).waitFor();
  await page.waitForTimeout(500);
  const rApi = (await api("/api/products/p-house")).json;
  const rText = await text(page);
  await run.shot(page, "product-resumed");
  const cur = rApi.stages.find((s) => s.stageId === rApi.currentStageId);
  const firstOpt = rApi.options[0].optionId;
  const dbPrice = Number(sql(`select price from stage_prices where stage_id='${rApi.currentStageId}' and option_id='${firstOpt}'`));
  const dbLeft = sql(`select quantity-reserved_count from stage_allocations where stage_id='${rApi.currentStageId}' and option_id='${firstOpt}'`);
  const rDisabled = await page.getByRole("button", { name: "예약하기" }).isDisabled();
  run.data.resumed = { availability: rApi.availability, price: rApi.currentPrice, dbPrice, stageOption: cur?.options?.[firstOpt], dbLeft, uiPrice: rText.includes(won(dbPrice)), uiLeft: rText.includes(`${dbLeft}박스 남음`), reserveDisabled: rDisabled };
  run.check("resumed-current-price-stock", `재개 후 현재 단계 가격 ${won(dbPrice)}·남은 박스 ${dbLeft}(DB)로 판매 가능`, JSON.stringify(run.data.resumed), resumed.status === 200 && rApi.availability === "AVAILABLE" && rApi.currentPrice === dbPrice && run.data.resumed.uiPrice && run.data.resumed.uiLeft && !rDisabled);
}

const ROWS = { "I3-DISC-01": disc01, "I3-DISC-02": disc02, "I3-DISC-03": disc03, "I3-DISC-04": disc04, "I3-DISC-05": disc05 };

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ROWS);
const browser = await chromium.launch();
const env = { browser: `Chromium ${browser.version()} headless, 390x844`, api: API, web: WEB, commit: sh("git", ["rev-parse", "HEAD"]), fixedNow: sh("grep", ["^FIXED_NOW=", ".env"], serverDir).split("=")[1] };
for (const id of wanted) {
  const run = new Run(id);
  const start = new Date().toISOString();
  let error = null;
  const fixture = reset();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror ${e.message.slice(0, 200)}`));
  try {
    await ROWS[id](run, page);
  } catch (e) {
    error = String(e.stack ?? e).slice(0, 2000);
    await run.shot(page, "error").catch(() => {});
  }
  await context.close();
  const verdict = error ? "ERROR" : run.assertions.every((a) => a.pass) ? "PASS" : "FAIL";
  const trace = { case: id, baseline: BASELINE, env, fixture, start, end: new Date().toISOString(), verdict, error, steps: run.steps, assertions: run.assertions, data: run.data, screenshots: run.shots, consoleErrors };
  writeFileSync(path.join(out, `${id}.json`), JSON.stringify(trace, null, 2), { mode: 0o600 });
  console.log(`${id}: ${verdict}`);
  for (const a of run.assertions) console.log(`  ${a.pass ? "✓" : "✗"} ${a.id} — ${a.observed}`);
  if (error) console.log(error);
}
await browser.close();
