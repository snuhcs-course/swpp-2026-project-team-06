import { expect, test, type APIRequestContext } from "./fixtures";

import { apiLogin, apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

// DEV-361 PR C (FEAT-04·05, R-18·R-21·R-25, PM 11/17·11/18): 상품 수정은 판매페이지 화면(composer) 하나다.
// 시드: 하우스 감귤(p-house) 판매 중·예약 있음, 한라봉(p-hallabong) 작성 중, 레드향(p-redhyang) 판매 중.
const sourceEnabled = process.env.SOURCE_ANALYSIS_ENABLED === "true";
const shots = process.env.FARMCLUB_INTEGRATION_ARTIFACTS;
test.use({ viewport: { width: 390, height: 844 } });

async function producerApi(request: APIRequestContext) {
  const token = await apiLogin(request, "u-kang", "producer");
  return { Authorization: `Bearer ${token}` };
}
/** 남은 상품 초안을 버린다(다른 spec이 시드 값을 본다) */
async function discardDraft(request: APIRequestContext, pid: string) {
  const headers = await producerApi(request);
  const res = await request.get(`${apiUrl}/api/source-analysis/product-workspaces/${pid}/product-draft`, { headers });
  if (!res.ok()) return;
  const view = await res.json();
  if (view.draft)
    await request.delete(`${apiUrl}/api/source-analysis/product-workspaces/${pid}/product-draft?version=${view.version}`, { headers });
}

test("AC-04-1 DEV-361 C-12: product cards open 상품 수정 and the second button follows the sale state", async ({ page }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products?filter=selling`);
  await expect(page.getByText("하우스 감귤 5kg / 10kg").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "기간·가격", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "판매페이지 수정", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "물량·판매 설정", exact: true }).first()).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/dev361c-list-selling.png` });
  await page.getByRole("button", { name: "상품 수정", exact: true }).first().click();
  await expect(page).toHaveURL(/\/products\/(source-analysis|[\w-]+\/detail)/);
  await page.goto(`${producerUrl}/products?filter=draft`);
  await expect(page.getByText("한라봉 5kg").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "물량·판매 설정", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "판매·가격", exact: true }).first()).toBeVisible();
  // Tapping the card itself opens 상품 수정 too
  await page.getByRole("button", { name: "한라봉 5kg 상품 수정", exact: true }).click();
  await expect(page).toHaveURL(/\/products\/(source-analysis|p-hallabong\/detail)/);
  assertClean();
});

