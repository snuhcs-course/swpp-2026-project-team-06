import { expect, test, type APIRequestContext, type Page } from "./fixtures";

import { apiLogin, apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

// DEV-361 PR A (FEAT-04 AC-04-1, PM 11/17): 판매 전 상품(작성 중·반려, 승인 물량 0)의 첫 판매 요청은 판매·가격(SCR-24b)에서만 한다.
// 11/17 실사용자가 물량·판매 설정의 첫 신청 버튼에서 "먼저 입력해 주세요: 받는 시기, 최대 지연 기한, 단계 가격"으로 막혔다.
// 시드: 한라봉(p-hallabong) 작성 중, 천혜향(p-cheonhye) 반려, 청견(p-cheonggyeon) 첫 신청 심사 중, 하우스 감귤(p-house) 판매 중.
test.use({ viewport: { width: 390, height: 844 } });

const toastText = "판매를 시작하려면 판매·가격을 먼저 채워 주세요";

test("AC-04-1 DEV-361: pre-sale cards open 판매·가격 and approved cards keep 물량·판매 설정", async ({ page }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products?filter=draft`);
  await expect(page.getByText("한라봉 5kg").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "물량·판매 설정", exact: true })).toHaveCount(0);
  // PR C: '판매페이지 수정'·'기간·가격'은 '상품 수정' 하나로 합쳤다
  const card = page
    .locator("div")
    .filter({ hasText: "한라봉 5kg" })
    .filter({ has: page.getByRole("button", { name: "판매·가격", exact: true }) })
    .last();
  await expect(card.getByRole("button", { name: "상품 수정", exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "판매페이지 수정" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "기간·가격" })).toHaveCount(0);
  await card.getByRole("button", { name: "판매·가격", exact: true }).click();
  await expect(page).toHaveURL(/\/products\/p-hallabong\/sell$/);
  await expect(page.getByRole("button", { name: "판매 시작 요청" })).toBeVisible();

  await page.goto(`${producerUrl}/products?filter=selling`);
  await expect(page.getByText("하우스 감귤 5kg / 10kg").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "판매·가격", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "물량·판매 설정", exact: true }).first().click();
  await expect(page).toHaveURL(/\/products\/[\w-]+\/sales$/);
  // 목록 카드 버튼도 같은 글자라(스택 아래 숨김) 화면 제목을 본다
  await expect(page.getByText("물량·판매 설정").last()).toBeVisible();
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

test("AC-04-1 DEV-361: 판매·가격 points to the 판매페이지 step for required product info it has no field for", async ({ page }) => {
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
  await expect(page.getByText("이 칸은 판매페이지(①)에서 채워요.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "판매페이지에서 채우기" }).click();
  // 판매·가격을 바로 열었으면(composer에서 오지 않음) 상품 수정(composer)을 연다(PR C)
  await expect(page).toHaveURL(/\/products\/(p-hallabong\/detail|source-analysis\?)/);
  // composer도 같은 주소를 읽는다. 테스트가 끝나며 페이지가 닫힐 때 진행 중인 가로채기 오류는 무시한다
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

/** 판매·가격 → 판매페이지(composer)에서 상품명·품종을 채우고 뒤로 돌아온다(나갈 때 임시 저장 = 판매 전 상품은 상품에 바로) */
async function fillInComposer(page: Page, id: string) {
  await page.getByRole("button", { name: "판매페이지에서 채우기" }).click();
  await expect(page).toHaveURL(/composer=1/);
  const basic = page.getByTestId("product-basic-info");
  await basic.getByLabel("상품명", { exact: true }).fill("테스트 귤");
  await basic.getByLabel("품종명", { exact: true }).fill("조생");
  await basic.getByLabel("품종명", { exact: true }).blur();
  await page.getByRole("button", { name: "뒤로", exact: true }).last().click();
  await expect(page.getByText("임시 저장됐어요", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/products/${id}/sell$`));
}

