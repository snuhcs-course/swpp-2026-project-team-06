import { expect, test } from "@playwright/test";
import { apiLogin, apiUrl, consumerUrl, loginProducer, producerUrl } from "./helpers";

test("P02 AC-03-3: AI failure preserves text and manual creation excludes a concurrent retry", async ({ page }) => {
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/new`);
  const input = page.getByLabel("카톡·밴드에 쓰던 문구");
  await input.fill("실패해도 남는 생산자 판매 문구");
  await page.route(`${apiUrl}/api/products/drafts`, route => route.fulfill({
    status: 503, json: { code: "AI_UNAVAILABLE", message: "시험용 AI 실패", details: {} },
  }));
  await page.getByRole("button", { name: "초안 만들기" }).click();
  await expect(page.getByText("초안을 만들지 못했어요")).toBeVisible();
  await expect(input).toHaveValue("실패해도 남는 생산자 판매 문구");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let creates = 0;
  await page.route(`${apiUrl}/api/products`, async route => {
    creates += 1;
    await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "직접 입력하기" }).click();
  await expect.poll(() => creates).toBe(1);
  await expect(page.getByRole("button", { name: "다시 해 보기" })).toBeDisabled();
  await expect(input).not.toBeEditable();
  release();
  await expect(page).toHaveURL(/\/products\/[^/]+\/edit/);
  await expect(page.getByLabel("상품명", { exact: true })).toHaveValue("");
  expect(creates).toBe(1);
});

test("P02 AC-03-1: empty extraction strings and option arrays remain missing", async ({ page }) => {
  await loginProducer(page, "강영수");
  await page.route(`${apiUrl}/api/products/drafts`, route => route.fulfill({ json: {
    draftId: "empty-fields", failed: false, priceMentioned: null,
    extracted: { name: "감귤", variety: "", options: [], expectedBrix: null, grade: null, deliveryWindow: null, description: "   " },
    missingFields: ["variety", "options", "expectedBrix", "grade", "deliveryWindow", "description"],
  } }));
  let releaseSession!: () => void;
  const sessionGate = new Promise<void>(resolve => { releaseSession = resolve; });
  await page.route(`${apiUrl}/api/auth/me`, async route => {
    await sessionGate;
    await route.continue();
  });
  await page.goto(`${producerUrl}/products/new`);
  await expect(page.getByLabel("화면을 준비하고 있어요")).toBeVisible();
  await expect(page.getByLabel("카톡·밴드에 쓰던 문구")).toHaveCount(0);
  releaseSession();
  await page.getByLabel("카톡·밴드에 쓰던 문구").fill("감귤");
  await expect(page.getByLabel("카톡·밴드에 쓰던 문구")).toHaveValue("감귤");
  await page.getByRole("button", { name: "초안 만들기" }).click();
  for (const field of ["품종", "중량 옵션", "예상 당도", "등급", "받는 시기", "설명"]) {
    await expect(page.getByText(`확인 필요 · ${field}`, { exact: true })).toBeVisible();
  }
});

test("P03 AC-04-1: origin and storage block initial supply request until corrected", async ({ page }) => {
  await loginProducer(page, "강영수");
  await page.route(`${apiUrl}/api/products/mine/p-house`, async route => {
    const response = await route.fetch();
    const product = await response.json();
    await route.fulfill({ response, json: { ...product, status: "DRAFT", info: { ...product.info, origin: "", storage: "" } } });
  });
  await page.goto(`${producerUrl}/products/p-house/edit`);
  const apply = page.getByRole("button", { name: "공급 물량 신청", exact: true });
  await expect(apply).toBeDisabled();
  await expect(page.getByText("원산지를 적어 주세요", { exact: true })).toBeVisible();
  await expect(page.getByText("보관 방법을 적어 주세요", { exact: true })).toBeVisible();
  await page.getByLabel("원산지", { exact: true }).fill("제주");
  await expect(apply).toBeDisabled();
  await page.getByLabel("보관", { exact: true }).fill("서늘한 곳");
  await expect(apply).toBeEnabled();
});

test("P04 AC-19-1: sharing failure copies the live link; cancellation does not copy", async ({ page, browser, request }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "shareTest", { value: { copied: "", cancel: false } });
    const state = (window as unknown as { shareTest: { copied: string; cancel: boolean } }).shareTest;
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => {
      throw new DOMException("test", state.cancel ? "AbortError" : "NotAllowedError");
    } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { state.copied = text; } } });
  });
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/farm`);
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  const copied = () => page.evaluate(() => (window as unknown as { shareTest: { copied: string } }).shareTest.copied);
  await expect.poll(copied).toContain("/s/farms/f-kang");
  const link = await copied();
  const response = await request.get(link);
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).toContain("강씨네 귤밭");
  const anonymous = await browser.newContext();
  const landing = await anonymous.newPage();
  await landing.goto(link);
  await expect(landing).toHaveURL(`${consumerUrl}/farms/f-kang`);
  await expect(landing.getByRole("button", { name: "강씨네 귤밭 농가 보기" })).toBeVisible();
  await anonymous.close();
  await page.evaluate(() => {
    const state = (window as unknown as { shareTest: { copied: string; cancel: boolean } }).shareTest;
    state.copied = ""; state.cancel = true;
  });
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  expect(await copied()).toBe("");
});

test("P07 AC-17-2/5: shipment persists carrier and tracking before a failed refresh can be retried", async ({ page, request }) => {
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/ship?status=PREPARING`);
  await page.getByRole("button", { name: /FC-1006-0040.*택배사·송장 번호 넣기/ }).click();
  await page.getByLabel("송장 번호", { exact: true }).fill("I2-0040");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("택배사를 골라 주세요", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "CJ대한통운" }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: "1건 출하로 바꾸기" }).click();
  const token = await apiLogin(request, "u-kang", "producer");
  const headers = { Authorization: `Bearer ${token}` };
  const read = async () => (await (await request.get(`${apiUrl}/api/orders/producer?limit=50`, { headers })).json()).items.find((o: { orderId: string }) => o.orderId === "o-40");
  expect((await read()).status).toBe("PREPARING");
  let failRefresh = false;
  await page.route(`${apiUrl}/api/orders/o-40/ship`, async route => {
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    failRefresh = true;
    await route.fulfill({ response });
  });
  await page.route(`${apiUrl}/api/orders/producer?*`, async route => {
    if (!failRefresh) return route.continue();
    failRefresh = false;
    await route.fulfill({ status: 503, json: { code: "TEMPORARY", message: "목록 새로고침 실패", details: {} } });
  });
  await page.getByRole("button", { name: "1건 출하로 바꾸기" }).last().click();
  await expect(page.getByText("불러오지 못했어요", { exact: true })).toBeVisible();
  expect(await read()).toMatchObject({ status: "SHIPPED", carrier: "CJ", trackingNumber: "I2-0040" });
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByText("불러오지 못했어요", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: /^출하 \d/ }).click();
  await expect(page.getByText("CJ대한통운 I2-0040", { exact: true })).toBeVisible();
});
