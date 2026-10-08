import { expect, test } from "@playwright/test";

import { apiLogin, apiUrl, consumerUrl, loginConsumer, loginProducer, monitor, producerUrl } from "./helpers";

test("AC-08/09/10: consumer checkout reaches producer and preserves status", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const consumer = await browser.newContext();
  const consumerPage = await consumer.newPage();
  const assertConsumerClean = monitor(consumerPage);
  await loginConsumer(consumerPage);
  await consumerPage.goto(`${consumerUrl}/products/p-house`);
  await consumerPage.getByRole("button", { name: "예약하기" }).click();
  await consumerPage.getByRole("button", { name: "주문서로" }).click();
  const emptyAddress = consumerPage.getByRole("button", { name: "받는 사람과 주소 입력" });
  if (await emptyAddress.isVisible()) await emptyAddress.click();
  else {
    await consumerPage.getByRole("button", { name: "다른 배송지" }).click();
    await consumerPage.getByRole("button", { name: "새 주소 입력" }).click();
  }
  await consumerPage.getByLabel("받는 사람").fill("DEV25 구매자");
  await consumerPage.getByLabel("연락처").fill("010-1234-5678");
  await consumerPage.getByLabel("우편번호").fill("63584");
  await consumerPage.getByRole("textbox", { name: "주소", exact: true }).fill("제주특별자치도 서귀포시 통합로 25");
  await consumerPage.getByLabel("상세 주소").fill("통합동 101호");
  await consumerPage.getByRole("button", { name: "이 주소로 받기" }).click();
  await consumerPage.getByRole("checkbox", { name: "모두 동의해요" }).click();
  await consumerPage.getByRole("button", { name: "결제하기" }).click();
  await expect(consumerPage).toHaveURL(/\/pay/);
  await consumerPage.getByRole("button", { name: /결제하기$/ }).click();
  await expect(consumerPage).toHaveURL(/\/orders\/[^/]+\/done/);
  const orderId = consumerPage.url().match(/\/orders\/([^/]+)\/done/)?.[1];
  expect(orderId).toBeTruthy();
  await expect(consumerPage.getByRole("heading", { name: "예약 완료" })).toBeVisible();

  const producer = await browser.newContext();
  const producerPage = await producer.newPage();
  const assertProducerClean = monitor(producerPage);
  await loginProducer(producerPage, "강영수");
  const producerToken = await apiLogin(request, "u-kang", "producer");
  await request.post(`${apiUrl}/api/orders/producer/harvest-start`, {
    headers: { Authorization: `Bearer ${producerToken}` },
    data: { productId: "p-house" },
  });
  await producerPage.goto(`${producerUrl}/ship`);
  await expect(producerPage.getByText("DEV25 구매자")).toBeVisible();

  const ship = await request.post(`${apiUrl}/api/orders/${orderId}/ship`, {
    headers: { Authorization: `Bearer ${producerToken}` },
    data: { carrier: "CJ", trackingNumber: "DEV25-1234" },
  });
  expect(ship.ok()).toBeTruthy();

  await consumerPage.goto(`${consumerUrl}/orders/${orderId}`);
  await expect(consumerPage.getByRole("heading", { name: "배송 중" })).toBeVisible();
  await expect(consumerPage.getByText("DEV25-1234")).toBeVisible();
  await expect(consumerPage.getByRole("button", { name: "예약 취소하기" })).toHaveCount(0);
  assertConsumerClean();
  assertProducerClean();
  await producer.close();
  await consumer.close();
});

test("AC-10-6: failed inquiry send retains typed text and retries", async ({ page }) => {
  const assertClean = monitor(page, [/Failed to fetch/, /ERR_FAILED/]);
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/orders/o-07/inquiry`);
  const input = page.getByLabel("어떤 점이 불편하셨나요?");
  await input.fill("DEV25 연결 실패 뒤에도 남아야 하는 문의");
  await page.route(`${apiUrl}/api/orders/o-07/inquiries`, (route) => route.abort("failed"), { times: 1 });
  await page.getByRole("button", { name: "농가에 문의 보내기" }).click();
  await expect(input).toHaveValue("DEV25 연결 실패 뒤에도 남아야 하는 문의");
  await page.unroute(`${apiUrl}/api/orders/o-07/inquiries`);
  assertClean();
});
