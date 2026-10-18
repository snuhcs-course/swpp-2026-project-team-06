import { expect, test } from "@playwright/test";

import {
  apiLogin,
  apiUrl,
  consumerUrl,
  loginConsumer,
  loginProducer,
  monitor,
  producerUrl,
} from "./helpers";

test("AC-08/09/10: consumer checkout reaches producer and preserves status", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const consumer = await browser.newContext();
  const consumerPage = await consumer.newPage();
  const assertConsumerClean = monitor(consumerPage);
  await loginConsumer(consumerPage);
  await consumerPage.goto(`${consumerUrl}/products/p-house`);
  await consumerPage.getByRole("button", { name: "예약하기" }).click();
  const addressResponse = consumerPage.waitForResponse(response =>
    response.url() === `${apiUrl}/api/auth/me/addresses` &&
    response.request().method() === "GET",
  );
  await consumerPage.getByRole("button", { name: "주문서로" }).click();
  const loadedAddresses = await addressResponse;
  expect(loadedAddresses.ok()).toBeTruthy();
  if ((await loadedAddresses.json()).length === 0) {
    await consumerPage.getByRole("button", { name: "받는 사람과 주소 입력" }).click();
  } else {
    await consumerPage.getByRole("button", { name: "다른 배송지" }).click();
    await consumerPage.getByRole("button", { name: "새 주소 입력" }).click();
  }
  await consumerPage.getByLabel("받는 사람").fill("DEV25 구매자");
  await consumerPage.getByLabel("연락처").fill("010-1234-5678");
  await consumerPage.getByLabel("우편번호").fill("63584");
  await consumerPage
    .getByRole("textbox", { name: "주소", exact: true })
    .fill("제주특별자치도 서귀포시 통합로 25");
  await consumerPage.getByLabel("상세 주소").fill("통합동 101호");
  await consumerPage.getByRole("button", { name: "이 주소로 받기" }).click();
  await consumerPage.getByRole("checkbox", { name: "모두 동의해요" }).click();
  await consumerPage.getByRole("button", { name: "예약하기" }).click();
  // DEV-68: 입금 안내(농가 계좌·입금자명=주문 번호·기한·중개자 고지) → 입금했어요 → 입금 확인 중
  await expect(consumerPage).toHaveURL(/\/pay/);
  await expect(consumerPage.getByText("101-23-456789")).toBeVisible();
  await expect(
    consumerPage.getByText(/farmclub은 통신판매중개자이고 거래 당사자가 아니에요/),
  ).toBeVisible();
  await consumerPage.getByRole("button", { name: "입금을 마쳤어요" }).click();
  await expect(consumerPage).toHaveURL(/\/orders\/[^/]+\/done/);
  const orderId = consumerPage.url().match(/\/orders\/([^/]+)\/done/)?.[1];
  expect(orderId).toBeTruthy();
  await expect(
    consumerPage.getByRole("heading", { name: "입금 확인 중" }),
  ).toBeVisible();

  const producer = await browser.newContext();
  const producerPage = await producer.newPage();
  const assertProducerClean = monitor(producerPage);
  await loginProducer(producerPage, "강영수");
  await expect(
    consumerPage.getByRole("button", { name: "소식방 입장" }),
  ).toHaveCount(0);
  // AC-09-8: 생산자가 통장과 대조한 뒤 입금 확인 → 예약 완료
  await producerPage.goto(`${producerUrl}/ship?status=AWAITING_DEPOSIT`);
  await expect(producerPage.getByText("DEV25 구매자").first()).toBeVisible();
  await expect(
    producerPage.getByText("입금했다고 알렸어요").first(),
  ).toBeVisible();
  await producerPage.getByRole("button", { name: "입금 확인" }).first().click();
  await producerPage
    .getByRole("button", { name: "확인했어요 · 예약 완료로" })
    .click();
  await consumerPage.goto(`${consumerUrl}/orders/${orderId}`);
  await expect(
    consumerPage.getByRole("heading", { name: "예약 완료" }),
  ).toBeVisible();
  await producerPage.goto(`${producerUrl}/ship?status=RESERVED`);
  await expect(producerPage.getByText("DEV25 구매자").first()).toBeVisible();
  await expect(
    producerPage.getByRole("button", { name: "수확 시작" }),
  ).toHaveCount(0);
  const token = await apiLogin(request, "u-kang", "producer");
  const headers = { Authorization: `Bearer ${token}` };
  const reserved = await request.get(
    `${apiUrl}/api/orders/producer?status=RESERVED&limit=50`,
    { headers },
  );
  expect(
    (await reserved.json()).items.some(
      (o: { orderId: string }) => o.orderId === orderId,
    ),
  ).toBeTruthy();
  // Test-fixture setup only: v6 has no harvest UI and never auto-transitions reservations.
  const prepared = await request.post(
    `${apiUrl}/api/orders/producer/harvest-start`,
    { headers, data: { productId: "p-house" } },
  );
  expect(prepared.ok()).toBeTruthy();
  await producerPage.goto(`${producerUrl}/ship?status=PREPARING`);
  await expect(producerPage.getByText("DEV25 구매자")).toBeVisible();
  await producerPage
    .getByRole("button", { name: /DEV25 구매자.*택배사·송장 번호 넣기/ })
    .click();
  await producerPage.getByRole("radio", { name: "CJ대한통운" }).click();
  await producerPage
    .getByRole("textbox", { name: "송장 번호", exact: true })
    .fill("DEV25-1234");
  await producerPage.getByRole("button", { name: "저장", exact: true }).click();
  await producerPage.getByRole("button", { name: "1건 출하로 바꾸기" }).click();
  await producerPage
    .getByRole("button", { name: "1건 출하로 바꾸기" })
    .last()
    .click();
  await expect(producerPage.getByRole("tab", { name: /출하 4/ })).toBeVisible();

  await consumerPage.goto(`${consumerUrl}/orders/${orderId}`);
  await expect(
    consumerPage.getByRole("heading", { name: "배송 중" }),
  ).toBeVisible();
  await expect(consumerPage.getByText("DEV25-1234")).toBeVisible();
  await expect(
    consumerPage.getByRole("button", { name: "예약 취소하기" }),
  ).toHaveCount(0);
  assertConsumerClean();
  assertProducerClean();
  await producer.close();
  await consumer.close();
});

test("AC-10-6: failed inquiry send retains typed text and retries", async ({
  page,
}) => {
  const assertClean = monitor(page, [/Failed to fetch/, /ERR_FAILED/]);
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/orders/o-07/inquiry`);
  const input = page.getByLabel("어떤 점이 불편하셨나요?");
  await input.fill("DEV25 연결 실패 뒤에도 남아야 하는 문의");
  await page.route(
    `${apiUrl}/api/orders/o-07/inquiries`,
    (route) => route.abort("failed"),
    { times: 1 },
  );
  await page.getByRole("button", { name: "농가에 문의 보내기" }).click();
  await expect(input).toHaveValue("DEV25 연결 실패 뒤에도 남아야 하는 문의");
  await page.unroute(`${apiUrl}/api/orders/o-07/inquiries`);
  await page.getByRole("button", { name: "농가에 문의 보내기" }).click();
  await expect(page).toHaveURL(/\/chats\/f-kang/);
  await expect(
    page.getByText("DEV25 연결 실패 뒤에도 남아야 하는 문의"),
  ).toBeVisible();
  assertClean();
});