test("AC-04-1 DEV-361 C-4: a pre-sale product shows the two steps and 다음 goes to 판매·가격", async ({ page }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-cheonhye/detail`);
  await expect(page).toHaveURL(/composer=1/);
  await expect(page.getByTestId("presale-steps")).toBeVisible();
  await expect(page.getByText("판매 조건은 다음 단계에서 정해요", { exact: true })).toBeVisible();
  // pre-sale products save straight to the product: no '상품에 반영'
  await expect(page.getByRole("button", { name: /^상품에 반영/ })).toHaveCount(0);
  await page.getByRole("button", { name: "다음: 판매·가격", exact: true }).click();
  await expect(page).toHaveURL(/\/products\/p-cheonhye\/sell\?from=composer/);
  // The composer stays under 판매·가격 in the stack: look at the top screen
  await expect(page.getByTestId("presale-steps").last()).toBeVisible();
  await expect(page.getByText("② 판매·가격", { exact: true }).last()).toBeVisible();
  // The rejection reason is shown on 판매·가격 too (PR A follow-up, C-15)
  await expect(page.getByText(/^반려 사유:/)).toBeVisible();
  assertClean();
});

test("R-18 R-25 DEV-361 C-6 C-19: the sales-terms sheet checks on press, keeps changes private and groups them as new orders", async ({ page, request }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  test.setTimeout(90000);
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await expect(page).toHaveURL(/composer=1/);
  await page.getByRole("button", { name: "판매 조건 고치기", exact: true }).click();
  const editor = page.getByTestId("sales-terms-editor");
  await expect(editor).toBeVisible();
  await expect(page.getByText("여기서 고친 값도 '상품에 반영'을 눌러야 구매자에게 보여요.", { exact: true })).toBeVisible();
  // No 한 주문 최대 here (PM decision 9: after approval it lives in 물량·판매 설정)
  await expect(editor.getByLabel("한 주문 최대")).toHaveCount(0);
  const price = editor.getByLabel("5kg 가격").first();
  const original = await price.inputValue();
  // An empty price does not disable the button: pressing highlights the field (C-19)
  await price.fill("");
  await page.getByRole("button", { name: "수정 담기", exact: true }).click();
  await expect(page.getByTestId("invalid-field-prices")).toBeVisible();
  await expect(page.getByText("5kg의 가격과 박스 수를 모두 적어 주세요.", { exact: true })).toBeVisible();
  const next = String(Number(original.replace(/\D/g, "")) - 2000);
  await price.fill(next);
  if (shots) await page.screenshot({ path: `${shots}/dev361c-terms-sheet.png` });
  await page.getByRole("button", { name: "수정 담기", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("button", { name: "상품에 반영 (1)", exact: true })).toBeVisible();
  await expect(page.getByTestId("sales-terms-block")).toContainText("판매 조건 수정됨");
  // Buyers still see the old price until 상품에 반영
  const publicPrice = async () => {
    const p = await (await page.request.get(`${apiUrl}/api/products/p-house`)).json();
    return JSON.stringify(p.stages.map((s: { options: unknown }) => s.options));
  };
  const before = await publicPrice();
  await page.getByRole("button", { name: "상품에 반영 (1)", exact: true }).click();
  const sheet = page.getByTestId("apply-confirm");
  await expect(sheet.getByTestId("change-group-new")).toBeVisible();
  // 바뀐 칸만 한 줄씩 전·후 표로(PM 11/18): 서버의 긴 기간 요약이 아니다
  const priceRow = sheet.getByTestId("change-group-new").getByLabel(/^1기간 · 5kg 가격, /);
  await expect(priceRow).toHaveCount(1);
  await expect(priceRow).toContainText(`${Number(next).toLocaleString("ko-KR")}원`);
  await expect(sheet.getByTestId("change-group-new").getByText(/박스 수|10\.13~/)).toHaveCount(0);
  await expect(sheet.getByText("이미 결제한 주문의 가격은 그대로예요", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "더 고치기", exact: true }).click();
  expect(await publicPrice()).toBe(before);
  await discardDraft(request, "p-house");
  assertClean();
});

test("R-21 DEV-361 C-8 C-19: a changed 받는 시기 with reservations needs the consent check before 반영하기", async ({ page, request }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  test.setTimeout(90000);
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await expect(page).toHaveURL(/composer=1/);
  // Put a 받는 시기 change in the private draft (the date sheet is covered by the 판매·가격 specs)
  const headers = await producerApi(request);
  const view = await (await request.get(`${apiUrl}/api/source-analysis/product-workspaces/p-house/product-draft`, { headers })).json();
  const mine = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers })).json();
  const end = mine.deliveryWindow.end as string;
  const later = new Date(`${end}T00:00:00Z`);
  later.setUTCDate(later.getUTCDate() + 2);
  const saved = await request.put(`${apiUrl}/api/source-analysis/product-workspaces/p-house/product-draft`, {
    headers: { ...headers, "Idempotency-Key": `e2e-consent-${Date.now()}` },
    data: { version: view.version, fields: { deliveryWindow: { start: mine.deliveryWindow.start, end: later.toISOString().slice(0, 10) } } },
  });
  expect(saved.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("button", { name: "상품에 반영 (1)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "상품에 반영 (1)", exact: true }).click();
  const sheet = page.getByTestId("apply-confirm");
  await expect(sheet.getByTestId("change-group-consent")).toContainText("받는 시기");
  await expect(sheet.getByText(/^예약한 \d+명에게 동의를 물어요/)).toBeVisible();
  const applies: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/apply-all")) applies.push(r.url());
  });
  // Not disabled: pressing without the check highlights it and sends nothing
  await sheet.getByRole("button", { name: "반영하기", exact: true }).click();
  await expect(page.getByTestId("invalid-field-consent")).toBeVisible();
  await expect(sheet.getByText("받는 시기 변경 안내에 동의해 주세요.", { exact: true })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/dev361c-consent.png` });
  expect(applies).toHaveLength(0);
  await sheet.getByRole("button", { name: "더 고치기", exact: true }).click();
  await discardDraft(request, "p-house");
  assertClean();
});

