// DEV-216·DEV-218 (FEAT-08 E1, AC-08-8·AC-08-9): 주문서를 연 뒤 가격이 바뀌면 주문 없이 바뀐 금액을 보이고
// '바뀐 금액으로 예약하기'로만 만든다. 판매 중지 409에는 그 버튼 없이 꺼진 '예약하기'와 '다시 확인하기'.
// 실서버(FastAPI + 소비자 앱) 대상. 시드 p-house 1단계 5kg 29,000원(FIXED_NOW 2026-10-07).
import { expect, test } from "./fixtures";
import type { APIRequestContext, Page } from "./fixtures";

import { apiLogin, apiUrl, consumerUrl, loginConsumer, monitor } from "./helpers";

async function producerHeaders(request: APIRequestContext) {
  const token = await apiLogin(request, "u-kang", "producer");
  return { Authorization: `Bearer ${token}` };
}

/** 생산자가 p-house 1단계 5kg 가격을 바꾼다 */
async function setStagePrice(request: APIRequestContext, price: number) {
  const headers = await producerHeaders(request);
  const product = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers })).json();
  const stages = product.stages.map((s: { stageId: string; options: Record<string, { price: number; quantity: number }> }, i: number) => ({
    ...s,
    options: Object.fromEntries(
      Object.entries(s.options).map(([id, o]) => [
        id,
        { price: i === 0 && id === "opt-5" ? price : o.price, quantity: o.quantity },
      ]),
    ),
  }));
  const response = await request.put(`${apiUrl}/api/products/p-house/stages`, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: { version: product.version, stages },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function setPaused(request: APIRequestContext, paused: boolean) {
  const headers = await producerHeaders(request);
  const product = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers })).json();
  const response = await request.put(`${apiUrl}/api/products/p-house/sales-settings`, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      salesLimitGrams: product.salesLimitGrams,
      maxQuantityPerOrder: product.maxQuantityPerOrder,
      salesPaused: paused,
      version: product.version,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

/** 주문서를 열고 새 주소·동의 5개를 채운다 */
async function openFilledCheckout(page: Page) {
  await loginConsumer(page);
  const addresses = page.waitForResponse(
    (r) => r.url() === `${apiUrl}/api/auth/me/addresses` && r.request().method() === "GET",
  );
  await page.goto(`${consumerUrl}/checkout/p-house?optionId=opt-5&quantity=1`);
  if ((await (await addresses).json()).length === 0) {
    await page.getByRole("button", { name: "받는 사람과 주소 입력" }).click();
  } else {
    await page.getByRole("button", { name: "받는 곳 변경" }).click();
    await page.getByRole("button", { name: "새 주소 입력" }).click();
  }
  await page.getByLabel("받는 사람").fill("DEV216 구매자");
  await page.getByLabel("연락처").fill("010-1234-5678");
  await page.getByLabel("우편번호").fill("04001");
  await page.getByRole("textbox", { name: "주소", exact: true }).fill("서울 마포구 월드컵북로 12");
  await page.getByLabel("상세 주소").fill("302호");
  await page.getByRole("button", { name: "이 주소로 받기" }).click();
  // DEV-293: 배송 메모는 선택 목록 + 직접 입력
  await page.getByRole("button", { name: "배송 메모 고르기" }).click();
  await page.getByRole("radio", { name: "직접 입력" }).click();
  await page.getByLabel("배송 메모", { exact: true }).fill("문 앞에 두어 주세요");
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
  await expect(page.getByText("29,000원").first()).toBeVisible();
}

test.afterEach(async ({ request }) => {
  await setPaused(request, false);
  await setStagePrice(request, 29000);
});

test("AC-08-8: price changed while the checkout is open → notice, no order, reconfirm creates a 30,000원 order", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const assertClean = monitor(page, [/409/]);
  await openFilledCheckout(page);
  await setStagePrice(request, 30000);

  const created = page.waitForResponse(
    (r) => r.url() === `${apiUrl}/api/orders` && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^[\d,]+원 예약하기$/ }).click();
  const first = await created;
  expect(first.status()).toBe(409);
  expect(first.request().postDataJSON()).toMatchObject({
    expectedStageId: "st-house-1",
    expectedUnitPrice: 29000,
    expectedUnitWeightGrams: 5000,
  });
  await expect(page.getByText("가격이 바뀌었어요")).toBeVisible();
  await expect(page.getByText(/5kg 한 상자 29,000원 → 30,000원/)).toBeVisible();
  await expect(page.getByText("처음 본 합계")).toBeVisible();
  // 입력값은 그대로(AC-08-8)
  await expect(page.getByLabel("배송 메모", { exact: true })).toHaveValue("문 앞에 두어 주세요");
  await expect(page.getByRole("checkbox", { name: "모두 동의해요" })).toBeChecked();

  await page.getByRole("button", { name: "바뀐 금액으로 예약하기" }).click();
  await expect(page).toHaveURL(/\/pay/);
  await expect(page.getByText("입금할 금액")).toBeVisible();
  await expect(
    page.getByText("30,000원", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  assertClean();
});

test("AC-08-9: sales paused while the checkout is open → disabled button, '다시 확인하기', no '바뀐 금액' copy", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const assertClean = monitor(page, [/409/]);
  await openFilledCheckout(page);
  await setPaused(request, true);

  await page.getByRole("button", { name: /^[\d,]+원 예약하기$/ }).click();
  await expect(page.getByText("농가가 잠시 예약을 쉬고 있어요")).toBeVisible();
  await expect(page.getByRole("button", { name: /^[\d,]+원 예약하기$/ })).toBeDisabled();
  await expect(page.getByText("바뀐 금액으로 예약하기")).toHaveCount(0);
  await expect(page.getByText("지금은 예약할 수 없어요")).toBeVisible();

  // 다시 열면 '다시 확인하기'로 안내가 사라지고 버튼이 켜진다
  await setPaused(request, false);
  await page.getByRole("button", { name: "다시 확인하기" }).click();
  await expect(page.getByText("농가가 잠시 예약을 쉬고 있어요")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^[\d,]+원 예약하기$/ })).toBeEnabled();
  assertClean();
});
