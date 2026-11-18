import { expect, test, type APIRequestContext, type Page } from "./fixtures";

import { apiLogin, apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

// DEV-361 PR A (FEAT-04 AC-04-1, PM 11/17): 판매 전 상품(작성 중·반려, 승인 물량 0)의 첫 판매 요청은 판매·가격(SCR-24b)에서만 한다.
// 11/17 실사용자가 물량·판매 설정의 첫 신청 버튼에서 "먼저 입력해 주세요: 받는 시기, 최대 지연 기한, 단계 가격"으로 막혔다.
// 시드: 한라봉(p-hallabong) 작성 중, 천혜향(p-cheonhye) 반려, 청견(p-cheonggyeon) 첫 신청 심사 중, 하우스 감귤(p-house) 판매 중.
test.use({ viewport: { width: 390, height: 844 } });

const toastText = "판매를 시작하려면 판매·가격을 먼저 채워 주세요";

test("AC-04-1 DEV-361: pre-sale cards open 판매·가격 and approved cards keep 판매 설정", async ({ page }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products?filter=draft`);
  await expect(page.getByText("한라봉 5kg").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "판매 설정", exact: true })).toHaveCount(0);
  // 판매페이지 수정·기간·가격은 이 PR에서 그대로(PR C에서 정리)
  const card = page
    .locator("div")
    .filter({ hasText: "한라봉 5kg" })
    .filter({ has: page.getByRole("button", { name: "판매·가격", exact: true }) })
    .last();
  await expect(card.getByRole("button", { name: "판매페이지 수정" })).toBeVisible();
  await expect(card.getByRole("button", { name: "기간·가격" })).toBeVisible();
  await card.getByRole("button", { name: "판매·가격", exact: true }).click();
  await expect(page).toHaveURL(/\/products\/p-hallabong\/sell$/);
  await expect(page.getByRole("button", { name: "판매 시작 요청" })).toBeVisible();

  await page.goto(`${producerUrl}/products?filter=selling`);
  await expect(page.getByText("하우스 감귤 5kg / 10kg").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "판매·가격", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "판매 설정", exact: true }).first().click();
  await expect(page).toHaveURL(/\/products\/[\w-]+\/sales$/);
  await expect(page.getByText("물량·판매 설정").first()).toBeVisible();
  assertClean();
});

test("AC-04-1 DEV-361: opening 물량·판매 설정 for a draft or rejected product moves to 판매·가격 with a toast", async ({ page }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  for (const id of ["p-hallabong", "p-cheonhye"]) {
    await page.goto(`${producerUrl}/products/${id}/sales`);
    await expect(page).toHaveURL(new RegExp(`/products/${id}/sell$`));
    await expect(page.getByText(toastText, { exact: true })).toBeVisible();
    await expect(page.getByText("공급 물량 승인 요청")).toHaveCount(0);
    await expect(page.getByText(/먼저 입력해 주세요/)).toHaveCount(0);
  }
  assertClean();
});

test("AC-04-1 DEV-361: approved and pending products keep 물량·판매 설정 without a first-request form", async ({ page }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/sales`);
  await expect(page.getByText("물량 추가 신청", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("신청 후 총 공급 물량 (kg)")).toBeVisible();
  await expect(page.getByText("판매 시작 요청")).toHaveCount(0);
  await expect(page).toHaveURL(/\/products\/p-house\/sales$/);

  // 첫 신청 심사 중: 상태와 철회만 보이고 신청 칸은 없다
  await page.goto(`${producerUrl}/products/p-cheonggyeon/sales`);
  await expect(page.getByText("판매 시작 요청", { exact: true })).toBeVisible();
  await expect(page.getByText(/공급 물량 심사 중/)).toBeVisible();
  await expect(page.getByRole("button", { name: "신청 철회" })).toBeVisible();
  await expect(page.getByLabel("신청 후 총 공급 물량 (kg)")).toHaveCount(0);
  await expect(page).toHaveURL(/\/products\/p-cheonggyeon\/sales$/);
  assertClean();
});

test("AC-04-1 DEV-361: 판매·가격 points to 상품 편집 for required product info it has no field for", async ({ page }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  // 이 화면에 칸이 없는 상품 정보(품종·원산지)가 비어 있는 작성 중 상품
  await page.route("**/api/products/mine/p-hallabong", async (route) => {
    const response = await route.fetch();
    const product = await response.json();
    await route.fulfill({
      response,
      json: { ...product, missingFields: ["품종", "원산지", "받는 시기", "최대 지연 기한", "단계 가격"] },
    });
  });
  await page.goto(`${producerUrl}/products/p-hallabong/sell`);
  // 받는 시기·가격은 이 화면 칸이라 안내에 넣지 않는다
  await expect(page.getByText("판매 시작 전에 채워 주세요: 품종, 원산지", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "상품 편집에서 채우기" }).click();
  await expect(page).toHaveURL(/\/products\/p-hallabong\/edit\?from=sell$/);
  // 상품 편집도 같은 주소를 읽는다. 테스트가 끝나며 페이지가 닫힐 때 진행 중인 가로채기 오류는 무시한다
  await page.unrouteAll({ behavior: "ignoreErrors" });
  assertClean();
});

type Draft = { productId: string; status: string; version: number; remoteAreaFee: number; missingFields: string[]; options: { optionId: string }[] };

/** 판매·가격 칸(옵션·받는 시기·환불일·기간 가격)은 채우고 상품명·품종은 비운 작성 중 상품 */
async function sellReadyDraft(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
  const send = async (method: "post" | "patch" | "put", path: string, data: object): Promise<Draft> => {
    const response = await request[method](`${apiUrl}${path}`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const read = async (id: string): Promise<Draft> => {
    const response = await request.get(`${apiUrl}/api/products/mine/${id}`, { headers });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const created = await send("post", "/api/products", {});
  const patched = await send("patch", `/api/products/${created.productId}`, {
    version: created.version,
    options: [{ label: "5kg", weightKg: 5 }],
    deliveryWindow: { start: "2026-11-01", end: "2026-11-05" },
    maxDelayUntil: "2026-11-10",
  });
  await send("put", `/api/products/${created.productId}/stages`, {
    version: patched.version,
    stages: [
      {
        startsAt: "2026-10-07",
        endsAt: "2026-10-31",
        options: { [patched.options[0].optionId]: { price: 30000, quantity: 10 } },
      },
    ],
  });
  const draft = await read(created.productId);
  expect(draft.missingFields).toEqual(expect.arrayContaining(["상품명", "품종"]));
  return { draft, read, send };
}

/** 판매·가격 → 상품 편집에서 상품명·품종·도서산간 운임을 저장하고 돌아온다 */
async function fillInProductEdit(page: Page, id: string, remoteAreaFee: string) {
  await page.getByRole("button", { name: "상품 편집에서 채우기" }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${id}/edit`));
  // 판매·가격 화면이 아래에 남아 있어(스택) 보이는 칸만 고른다
  const shown = <T extends ReturnType<Page["getByLabel"]>>(l: T) => l.filter({ visible: true });
  await shown(page.getByLabel("상품명", { exact: true })).fill("테스트 귤");
  await shown(page.getByLabel("품종", { exact: true })).fill("조생");
  await shown(page.getByLabel("도서산간 추가 운임", { exact: true })).fill(remoteAreaFee);
  await shown(page.getByRole("button", { name: "저장", exact: true })).click();
  await expect(page.getByText("저장했어요", { exact: true })).toBeVisible();
  // 판매·가격에서 왔으면 '다음: 판매·가격'은 새로 쌓지 않고 돌아간다
  await page.getByRole("button", { name: "다음: 판매·가격", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${id}/sell$`));
}

test("AC-04-1 DEV-361: 판매·가격 → 상품 편집 → back refills untouched fields and never overwrites edits made there", async ({
  page,
  request,
}) => {
  // 고친 입력으로 저장하면 서버가 버전 충돌로 막는다(409, 콘솔 오류로 남음)
  const assertClean = monitor(page, [/409/]);
  await loginProducer(page, "강영수");

  // 1) 판매·가격에서 아무것도 안 고쳤으면 상품 편집에서 바꾼 값으로 다시 채운다
  const first = await sellReadyDraft(request);
  const id1 = first.draft.productId;
  await page.goto(`${producerUrl}/products/${id1}/sell`);
  await expect(page.getByText("판매 시작 전에 채워 주세요: 상품명, 품종", { exact: true })).toBeVisible();
  await fillInProductEdit(page, id1, "4000");
  await expect(page.getByLabel("도서산간 추가 운임", { exact: true })).toHaveValue("4,000");
  await expect(page.getByText(/판매 시작 전에 채워 주세요/)).toHaveCount(0);
  await page.getByLabel("판매할 총 물량", { exact: true }).fill("50");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장했어요", { exact: true })).toBeVisible();
  expect((await first.read(id1)).remoteAreaFee).toBe(4000);

  // 2) 판매·가격에서 먼저 고쳤으면 입력은 그대로 두고, 저장해도 상품 편집의 변경을 덮어쓰지 않는다
  const second = await sellReadyDraft(request);
  const id2 = second.draft.productId;
  await page.goto(`${producerUrl}/products/${id2}/sell`);
  await page.getByLabel("한 주문 최대", { exact: true }).fill("2");
  await page.getByLabel("판매할 총 물량", { exact: true }).fill("50");
  await fillInProductEdit(page, id2, "5000");
  await expect(page.getByLabel("한 주문 최대", { exact: true })).toHaveValue("2");
  await expect(page.getByText(/판매 시작 전에 채워 주세요/)).toHaveCount(0);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert").getByText("최신 상품을 다시 불러와 주세요.")).toBeVisible();
  expect((await second.read(id2)).remoteAreaFee).toBe(5000);
  // 막힌 자리에서 바로 최신 값으로 다시 채울 수 있다(입력이 서버 값으로 바뀜)
  await page.getByRole("button", { name: "최신 값 다시 불러오기" }).click();
  await expect(page.getByLabel("도서산간 추가 운임", { exact: true })).toHaveValue("5,000");
  await expect(page.getByLabel("한 주문 최대", { exact: true })).not.toHaveValue("2");
  // 저장하지 않는 총 물량 입력은 남는다
  await expect(page.getByLabel("판매할 총 물량", { exact: true })).toHaveValue("50");
  await expect(page.getByText("최신 상품을 다시 불러와 주세요.")).toHaveCount(0);
  assertClean();
});

test("AC-04-8 DEV-361: withdrawing a pending first request on 물량·판매 설정 moves to 판매·가격", async ({ page, request }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const { draft, read, send } = await sellReadyDraft(request);
  const id = draft.productId;
  const named = await send("patch", `/api/products/${id}`, { version: draft.version, name: "철회 테스트 귤", variety: "조생" });
  await send("post", `/api/products/${id}/capacity-requests`, { requestedTotalGrams: 50_000, version: named.version });
  await page.goto(`${producerUrl}/products/${id}/sales`);
  await expect(page.getByText("판매 시작 요청", { exact: true })).toBeVisible();
  await expect(page.getByText(/50kg 공급 물량 심사 중/)).toBeVisible();
  await page.getByRole("button", { name: "신청 철회" }).click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${id}/sell$`));
  await expect(
    page.getByText("신청을 철회했어요. 판매·가격에서 고친 뒤 다시 요청해 주세요.", { exact: true }),
  ).toBeVisible();
  expect((await read(id)).status).toBe("DRAFT");
  assertClean();
});

test("AC-04-1 DEV-361: 판매·가격 blocks the first sale request with the missing field and sends no request", async ({ page, request }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  // 상품 정보는 있고 받는 시기가 빈 작성 중 상품(옵션만 고름)
  const headers = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
  const created = await request.post(`${apiUrl}/api/products`, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {},
  });
  expect(created.ok()).toBeTruthy();
  const draft = await created.json();
  const patched = await request.patch(`${apiUrl}/api/products/${draft.productId}`, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: { version: draft.version, name: "빈 칸 테스트 귤", variety: "조생", options: [{ label: "5kg", weightKg: 5 }] },
  });
  expect(patched.ok()).toBeTruthy();
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && /capacity-requests/.test(r.url())) sent.push(r.url());
  });
  await page.goto(`${producerUrl}/products/${draft.productId}/sell`);
  await page.getByLabel("판매할 총 물량", { exact: true }).fill("50");
  await page.getByRole("button", { name: "판매 시작 요청" }).click();
  await expect(page.getByRole("alert").getByText("받는 시기를 정해 주세요.", { exact: true })).toBeVisible();
  expect(sent).toEqual([]);
  assertClean();
});

test("AC-04-1 DEV-361: 상품 편집 → 판매·가격 save → back refreshes 상품 편집 so its next save is not a version conflict", async ({ page, request }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const { draft, read, send } = await sellReadyDraft(request);
  const id = draft.productId;
  await send("patch", `/api/products/${id}`, { version: draft.version, name: "왕복 테스트 귤", variety: "조생" });
  // 아래에 쌓인 화면과 칸 이름이 같아 보이는 것만 고른다
  const shown = <T extends ReturnType<Page["getByLabel"]>>(l: T) => l.filter({ visible: true });
  await page.goto(`${producerUrl}/products/${id}/edit`);
  await page.getByRole("button", { name: "다음: 판매·가격", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${id}/sell$`));
  await shown(page.getByLabel("도서산간 추가 운임", { exact: true })).fill("6000");
  await shown(page.getByLabel("판매할 총 물량", { exact: true })).fill("50");
  await shown(page.getByRole("button", { name: "저장", exact: true })).click();
  await expect(page.getByText("저장했어요", { exact: true })).toBeVisible();
  // 다음 '저장했어요'가 상품 편집 저장의 것이도록 이 토스트가 사라질 때까지 기다린다
  await expect(page.getByText("저장했어요", { exact: true })).toHaveCount(0);
  await shown(page.getByRole("button", { name: "뒤로", exact: true })).click();
  await expect(page).toHaveURL(new RegExp(`/products/${id}/edit$`));
  // 판매·가격에서 저장한 값으로 다시 채워져 있다
  await expect(shown(page.getByLabel("도서산간 추가 운임", { exact: true }))).toHaveValue("6,000");
  await shown(page.getByLabel("상품명", { exact: true })).fill("다시 고친 귤");
  await shown(page.getByRole("button", { name: "저장", exact: true })).click();
  await expect(page.getByText("저장했어요", { exact: true })).toBeVisible();
  await expect(page.getByText("최신 상품을 다시 불러와 주세요.")).toHaveCount(0);
  await expect
    .poll(async () => {
      const saved = (await read(id)) as Draft & { name: string };
      return [saved.name, saved.remoteAreaFee];
    })
    .toEqual(["다시 고친 귤", 6000]);
  assertClean();
});

test("AC-04-1 DEV-361: 상품 편집 keeps unsaved input after visiting another screen and coming back", async ({ page, request }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const { draft, send } = await sellReadyDraft(request);
  const id = draft.productId;
  await send("patch", `/api/products/${id}`, { version: draft.version, name: "원래 이름 귤", variety: "조생" });
  const shown = <T extends ReturnType<Page["getByLabel"]>>(l: T) => l.filter({ visible: true });
  await page.goto(`${producerUrl}/products/${id}/edit`);
  await expect(shown(page.getByLabel("상품명", { exact: true }))).toHaveValue("원래 이름 귤");
  await shown(page.getByLabel("상품명", { exact: true })).fill("고치는 중인 이름");
  await page.getByRole("link", { name: "원산지 표시 방법 보기" }).click();
  await expect(page).toHaveURL(/\/origin-notice/);
  await shown(page.getByRole("button", { name: "뒤로", exact: true })).click();
  await expect(page).toHaveURL(new RegExp(`/products/${id}/edit$`));
  // 돌아와 상품을 다시 읽어도 고치던 입력은 남는다
  await page.waitForLoadState("networkidle");
  await expect(shown(page.getByLabel("상품명", { exact: true }))).toHaveValue("고치는 중인 이름");
  assertClean();
});