test("DEV-361 C-13: the old 기간·가격 and 상품 편집 addresses open 상품 수정", async ({ page }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/stages`);
  await expect(page).toHaveURL(/composer=1/);
  await expect(page.getByTestId("sales-terms-editor")).toBeVisible();
  await expect(page.getByRole("button", { name: "수정 담기", exact: true })).toBeVisible();
  await page.goto(`${producerUrl}/products/p-hallabong/stages`);
  await expect(page).toHaveURL(/\/products\/p-hallabong\/sell/);
  await page.goto(`${producerUrl}/products/p-redhyang/edit`);
  await expect(page).toHaveURL(/composer=1/);
  await expect(page.getByTestId("product-basic-info")).toBeVisible();
  assertClean();
});

test("DEV-84 DEV-361 C-1 C-2: with source analysis off the composer opens without AI and applies directly", async ({ page, request }) => {
  const assertClean = monitor(page, [/status of 404/]);
  await page.route("**/api/source-analysis/config", (route) => route.fulfill({ json: { enabled: false } }));
  await page.route("**/api/source-analysis/product-workspaces/*/product-draft", (route) =>
    route.fulfill({ status: 404, json: { code: "NOT_FOUND", message: "찾을 수 없어요.", details: {} } }),
  );
  const headers = await producerApi(request);
  const before = await (await request.get(`${apiUrl}/api/products/mine/p-redhyang`, { headers })).json();
  const patches: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().endsWith("/api/products/p-redhyang")) patches.push(r.postData() ?? "");
  });
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-redhyang/detail`);
  const basic = page.getByTestId("product-basic-info");
  await expect(basic).toBeVisible();
  await expect(page).not.toHaveURL(/composer=1/);
  await expect(page.getByRole("button", { name: "AI 시트 열기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "상세 고치기", exact: true })).toBeVisible();
  // No private draft on this server: no 임시 저장
  await expect(page.getByRole("button", { name: "임시 저장", exact: true })).toHaveCount(0);
  await basic.getByLabel("상품명", { exact: true }).fill(`${before.name} 직송`);
  await page.getByRole("button", { name: "상품에 반영 (1)", exact: true }).click();
  await page.getByTestId("apply-confirm").getByRole("button", { name: "반영하기", exact: true }).click();
  await expect(page.getByText("상품에 반영했어요", { exact: true })).toBeVisible();
  expect(patches).toHaveLength(1);
  expect(JSON.parse(patches[0]).name).toBe(`${before.name} 직송`);
  // Put the seed name back for the other specs
  const now = await (await request.get(`${apiUrl}/api/products/mine/p-redhyang`, { headers })).json();
  const restored = await request.patch(`${apiUrl}/api/products/p-redhyang`, {
    headers: { ...headers, "Idempotency-Key": `e2e-restore-${Date.now()}` },
    data: { version: now.version, name: before.name },
  });
  expect(restored.ok()).toBeTruthy();
  assertClean();
});

test("DEV-361 PM 11/18: leaving with unapplied changes asks first, and the product card marks them", async ({ page, request }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  test.setTimeout(120000);
  const assertClean = monitor(page);
  const headers = await producerApi(request);
  const seed = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers })).json();
  await loginProducer(page, "강영수");
  const open = async () => {
    await page.goto(`${producerUrl}/products?filter=selling`);
    await page.getByRole("button", { name: /^하우스 감귤 5kg \/ 10kg.* 상품 수정$/ }).click();
    await expect(page).toHaveURL(/composer=1/);
  };
  const leaveSheet = page.getByTestId("leave-confirm");
  try {
    await open();
    await page.getByText("상품정보", { exact: true }).click();
    await page.getByTestId("product-basic-info").getByLabel("보관", { exact: true }).fill("서늘한 곳에 두세요 (나가기 확인)");
    // no banner at the top any more; the per-field mark and the button count stay
    await expect(page.getByText(/반영 안 한 수정 \d+개/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "상품에 반영 (1)", exact: true })).toBeVisible();
    // 1) 계속 고치기: stays
    await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
    await expect(leaveSheet.getByText("반영하지 않은 수정이 있어요", { exact: true })).toBeVisible();
    await expect(leaveSheet.getByText("'상품에 반영'을 눌러야 구매자에게 보여요.", { exact: true })).toBeVisible();
    if (shots) await page.screenshot({ path: `${shots}/dev361c-leave-confirm.png` });
    await leaveSheet.getByRole("button", { name: "계속 고치기", exact: true }).click();
    await expect(leaveSheet).toHaveCount(0);
    await expect(page).toHaveURL(/composer=1/);
    // 2) 임시 저장하고 나가기: private draft, then the list marks the card
    await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
    await leaveSheet.getByRole("button", { name: "임시 저장하고 나가기", exact: true }).click();
    await expect(page.getByText("임시 저장됐어요", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/products/);
    await page.goto(`${producerUrl}/products?filter=selling`);
    await expect(page.getByTestId("unapplied-chip")).toHaveCount(1);
    await expect(page.getByTestId("unapplied-chip")).toHaveText("반영 안 한 수정 있음");
    expect((await (await request.get(`${apiUrl}/api/products/p-house`)).json()).info.storage).toBe(seed.info.storage);
    // 3) saved but not applied, nothing new: '나중에 반영하기' just leaves
    await open();
    await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
    await expect(leaveSheet.getByRole("button", { name: "임시 저장하고 나가기" })).toHaveCount(0);
    await leaveSheet.getByRole("button", { name: "나중에 반영하기", exact: true }).click();
    await expect(page).toHaveURL(/\/products/);
    // 4) 상품에 반영: opens the apply-confirm sheet, applying clears the card mark and leaving no longer asks
    await open();
    await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
    await leaveSheet.getByRole("button", { name: "상품에 반영", exact: true }).click();
    const sheet = page.getByTestId("apply-confirm");
    await expect(sheet.getByTestId("change-group-now").getByLabel(/^보관 방법, /)).toBeVisible();
    await sheet.getByRole("button", { name: "반영하기", exact: true }).click();
    await expect(page.getByText("상품에 반영했어요", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
    await expect(page).toHaveURL(/\/products/);
    await expect(leaveSheet).toHaveCount(0);
    await page.goto(`${producerUrl}/products?filter=selling`);
    await expect(page.getByText("하우스 감귤 5kg / 10kg").first()).toBeVisible();
    await expect(page.getByTestId("unapplied-chip")).toHaveCount(0);
  } finally {
    await discardDraft(request, "p-house");
    const now = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers })).json();
    if (now.info.storage !== seed.info.storage)
      await request.patch(`${apiUrl}/api/products/p-house`, {
        headers: { ...headers, "Idempotency-Key": `e2e-restore-${Date.now()}` },
        data: { version: now.version, info: { storage: seed.info.storage } },
      });
  }
  assertClean();
});

