import { expect, test, type APIRequestContext } from "./fixtures";

import { apiLogin, apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

// DEV-345 (AC-04-9, 판매 설정·SCR-26, PM 11/16): 품절 상품에 무엇을 늘려야 하는지 안내하고,
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
  return { read, setLimit, setPaused, setStageQuantity, restoreStages, createDraft };
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
    page.getByText("이번 기간에 남은 박스가 없어요. 상품 수정의 판매 조건에서 박스 수를 늘려 '상품에 반영'하면 다시 예약받아요.", {
      exact: true,
    }),
  ).toBeInViewport();
  await expect(page.getByText("승인된 물량 안에서 자유롭게 판매해요")).toHaveCount(0);
  await page.getByRole("button", { name: "판매 조건에서 박스 늘리기" }).click();
  // 상품 수정(composer)이 판매 조건 시트를 연 채로 열린다(DEV-361 C-14)
  await expect(page.getByTestId("sales-terms-editor")).toBeVisible();
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

test("AC-04-9 DEV-345 DEV-361 DEV-487: applying sales terms while still fully sold out offers to raise the sales limit", async ({
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
      await expect(
        page.getByText(`판매 한도(${kg(p.salesLimitGrams)})를 모두 써서 아직 예약을 받을 수 없어요.`, { exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(/composer=1/);
      await page.getByRole("button", { name: "판매 한도 늘리기" }).click();
      await expect(page).toHaveURL(/\/products\/p-house\/sales$/);
      await expect(page.getByText("전체 물량 품절", { exact: true })).toBeVisible();
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
    await expect(page.getByText(/를 모두 써서 아직 예약을 받을 수 없어요/)).toHaveCount(0);
  } finally {
    await api.restoreStages("p-house", house.stages);
  }
  assertClean();
});

test("AC-04-9 DEV-345 DEV-361: sales settings → 판매 조건 → 'Raise sales limit' returns to the same sales screen", async ({
  page,
  request,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true", "Requires explicitly enabled local source API");
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const api = await producerApi(request);
  await withHouseSoldOut(request, async (p) => {
    // 지금 기간 박스도 다 팔린 상태로 둔다(판매 박스 = 예약+출하 박스) → 판매 설정에 '판매 조건에서 박스 늘리기'
    const house = await api.read("p-house");
    const current = house.stages.find((s) => s.stageId === house.currentStageId)!;
    await api.setStageQuantity("p-house", current.stageId, (_, v) => v.reservedCount);
    try {
      await page.goto(`${producerUrl}/products/p-house/sales`);
      await expect(
        page.getByText("이번 기간에 남은 박스도 없어요. 상품 수정의 판매 조건에서 박스 수도 늘려 주세요.", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "판매 조건에서 박스 늘리기" }).click();
      await applyTermsChange(page);
      await expect(
        page.getByText(`판매 한도(${kg(p.salesLimitGrams)})를 모두 써서 아직 예약을 받을 수 없어요.`, { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "판매 한도 늘리기" }).click();
      await expect(page).toHaveURL(/\/products\/p-house\/sales$/);
      // 다시 쌓지 않고 돌아왔으므로 뒤로는 상품 수정이 아니라 상품 목록으로 간다
      await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
      await expect(page).toHaveURL(/\/products$/);
    } finally {
      await api.restoreStages("p-house", house.stages);
    }
  });
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
  // DEV-361: 판매 전 상품은 물량·판매 설정 대신 판매·가격으로 옮긴다(첫 판매 요청은 거기서만)
  await page.goto(`${producerUrl}/products/${draft.productId}/sales`);
  await expect(page).toHaveURL(new RegExp(`/products/${draft.productId}/sell$`));
  await expect(page.getByText("판매를 시작하려면 판매·가격을 먼저 채워 주세요", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "판매 시작 요청" }).last()).toBeVisible();
  await expect(page.getByText("전체 물량 품절")).toHaveCount(0);
  assertClean();
});

test("AC-04-9 DEV-345: pause and resume results appear right under the pause button", async ({ page, request }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  const api = await producerApi(request);
  expect((await api.read("p-house")).salesPaused).toBe(false);
  try {
    await page.goto(`${producerUrl}/products/p-house/sales`);
    await page.getByRole("button", { name: "판매 중지" }).click();
    await page.getByRole("button", { name: "확인", exact: true }).click();
    const resume = page.getByRole("button", { name: "판매 재개" });
    const paused = page.getByText("판매를 중지했어요. 기존 예약은 유지돼요.", { exact: true });
    await expect(paused).toBeInViewport();
    // 안내는 맨 아래가 아니라 누른 버튼(이제 ‘판매 재개’) 바로 아래
    const [button, note] = [await resume.boundingBox(), await paused.boundingBox()];
    expect(note!.y).toBeGreaterThan(button!.y);
    expect(note!.y - (button!.y + button!.height)).toBeLessThan(40);
    await resume.click();
    await page.getByRole("button", { name: "확인", exact: true }).click();
    await expect(page.getByText("판매를 재개했어요.", { exact: true })).toBeInViewport();
    await expect(paused).toHaveCount(0);
  } finally {
    if ((await api.read("p-house")).salesPaused) await api.setPaused("p-house", false);
  }
  assertClean();
});