test("AC-04-1 DEV-361: 판매·가격 → 판매페이지 → back refreshes the notice and never overwrites changes made elsewhere", async ({
  page,
  request,
}) => {
  // 다른 곳에서 바뀐 칸을 고친 입력으로 저장하면 서버가 버전 충돌로 막는다(409, 콘솔 오류로 남음)
  const assertClean = monitor(page, [/409/]);
  await loginProducer(page, "강영수");

  // 1) 판매페이지에서 상품 정보를 채우고 돌아오면 빈 칸 안내가 사라지고 저장이 막히지 않는다
  const first = await sellReadyDraft(request);
  const id1 = first.draft.productId;
  await page.goto(`${producerUrl}/products/${id1}/sell`);
  await expect(page.getByText("판매 시작 전에 채워 주세요: 상품명, 품종", { exact: true })).toBeVisible();
  await page.getByLabel("도서산간 추가 운임", { exact: true }).fill("2");
  await fillInComposer(page, id1);
  await expect(page.getByText(/판매 시작 전에 채워 주세요/)).toHaveCount(0);
  // 판매·가격에서 고친 입력은 남는다(composer는 판매 조건 칸을 바꾸지 않음)
  await expect(page.getByLabel("도서산간 추가 운임", { exact: true })).toHaveValue("2");
  await page.getByLabel("판매할 총 물량", { exact: true }).fill("50");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장했어요", { exact: true })).toBeVisible();
  expect((await first.read(id1)) as Draft & { name: string }).toMatchObject({ name: "테스트 귤" });

  // 2) 판매·가격에서 먼저 고친 뒤 다른 곳(다른 기기)에서 판매 조건이 바뀌면 입력은 그대로 두고, 저장은 덮어쓰지 않는다
  const second = await sellReadyDraft(request);
  const id2 = second.draft.productId;
  await page.goto(`${producerUrl}/products/${id2}/sell`);
  await page.getByLabel("도서산간 추가 운임", { exact: true }).fill("2");
  await page.getByLabel("판매할 총 물량", { exact: true }).fill("50");
  await second.send("patch", `/api/products/${id2}`, { version: (await second.read(id2)).version, remoteAreaFee: 5000 });
  await fillInComposer(page, id2);
  await expect(page.getByLabel("도서산간 추가 운임", { exact: true })).toHaveValue("2");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert").getByText("최신 상품을 다시 불러와 주세요.")).toBeVisible();
  expect((await second.read(id2)).remoteAreaFee).toBe(5000);
  // 막힌 자리에서 바로 최신 값으로 다시 채울 수 있다(입력이 서버 값으로 바뀜)
  await page.getByRole("button", { name: "최신 값 다시 불러오기" }).click();
  await expect(page.getByLabel("도서산간 추가 운임", { exact: true })).toHaveValue("5,000");
  await expect(page.getByLabel("도서산간 추가 운임", { exact: true })).not.toHaveValue("2");
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

test("AC-04-1 DEV-361: 판매페이지 → 판매·가격 save → back refreshes the composer so its next save is not a version conflict", async ({ page, request }) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true", "Requires explicitly enabled local source API");
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const { draft, read, send } = await sellReadyDraft(request);
  const id = draft.productId;
  // '다음: 판매·가격'은 대표사진이 있어야 넘어간다
  await send("patch", `/api/products/${id}`, { version: draft.version, name: "왕복 테스트 귤", variety: "조생", photos: ["/photos/tangerine-box.jpg"] });
  await page.goto(`${producerUrl}/products/${id}/detail`);
  await expect(page).toHaveURL(/composer=1/);
  await page.getByRole("button", { name: "다음: 판매·가격", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${id}/sell\\?from=composer$`));
  // 아래에 쌓인 composer와 칸 이름이 겹치지 않게 보이는 것만 고른다
  const shown = <T extends ReturnType<Page["getByLabel"]>>(l: T) => l.filter({ visible: true });
  await shown(page.getByLabel("도서산간 추가 운임", { exact: true })).fill("6000");
  await shown(page.getByLabel("판매할 총 물량", { exact: true })).fill("50");
  await shown(page.getByRole("button", { name: "저장", exact: true })).click();
  await expect(page.getByText("저장했어요", { exact: true })).toBeVisible();
  await expect(page.getByText("저장했어요", { exact: true })).toHaveCount(0);
  await shown(page.getByRole("button", { name: "뒤로", exact: true })).click();
  await expect(page).toHaveURL(/composer=1/);
  const basic = page.getByTestId("product-basic-info");
  await basic.getByLabel("상품명", { exact: true }).fill("다시 고친 귤");
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.getByText(/저장했어요/).first()).toBeVisible();
  await expect(page.getByText("최신 상품을 다시 불러와 주세요.")).toHaveCount(0);
  await expect
    .poll(async () => {
      const saved = (await read(id)) as Draft & { name: string };
      return [saved.name, saved.remoteAreaFee];
    })
    .toEqual(["다시 고친 귤", 6000]);
  assertClean();
});

test("AC-04-1 DEV-361: the composer keeps unsaved input after visiting another screen and coming back", async ({ page, request }) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true", "Requires explicitly enabled local source API");
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const { draft, send } = await sellReadyDraft(request);
  const id = draft.productId;
  await send("patch", `/api/products/${id}`, { version: draft.version, name: "원래 이름 귤", variety: "조생" });
  const shown = <T extends ReturnType<Page["getByLabel"]>>(l: T) => l.filter({ visible: true });
  // 예전 상품 편집 주소는 composer로 간다(PR C)
  await page.goto(`${producerUrl}/products/${id}/edit`);
  await expect(page).toHaveURL(/composer=1/);
  await expect(shown(page.getByLabel("상품명", { exact: true }))).toHaveValue("원래 이름 귤");
  await shown(page.getByLabel("상품명", { exact: true })).fill("고치는 중인 이름");
  await page.getByText("상품정보", { exact: true }).click();
  await page.getByRole("link", { name: "원산지 표시 방법 보기" }).click();
  await expect(page).toHaveURL(/\/origin-notice/);
  await shown(page.getByRole("button", { name: "뒤로", exact: true })).click();
  await expect(page).toHaveURL(/composer=1/);
  // 돌아와 상품을 다시 읽어도 고치던 입력은 남는다
  await page.waitForLoadState("networkidle");
  await expect(shown(page.getByLabel("상품명", { exact: true }))).toHaveValue("고치는 중인 이름");
  assertClean();
});
