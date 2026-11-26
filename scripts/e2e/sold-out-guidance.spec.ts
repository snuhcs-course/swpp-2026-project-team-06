import { expect, test, type APIRequestContext } from "./fixtures";

import { apiLogin, apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

// DEV-345 (AC-04-9, 판매 설정·SCR-26, PM 11/16): 품절 상품에 무엇을 늘려야 하는지 안내하고,
// DEV-487: 물량·판매 설정 화면을 없애고 상품 카드의 '판매 관리' 시트(총 물량·판매 중지·철회)로 바꿨다.
// DEV-361 PR C: 예약 기간·가격(SCR-26)은 상품 수정(composer)의 판매 조건 시트가 됐다(`/stages` → `/detail?terms=1`).
// 저장 결과는 누른 버튼 바로 아래에 보인다. 휴대폰 폭(390×844)에서 본다.
// 시드 하우스 감귤(p-house)의 판매 한도를 사용량까지 낮춰 전체 물량 품절을 만들고, 테스트 끝에 원래 값으로 되돌린다.
test.use({ viewport: { width: 390, height: 844 } });

const kg = (g: number) => `${(g / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}kg`;

type Product = {
  productId: string;
  status: string;
  currentStageId: string | null;
  version: number;
  availability: string;
  approvedSupplyGrams: number;
  salesLimitGrams: number;
  reservedGrams: number;
  shippedGrams: number;
  maxQuantityPerOrder: number;
  salesPaused: boolean;
  stages: {
    stageId: string;
    name?: string;
    startsAt: string;
    endsAt: string;
    options: Record<string, { price: number; quantity: number; reservedCount: number }>;
  }[];
};

async function producerApi(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
  const read = async (id: string): Promise<Product> => {
    const response = await request.get(`${apiUrl}/api/products/mine/${id}`, { headers });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const putSales = async (id: string, change: (p: Product) => { salesLimitGrams?: number; salesPaused?: boolean }) => {
    const p = await read(id);
    const response = await request.put(`${apiUrl}/api/products/${id}/sales-settings`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: {
        salesLimitGrams: p.salesLimitGrams,
        maxQuantityPerOrder: p.maxQuantityPerOrder,
        salesPaused: p.salesPaused,
        version: p.version,
        ...change(p),
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  const setLimit = (id: string, grams: number) => putSales(id, () => ({ salesLimitGrams: grams }));
  const setPaused = (id: string, paused: boolean) => putSales(id, () => ({ salesPaused: paused }));
  /** 심사 중인 공급 신청을 철회한다(테스트 정리용) */
  const withdraw = async (id: string, requestId: string, version: number) => {
    const response = await request.post(`${apiUrl}/api/products/${id}/capacity-requests/${requestId}/withdraw`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { version },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  /** 읽어 둔 기간 값(가격·박스 수·날짜)으로 되돌린다(DEV-487: 반영이 가격과 박스 수를 함께 바꿈) */
  const restoreStages = async (id: string, saved: Product["stages"]) => {
    const p = await read(id);
    const response = await request.put(`${apiUrl}/api/products/${id}/stages`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: {
        version: p.version,
        stages: saved.map((s) => ({
          stageId: s.stageId,
          name: s.name,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          options: Object.fromEntries(Object.entries(s.options).map(([k, v]) => [k, { price: v.price, quantity: v.quantity }])),
        })),
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  /** 5kg 옵션 하나만 있는 새 작성 중 상품(승인 전: 판매 한도 0) */
  const createDraft = async (): Promise<Product> => {
    const created = await request.post(`${apiUrl}/api/products`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: {},
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const draft: Product = await created.json();
    const patched = await request.patch(`${apiUrl}/api/products/${draft.productId}`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { version: draft.version, options: [{ label: "5kg", weightKg: 5 }] },
    });
    expect(patched.ok(), await patched.text()).toBeTruthy();
    return read(draft.productId);
  };
  return { read, setLimit, setPaused, withdraw, restoreStages, createDraft };
}

/** p-house를 전체 물량 품절(한도 = 예약+출하, 승인 물량 > 한도)로 두고 run 뒤 한도를 되돌린다 */
async function withHouseSoldOut(request: APIRequestContext, run: (p: Product) => Promise<void>) {
  const api = await producerApi(request);
  const before = await api.read("p-house");
  await api.setLimit("p-house", before.reservedGrams + before.shippedGrams);
  try {
    const soldOut = await api.read("p-house");
    expect(soldOut.availability).toBe("TOTAL_SOLD_OUT");
    expect(soldOut.approvedSupplyGrams).toBeGreaterThan(soldOut.salesLimitGrams);
    await run(soldOut);
  } finally {
    await api.setLimit("p-house", before.salesLimitGrams);
  }
}

/**
 * 판매 조건 시트에서 마지막 기간 5kg 가격을 1,000원 올려 담고 '상품에 반영'까지 한다.
 * DEV-487부터 박스 수 칸이 없고, 반영하면 기간 박스 수는 제한 없음(UNLIMITED_BOXES)으로 저장된다
 */
async function applyTermsChange(page: import("@playwright/test").Page) {
  const editor = page.getByTestId("sales-terms-editor");
  await expect(editor).toBeVisible();
  const price = editor.getByLabel("5kg 가격").last();
  await price.fill(String(Number((await price.inputValue()).replace(/,/g, "")) + 1000));
  await page.getByRole("button", { name: "수정 담기", exact: true }).click();
  await page.getByRole("button", { name: /^상품에 반영/ }).click();
  await page.getByTestId("apply-confirm").getByRole("button", { name: "반영하기", exact: true }).click();
  await expect(page.getByText("상품에 반영했어요", { exact: true })).toBeVisible();
}

test("AC-04-9 DEV-345 DEV-361 DEV-487: applying sales terms while still fully sold out explains the total is sold", async ({
  page,
  request,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true", "Requires explicitly enabled local source API");
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const api = await producerApi(request);
  const house = await api.read("p-house");
  await withHouseSoldOut(request, async (p) => {
    try {
      // 예전 기간·가격 주소는 판매 조건 시트를 연 상품 수정으로 간다
      await page.goto(`${producerUrl}/products/p-house/stages`);
      await applyTermsChange(page);
      // 판매 조건을 반영해도 kg 품절은 풀리지 않는다: 반영 뒤 상품을 다시 읽어 안내한다
      // DEV-487: 한도 늘리기 화면이 없어 버튼 없이 안내만(늘리기는 상품 목록의 '판매 관리')
      await expect(
        page.getByText(`총 물량(${kg(p.salesLimitGrams)})을 모두 팔았어요. 상품 목록의 판매 관리에서 늘릴 수 있어요.`, { exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(/composer=1/);
      await expect(page.getByRole("button", { name: "판매 한도 늘리기" })).toHaveCount(0);
    } finally {
      await api.restoreStages("p-house", house.stages);
    }
  });
  assertClean();
});

test("AC-04-9 DEV-345 DEV-361: applying sales terms of a sellable product stays on the composer without the sold-out note", async ({ page, request }) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true", "Requires explicitly enabled local source API");
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const api = await producerApi(request);
  const house = await api.read("p-house");
  expect(house.availability).toBe("AVAILABLE");
  try {
    await page.goto(`${producerUrl}/products/p-house/stages`);
    await applyTermsChange(page);
    await expect(page).toHaveURL(/composer=1/);
    await expect(page.getByText(/을 모두 팔았어요\. 상품 목록의 판매 관리에서 늘릴 수 있어요/)).toHaveCount(0);
  } finally {
    await api.restoreStages("p-house", house.stages);
  }
  assertClean();
});

test("AC-04-9 DEV-345 DEV-361: an unapproved product's old 기간·가격 address opens 판매·가격 and gets no sold-out guide", async ({
  page,
  request,
}) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const api = await producerApi(request);
  const draft = await api.createDraft();
  expect(draft.status).toBe("DRAFT");
  // 판매 전 상품의 기간·가격은 판매·가격(②)에서 정한다(C-13)
  await page.goto(`${producerUrl}/products/${draft.productId}/stages`);
  await expect(page).toHaveURL(new RegExp(`/products/${draft.productId}/sell`));
  // 오늘(서버 시각)부터 여는 기간 하나를 둔다(예전 SCR-26 저장과 같은 값, 화면 입력은 판매·가격 spec이 본다)
  const headers = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
  const mine = await (await request.get(`${apiUrl}/api/products/mine/${draft.productId}`, { headers })).json();
  const stage = await request.put(`${apiUrl}/api/products/${draft.productId}/stages`, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      version: mine.version,
      stages: [{ startsAt: "2026-10-07", endsAt: "2026-10-31", options: { [mine.options[0].optionId]: { price: 30000, quantity: 10 } } }],
    },
  });
  expect(stage.ok(), await stage.text()).toBeTruthy();
  // 승인 전이라 한도 0 → 서버는 TOTAL_SOLD_OUT이지만 품절 안내 대상이 아니다
  const saved = await api.read(draft.productId);
  expect(saved.availability).toBe("TOTAL_SOLD_OUT");
  // 판매 전 상품 카드에는 '판매 관리' 대신 '판매·가격'(DEV-487)
  await page.goto(`${producerUrl}/products?filter=draft`);
  await expect(page.getByRole("button", { name: "판매·가격", exact: true }).first()).toBeVisible();
  assertClean();
});

/** 상품 목록에서 하우스 감귤 카드의 '판매 관리'를 연다 */
async function openManage(page: import("@playwright/test").Page, filter = "selling") {
  await page.goto(`${producerUrl}/products?filter=${filter}`);
  await page
    .getByRole("button", { name: "하우스 감귤 5kg / 10kg 상품 수정", exact: true })
    .locator("xpath=..")
    .getByRole("button", { name: "판매 관리", exact: true })
    .click();
  const sheet = page.getByTestId("sales-manage-sheet");
  await expect(sheet).toBeVisible();
  return sheet;
}

test("AC-04-9 DEV-487: 판매 관리 lowers the total at once, refuses below reserved+shipped, and requests approval above the approved supply", async ({
  page,
  request,
}) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const api = await producerApi(request);
  const before = await api.read("p-house");
  const committed = before.reservedGrams + before.shippedGrams;
  try {
    let sheet = await openManage(page);
    await expect(sheet.getByText(kg(before.salesLimitGrams), { exact: true })).toBeVisible();
    await expect(sheet.getByText(kg(committed), { exact: true })).toBeVisible();
    // 예약·출하보다 적게는 안 된다(요청을 보내지 않음)
    await sheet.getByRole("button", { name: "총 물량 바꾸기" }).click();
    const total = sheet.getByRole("textbox", { name: "총 물량" });
    await total.fill(String(committed / 1000 - 1));
    await sheet.getByRole("button", { name: "저장", exact: true }).click();
    await expect(sheet.getByText(`이미 예약·출하된 ${kg(committed)}보다 적게 할 수 없어요.`, { exact: true })).toBeVisible();
    // 승인 물량 안에서 줄이기는 심사 없이 바로
    const lower = before.salesLimitGrams - 100_000;
    await total.fill(String(lower / 1000));
    await sheet.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText(`총 물량을 ${kg(lower)}으로 바꿨어요.`, { exact: true })).toBeVisible();
    expect((await api.read("p-house")).salesLimitGrams).toBe(lower);
    // 승인 물량보다 늘리면 운영팀 승인 요청(버튼 글자가 바뀜), 심사 중 칩 안에서 철회
    const higher = before.approvedSupplyGrams + 500_000;
    sheet = await openManage(page);
    await sheet.getByRole("button", { name: "총 물량 바꾸기" }).click();
    await sheet.getByRole("textbox", { name: "총 물량" }).fill(String(higher / 1000));
    await expect(sheet.getByText(/운영팀이 확인한 뒤 늘어나요/)).toBeVisible();
    await sheet.getByRole("button", { name: "늘리기 요청", exact: true }).click();
    await expect(page.getByText(`${kg(higher)}으로 늘리기를 요청했어요. 운영팀이 확인하면 늘어나요.`, { exact: true })).toBeVisible();
    expect((await api.read("p-house")).salesLimitGrams).toBe(lower);
    sheet = await openManage(page);
    await expect(sheet.getByTestId("pending-chip")).toContainText(`${kg(higher)}으로 늘리기 심사 중`);
    await sheet.getByRole("button", { name: "늘리기 요청 철회" }).click();
    await sheet.getByRole("button", { name: "철회", exact: true }).click();
    await expect(page.getByText("늘리기 요청을 철회했어요.", { exact: true })).toBeVisible();
  } finally {
    // 중간에 실패해도 다른 spec이 CAPACITY_REQUEST_PENDING에 걸리지 않게 남은 증액 신청을 거둔다
    const left = (await api.read("p-house")) as Product & { pendingCapacityRequest?: { requestId: string; version: number } | null };
    if (left.pendingCapacityRequest) await api.withdraw("p-house", left.pendingCapacityRequest.requestId, left.pendingCapacityRequest.version);
    await api.setLimit("p-house", before.salesLimitGrams);
  }
  assertClean();
});

test("AC-04-9 DEV-487: pausing asks once more and says it can be resumed; resuming is immediate", async ({ page, request }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const api = await producerApi(request);
  expect((await api.read("p-house")).salesPaused).toBe(false);
  try {
    let sheet = await openManage(page);
    await sheet.getByRole("button", { name: "판매 중지" }).click();
    await expect(sheet.getByText("판매를 멈출까요?", { exact: true })).toBeVisible();
    await expect(sheet.getByText(/판매 관리에서 언제든 다시 재개할 수 있어요/)).toBeVisible();
    await sheet.getByRole("button", { name: "판매 중지", exact: true }).click();
    await expect(page.getByText("판매를 중지했어요. 기존 예약은 유지돼요.", { exact: true })).toBeVisible();
    expect((await api.read("p-house")).salesPaused).toBe(true);
    sheet = await openManage(page, "paused");
    await sheet.getByRole("button", { name: "판매 재개" }).click();
    await expect(page.getByText("판매를 재개했어요.", { exact: true })).toBeVisible();
    expect((await api.read("p-house")).salesPaused).toBe(false);
  } finally {
    if ((await api.read("p-house")).salesPaused) await api.setPaused("p-house", false);
  }
  assertClean();
});
