import { expect, test, type APIRequestContext } from "./fixtures";

import { apiLogin, apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

// DEV-345 (AC-04-9, 판매 설정·SCR-26, PM 11/16): 품절 상품에 무엇을 늘려야 하는지 안내하고,
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
  const setLimit = async (id: string, grams: number) => {
    const p = await read(id);
    const response = await request.put(`${apiUrl}/api/products/${id}/sales-settings`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: {
        salesLimitGrams: grams,
        maxQuantityPerOrder: p.maxQuantityPerOrder,
        salesPaused: p.salesPaused,
        version: p.version,
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  /** 기간 stageId의 옵션 박스 수만 바꿔 저장한다(나머지는 그대로) */
  const setStageQuantity = async (
    id: string,
    stageId: string,
    quantity: (optionId: string, value: { quantity: number; reservedCount: number }) => number,
  ) => {
    const p = await read(id);
    const stages = p.stages.map((s) => ({
      stageId: s.stageId,
      name: s.name,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      options: Object.fromEntries(
        Object.entries(s.options).map(([k, v]) => [
          k,
          { price: v.price, quantity: s.stageId === stageId ? quantity(k, v) : v.quantity },
        ]),
      ),
    }));
    const response = await request.put(`${apiUrl}/api/products/${id}/stages`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { stages, version: p.version },
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
  return { read, setLimit, setStageQuantity, createDraft };
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

test("AC-04-9 DEV-345: sales settings tells a sold-out product what to raise (total and this period)", async ({
  page,
  request,
}) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await withHouseSoldOut(request, async (p) => {
    await page.goto(`${producerUrl}/products/p-house/sales`);
    await expect(page.getByText("전체 물량 품절", { exact: true })).toBeInViewport();
    await expect(
      page.getByText(
        `판매 한도 ${kg(p.salesLimitGrams)}를 모두 채웠어요. 승인 ${kg(p.approvedSupplyGrams)}까지 늘릴 수 있어요.`,
        { exact: true },
      ),
    ).toBeInViewport();
    // 품절이면 '자유롭게 판매해요' 상태 줄을 숨긴다(PM 11/16)
    await expect(page.getByText("승인된 물량 안에서 자유롭게 판매해요")).toHaveCount(0);
  });

  // 시드 레드향(p-redhyang)은 이번 기간 품절이다(DEV-327 시드와 같음)
  expect((await (await producerApi(request)).read("p-redhyang")).availability).toBe("PERIOD_SOLD_OUT");
  await page.goto(`${producerUrl}/products/p-redhyang/sales`);
  await expect(page.getByText("이번 기간 품절", { exact: true })).toBeInViewport();
  await expect(
    page.getByText("이번 기간에 남은 박스가 없어요. 기간·가격에서 박스 수를 늘리면 바로 다시 예약받아요.", {
      exact: true,
    }),
  ).toBeInViewport();
  await expect(page.getByText("승인된 물량 안에서 자유롭게 판매해요")).toHaveCount(0);
  await page.getByRole("button", { name: "기간·가격에서 박스 늘리기" }).click();
  await expect(page).toHaveURL(/\/products\/p-redhyang\/stages\?from=sales$/);
  assertClean();
});

test("AC-04-9 DEV-345: sales save results appear under Save and an over-approved limit leads to the supply request", async ({
  page,
  request,
}) => {
  // 승인 물량을 넘는 한도 저장은 409(서버가 거절한 것을 화면이 보여 주는 것이 이 테스트의 대상)
  const assertClean = monitor(page, [/Failed to load resource: the server responded with a status of 409/]);
  await loginProducer(page, "강영수");
  const p = await (await producerApi(request)).read("p-house");
  await page.goto(`${producerUrl}/products/p-house/sales`);
  const limit = page.getByLabel("현재 판매 한도 (kg)");
  await expect(limit).toHaveValue(String(p.salesLimitGrams / 1000));

  await limit.fill(String(p.approvedSupplyGrams / 1000 + 1));
  await page.getByRole("button", { name: "판매 설정 저장" }).click();
  await expect(page.getByText("승인 물량을 넘어요. 물량 추가를 신청해 주세요.", { exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "물량 추가 신청하기" }).click();
  const requestInput = page.getByLabel("신청 후 총 공급 물량 (kg)");
  await expect(requestInput).toBeFocused();
  await expect(requestInput).toBeInViewport();

  // 성공 안내도 저장 버튼 아래(화면 안)에 보인다. 값은 원래 한도 그대로라 상태는 바뀌지 않는다
  await limit.fill(String(p.salesLimitGrams / 1000));
  await page.getByRole("button", { name: "판매 설정 저장" }).click();
  await expect(page.getByText("판매 설정을 저장했어요.", { exact: true })).toBeInViewport();
  await expect(page.getByText("승인 물량을 넘어요. 물량 추가를 신청해 주세요.")).toHaveCount(0);
  assertClean();
});

test("SCR-26 AC-04-9 DEV-345: saving periods while still fully sold out stays and offers to raise the sales limit", async ({
  page,
  request,
}) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await withHouseSoldOut(request, async (p) => {
    await page.goto(`${producerUrl}/products/p-house/stages`);
    await expect(page.getByRole("button", { name: "예약 기간 저장" })).toBeVisible();
    // 값을 바꾸지 않고 저장해도 서버 저장 뒤 상품을 다시 읽어 판단한다(박스만으로는 kg 품절이 풀리지 않는다)
    await page.getByRole("button", { name: "예약 기간 저장" }).click();
    await expect(page.getByText("박스 수를 저장했어요.", { exact: true })).toBeInViewport();
    await expect(
      page.getByText(`판매 한도(${kg(p.salesLimitGrams)})를 모두 써서 아직 예약을 받을 수 없어요.`, { exact: true }),
    ).toBeInViewport();
    await expect(page).toHaveURL(/\/products\/p-house\/stages$/);
    await page.getByRole("button", { name: "판매 한도 늘리기" }).click();
    await expect(page).toHaveURL(/\/products\/p-house\/sales$/);
    await expect(page.getByText("전체 물량 품절", { exact: true })).toBeVisible();
  });
  assertClean();
});

test("SCR-26 DEV-345: saving periods of a sellable product still goes back", async ({ page, request }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  expect((await (await producerApi(request)).read("p-house")).availability).toBe("AVAILABLE");
  await page.goto(`${producerUrl}/products/p-house/stages`);
  await page.getByRole("button", { name: "예약 기간 저장" }).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByText("박스 수를 저장했어요.")).toHaveCount(0);
  assertClean();
});

test("SCR-26 DEV-345: sales settings → periods → 'Raise sales limit' returns to the same sales screen", async ({
  page,
  request,
}) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const api = await producerApi(request);
  await withHouseSoldOut(request, async (p) => {
    // 지금 기간 박스도 다 팔린 상태로 둔다(판매 박스 = 예약+출하 박스) → 판매 설정에 '기간·가격에서 박스 늘리기'
    const house = await api.read("p-house");
    const current = house.stages.find((s) => s.stageId === house.currentStageId)!;
    const before = Object.fromEntries(Object.entries(current.options).map(([k, v]) => [k, v.quantity]));
    await api.setStageQuantity("p-house", current.stageId, (_, v) => v.reservedCount);
    try {
      await page.goto(`${producerUrl}/products/p-house/sales`);
      await expect(
        page.getByText("이번 기간에 남은 박스도 없어요. 기간·가격에서 박스 수도 늘려 주세요.", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "기간·가격에서 박스 늘리기" }).click();
      await expect(page).toHaveURL(/\/products\/p-house\/stages\?from=sales$/);
      await page.getByRole("button", { name: "예약 기간 저장" }).click();
      await expect(
        page.getByText(`판매 한도(${kg(p.salesLimitGrams)})를 모두 써서 아직 예약을 받을 수 없어요.`, { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "판매 한도 늘리기" }).click();
      await expect(page).toHaveURL(/\/products\/p-house\/sales$/);
      // 다시 쌓지 않고 돌아왔으므로 뒤로는 기간·가격이 아니라 상품 목록으로 간다
      await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
      await expect(page).toHaveURL(/\/products$/);
    } finally {
      await api.setStageQuantity("p-house", current.stageId, (optionId) => before[optionId]);
    }
  });
  assertClean();
});

test("SCR-26 AC-04-9 DEV-345: an unapproved product goes back after saving periods and gets no sold-out guide", async ({
  page,
  request,
}) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const api = await producerApi(request);
  const draft = await api.createDraft();
  expect(draft.status).toBe("DRAFT");
  await page.goto(`${producerUrl}/products/${draft.productId}/stages`);
  // 빈 기간 하나가 오늘(서버 시각)부터 시작한다
  await page.getByLabel("5kg 가격").fill("30000");
  await page.getByLabel("5kg 판매 물량").fill("10");
  await page.getByRole("button", { name: "예약 기간 저장" }).click();
  await expect(page).toHaveURL(/\/products$/);
  // 승인 전이라 한도 0 → 서버는 TOTAL_SOLD_OUT이지만 품절 안내 대상이 아니다
  const saved = await api.read(draft.productId);
  expect(saved.availability).toBe("TOTAL_SOLD_OUT");
  await page.goto(`${producerUrl}/products/${draft.productId}/sales`);
  await expect(page.getByText("공급 물량을 확인한 뒤 예약을 시작해요", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "공급 물량 승인 요청" })).toBeVisible();
  await expect(page.getByText("전체 물량 품절")).toHaveCount(0);
  await expect(page.getByText("박스 수를 저장했어요.")).toHaveCount(0);
  assertClean();
});
