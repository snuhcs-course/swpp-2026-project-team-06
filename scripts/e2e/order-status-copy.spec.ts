// DEV-207 (FEAT-09 AC-09-7, FEAT-11 AC-11-1, R-28): 입금을 알린 뒤·취소 직후 소비자 주문 문구가 실제 상태와 맞는지 본다.
// 주문은 API로 만들고(입금 안내 → 입금 알림 → 농가 승인 → 소비자 취소 → 농가 송금 기록) 화면은 소비자 앱으로 연다.
import { expect, test } from "./fixtures";

import { apiLogin, apiUrl, consumerUrl, loginConsumer, monitor } from "./helpers";

test("DEV-207 AC-09-7/11-1: deposit-notice and refund copy follow who acts next", async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const run = Date.now();
  const consumerToken = await apiLogin(request, "u-minji", "consumer");
  const producerToken = await apiLogin(request, "u-kang", "producer");
  const asConsumer = { Authorization: `Bearer ${consumerToken}` };
  const asProducer = { Authorization: `Bearer ${producerToken}` };

  const created = await request.post(`${apiUrl}/api/orders`, {
    headers: { ...asConsumer, "Idempotency-Key": `dev207-order-${run}` },
    data: {
      productId: "p-house",
      optionId: "opt-5",
      quantity: 1,
      recipientName: "DEV207 구매자",
      recipientPhone: "010-1234-5678",
      postalCode: "63584",
      address: "제주특별자치도 서귀포시 통합로 1",
      addressDetail: "101호",
      consents: {
        deliveryWindow: true,
        delayRefund: true,
        shortage: true,
        cancelPolicy: true,
        thirdParty: true,
      },
      consentVersion: "dev207",
    },
  });
  expect(created.ok()).toBeTruthy();
  const { orderId } = await created.json();
  const deposit = await request.post(`${apiUrl}/api/orders/${orderId}/deposit`, {
    headers: { ...asConsumer, "Idempotency-Key": `dev207-deposit-${run}` },
    data: {},
  });
  expect(deposit.ok()).toBeTruthy();

  const consumer = await browser.newContext();
  const page = await consumer.newPage();
  const assertClean = monitor(page);
  await loginConsumer(page);

  // 알리기 전: 내 차례
  await page.goto(`${consumerUrl}/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "입금 대기" })).toBeVisible();
  await expect(page.getByText(/까지 입금해 주세요/)).toBeVisible();
  await expect(page.getByText("입금 전에는 바로 취소돼요.", { exact: true })).toBeVisible();
  await expect(page.getByText(/환불할 돈/)).toHaveCount(0);

  // 알린 뒤: 농가 차례. 입금하라는 말·기한·취소 버튼이 없다
  await page.getByRole("button", { name: "입금을 마쳤어요" }).click();
  await expect(page.getByRole("heading", { name: "입금 확인 중" })).toBeVisible();
  await expect(page.getByText(/입금했다고 알려 주셨어요/)).toBeVisible();
  await expect(page.getByText(/입금해 주세요/)).toHaveCount(0);
  await expect(page.getByText("입금 기한", { exact: true })).toHaveCount(0);
  await expect(page.getByText("입금 알림", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "예약 취소하기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "농가에 물어보기", exact: true })).toBeVisible();

  await page.goto(`${consumerUrl}/orders?filter=pending`);
  // 로컬 통합 서버는 FIXED_NOW(10/07)라 기기 시각으로는 기한이 지나 ‘늦어짐’으로 보일 수 있다. 어느 쪽이든 입금하라는 말은 없다
  await expect(
    page.getByText(/^입금 확인 (중 · 농가가 확인하고 있어요|늦어짐 · farmclub이 연락하고 있어요)$/).first(),
  ).toBeVisible();
  await expect(page.getByText("입금 확인 중 · 입금해 주세요")).toHaveCount(0);

  // 농가 승인 → 소비자 취소 직후: 환불 대기(완료형 아님)
  const confirmed = await request.post(`${apiUrl}/api/orders/${orderId}/confirm-deposit`, {
    headers: asProducer,
  });
  expect(confirmed.ok()).toBeTruthy();
  await page.goto(`${consumerUrl}/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "예약 완료" })).toBeVisible();
  await page.getByRole("button", { name: "예약 취소하기" }).click();
  await page.getByRole("button", { name: "예약 취소하기" }).last().click();
  await expect(page.getByRole("heading", { name: "환불 대기" })).toBeVisible();
  await expect(page.getByText(/보내면 ‘환불 완료’로 바뀌어요/)).toBeVisible();
  await expect(page.getByText("환불됨", { exact: true })).toHaveCount(0);

  await page.goto(`${consumerUrl}/orders?filter=canceled`);
  await expect(page.getByText("환불 대기 · 농가가 보낼 거예요").first()).toBeVisible();

  // 농가가 송금을 기록한 뒤에만 환불 완료
  const settled = await request.post(`${apiUrl}/api/orders/${orderId}/refund-settled`, {
    headers: asProducer,
  });
  expect(settled.ok()).toBeTruthy();
  await page.goto(`${consumerUrl}/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "환불 완료" })).toBeVisible();

  assertClean();
  await consumer.close();
});