test("AC-05 R-18 DEV-361 scan: a new period saved in the draft can be applied after reopening", async ({ page, request }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  test.setTimeout(120000);
  const assertClean = monitor(page);
  const headers = await producerApi(request);
  const seed = await (await request.get(`${apiUrl}/api/products/mine/p-redhyang`, { headers })).json();
  const seedStages = seed.stages.map((s: { stageId: string; startsAt: string; endsAt: string; options: Record<string, { price: number; quantity: number }> }) => ({
    stageId: s.stageId,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    options: Object.fromEntries(Object.entries(s.options).map(([k, v]) => [k, { price: v.price, quantity: v.quantity }])),
  }));
  try {
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/products/p-redhyang/detail`);
    await expect(page).toHaveURL(/composer=1/);
    await page.getByRole("button", { name: "판매 조건 고치기", exact: true }).click();
    const editor = page.getByTestId("sales-terms-editor");
    await editor.getByRole("button", { name: "＋ 예약 기간 추가", exact: true }).click();
    // the new period is the last one: later periods must cost more (R-18)
    await editor.getByLabel("3kg 가격").last().fill("99000");
    await editor.getByLabel("3kg 박스 수").last().fill("10");
    await page.getByRole("button", { name: "수정 담기", exact: true }).click();
    await page.getByRole("button", { name: "임시 저장", exact: true }).click();
    await expect(page.getByText(/비공개로 저장했어요/)).toBeVisible();
    // reopen: the new period comes back from the server draft (no stage ID yet)
    await page.goto(`${producerUrl}/products/p-redhyang/detail`);
    await expect(page).toHaveURL(/composer=1/);
    await page.getByTestId("product-basic-info").getByLabel("상품명", { exact: true }).fill(`${seed.name} 직송`);
    await page.getByRole("button", { name: /^상품에 반영/ }).click();
    const sheet = page.getByTestId("apply-confirm");
    await expect(sheet.getByTestId("change-group-new").getByLabel(/^\d기간\(새\) · 3kg 가격, /)).toBeVisible();
    await sheet.getByRole("button", { name: "반영하기", exact: true }).click();
    await expect(page.getByText("상품에 반영했어요", { exact: true })).toBeVisible();
    await expect(page.getByText("기간 ID를 확인해 주세요")).toHaveCount(0);
    const after = await (await request.get(`${apiUrl}/api/products/mine/p-redhyang`, { headers })).json();
    expect(after.stages).toHaveLength(seed.stages.length + 1);
  } finally {
    await discardDraft(request, "p-redhyang");
    const now = await (await request.get(`${apiUrl}/api/products/mine/p-redhyang`, { headers })).json();
    const patched = await request.patch(`${apiUrl}/api/products/p-redhyang`, {
      headers: { ...headers, "Idempotency-Key": `e2e-restore-${Date.now()}` },
      data: { version: now.version, name: seed.name },
    });
    const version = (await patched.json()).version ?? now.version;
    await request.put(`${apiUrl}/api/products/p-redhyang/stages`, {
      headers: { ...headers, "Idempotency-Key": `e2e-restore-stages-${Date.now()}` },
      data: { version, stages: seedStages },
    });
  }
  assertClean();
});

test("R-21 DEV-361 scan: when the server asks for consent the sheet moves 받는 시기 into the consent group", async ({ page, request }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  test.setTimeout(90000);
  // the sheet first believes nobody has reserved (stale count), the server knows better and answers 409
  const assertClean = monitor(page, [/status of 409/]);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await expect(page).toHaveURL(/composer=1/);
  const headers = await producerApi(request);
  const view = await (await request.get(`${apiUrl}/api/source-analysis/product-workspaces/p-house/product-draft`, { headers })).json();
  const mine = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers })).json();
  const later = new Date(`${mine.deliveryWindow.end}T00:00:00Z`);
  later.setUTCDate(later.getUTCDate() + 2);
  const saved = await request.put(`${apiUrl}/api/source-analysis/product-workspaces/p-house/product-draft`, {
    headers: { ...headers, "Idempotency-Key": `e2e-consent-stale-${Date.now()}` },
    data: { version: view.version, fields: { deliveryWindow: { start: mine.deliveryWindow.start, end: later.toISOString().slice(0, 10) } } },
  });
  expect(saved.ok()).toBeTruthy();
  await page.route("**/api/source-analysis/product-workspaces/p-house/product-draft", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), reservedCount: 0 } });
  });
  await page.route("**/api/products/mine/p-house", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), reservedCount: 0 } });
  });
  try {
    await page.reload();
    await page.getByRole("button", { name: /^상품에 반영/ }).click();
    const sheet = page.getByTestId("apply-confirm");
    await expect(sheet.getByTestId("change-group-new").getByLabel(/^받는 시기, /)).toBeVisible();
    await expect(sheet.getByTestId("change-group-consent")).toHaveCount(0);
    await sheet.getByRole("button", { name: "반영하기", exact: true }).click();
    // 409 DELIVERY_CONSENT_REQUIRED: the row moves to the consent group with the server's count and the check
    await expect(sheet.getByTestId("change-group-consent").getByLabel(/^받는 시기, /)).toBeVisible();
    await expect(sheet.getByText(/^예약한 [1-9]\d*명에게 동의를 물어요/)).toBeVisible();
    await expect(sheet.getByText("받는 시기 변경을 예약자에게 알리는 것에 동의해요", { exact: true })).toBeVisible();
    await expect(sheet.getByTestId("change-group-new").getByLabel(/^받는 시기, /)).toHaveCount(0);
    await sheet.getByRole("button", { name: "더 고치기", exact: true }).click();
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await discardDraft(request, "p-house");
  }
  assertClean();
});

test("FEAT-04 DEV-361 PM 11/18: grade and an extra photo go through the draft and apply together", async ({ page, request }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  test.setTimeout(120000);
  const assertClean = monitor(page);
  const headers = await producerApi(request);
  const seed = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers })).json();
  const grade = seed.grade === "특" ? "상" : "특";
  try {
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/products/p-house/detail`);
    await expect(page).toHaveURL(/composer=1/);
    await page.getByRole("radio", { name: `등급 ${grade}`, exact: true }).click();
    await expect(page.getByLabel("등급 수정됨", { exact: true })).toBeVisible();
    const strip = page.getByTestId("extra-photos");
    await expect(strip).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await strip.getByRole("button", { name: "사진 추가", exact: true }).click();
    await (await chooser).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
    await expect(strip.getByRole("img", { name: `상품 사진 ${seed.photos.length + 1}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "상품에 반영 (2)", exact: true })).toBeVisible();
    // private until applied
    await page.getByRole("button", { name: "임시 저장", exact: true }).click();
    await expect(page.getByText(/비공개로 저장했어요/)).toBeVisible();
    const before = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers })).json();
    expect(before.photos).toHaveLength(seed.photos.length);
    expect(before.grade).toBe(seed.grade);
    await page.getByRole("button", { name: "상품에 반영 (2)", exact: true }).click();
    const sheet = page.getByTestId("apply-confirm");
    await expect(sheet.getByTestId("change-group-now").getByLabel(`등급, ${seed.grade ?? "없음"}에서 ${grade}으로`)).toBeVisible();
    await expect(sheet.getByTestId("change-group-now").getByLabel(`사진, ${seed.photos.length}장에서 ${seed.photos.length + 1}장으로`)).toBeVisible();
    if (shots) await page.screenshot({ path: `${shots}/dev361c-grade-photos-apply.png` });
    await sheet.getByRole("button", { name: "반영하기", exact: true }).click();
    await expect(page.getByText("상품에 반영했어요", { exact: true })).toBeVisible();
    const after = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers })).json();
    expect(after.grade).toBe(grade);
    expect(after.photos).toHaveLength(seed.photos.length + 1);
    expect(after.photos.slice(0, seed.photos.length)).toEqual(seed.photos);
  } finally {
    await discardDraft(request, "p-house");
    const now = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers })).json();
    await request.patch(`${apiUrl}/api/products/p-house`, {
      headers: { ...headers, "Idempotency-Key": `e2e-restore-${Date.now()}` },
      data: { version: now.version, grade: seed.grade, photos: seed.photos },
    });
  }
  assertClean();
});

test("FEAT-04 DEV-361 PM 11/18: a pre-sale product saves grade and extra photos straight to the product", async ({ page, request }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  const assertClean = monitor(page);
  const headers = await producerApi(request);
  const seed = await (await request.get(`${apiUrl}/api/products/mine/p-hallabong`, { headers })).json();
  const grade = seed.grade === "상" ? "보통" : "상";
  try {
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/products/p-hallabong/detail`);
    await expect(page).toHaveURL(/composer=1/);
    await page.getByRole("radio", { name: `등급 ${grade}`, exact: true }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("extra-photos").getByRole("button", { name: "사진 추가", exact: true }).click();
    await (await chooser).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
    await expect(page.getByTestId("extra-photos").getByRole("img", { name: `상품 사진 ${seed.photos.length + 1}` })).toBeVisible();
    await page.getByRole("button", { name: "임시 저장", exact: true }).click();
    await expect(page.getByText(/저장했어요|상품에는 아직/).first()).toBeVisible();
    await expect
      .poll(async () => {
        const p = await (await request.get(`${apiUrl}/api/products/mine/p-hallabong`, { headers })).json();
        return [p.grade, p.photos.length];
      })
      .toEqual([grade, seed.photos.length + 1]);
  } finally {
    const now = await (await request.get(`${apiUrl}/api/products/mine/p-hallabong`, { headers })).json();
    await request.patch(`${apiUrl}/api/products/p-hallabong`, {
      headers: { ...headers, "Idempotency-Key": `e2e-restore-${Date.now()}` },
      data: { version: now.version, grade: seed.grade, photos: seed.photos },
    });
  }
  assertClean();
});
