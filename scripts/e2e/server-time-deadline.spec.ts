// DEV-229 (R-28, FEAT-10 SCR-13, FEAT-17 SCR-29): 기한 지남 판단은 기기 시계가 아니라 서버 시각(X-Server-Time)으로.
// 로컬 통합 서버는 FIXED_NOW(데모 기준일 10/07)로 돌고 브라우저는 실제 날짜라, 기기 시계로 재면 방금 만든 주문이
// 소비자 '입금 확인 늦어짐'·생산자 '기한 지남'으로 보였다. FIXED_NOW 없이 돌려도 새 주문은 기한 전이라 같은 기대가 맞다.
import { expect, test } from "./fixtures";

import { apiLogin, apiUrl, consumerUrl, loginConsumer, loginProducer, monitor, producerUrl } from "./helpers";

test("DEV-229 R-28: a fresh reported order is not shown as late on either app", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const run = Date.now();
  const asConsumer = { Authorization: `Bearer ${await apiLogin(request, "u-minji", "consumer")}` };
  const created = await request.post(`${apiUrl}/api/orders`, {
    headers: { ...asConsumer, "Idempotency-Key": `dev229-order-${run}` },
    data: {
      productId: "p-house",
      optionId: "opt-5",
      quantity: 1,
      recipientName: "DEV229 구매자",
      recipientPhone: "010-1234-5678",
      postalCode: "63584",
      address: "제주특별자치도 서귀포시 통합로 1",
      addressDetail: "101호",
      consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
      consentVersion: "dev229",
    },
  });
  expect(created.ok()).toBeTruthy();
  // 서버는 모든 응답에 서버 시각을 붙인다
  expect(created.headers()["x-server-time"]).toBeTruthy();
  const { orderId, orderNo } = (await created.json()) as { orderId: string; orderNo: string };
  for (const step of ["deposit", "deposit-reported"]) {
    const res = await request.post(`${apiUrl}/api/orders/${orderId}/${step}`, {
      headers: { ...asConsumer, "Idempotency-Key": `dev229-${step}-${run}` },
      data: {},
    });
    expect(res.ok()).toBeTruthy();
  }

  // 소비자 미확정 탭: 농가 차례 문구, '늦어짐' 아님
  const consumer = await browser.newContext();
  const page = await consumer.newPage();
  const consumerClean = monitor(page);
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/orders?filter=pending`);
  const row = page.getByRole("link").filter({ hasText: orderNo });
  await expect(row.getByText("입금 확인 중 · 농가가 확인하고 있어요", { exact: true })).toBeVisible();
  await expect(row.getByText(/입금 확인 늦어짐/)).toHaveCount(0);
  await page.goto(`${consumerUrl}/orders/${orderId}`);
  await expect(page.getByText(/에 입금했다고 알려 주셨어요/)).toBeVisible();
  await expect(page.getByText(/농가 확인이 늦어져/)).toHaveCount(0);
  consumerClean();

  // 생산자 입금 대기: '기한 ○월 ○일 …', '기한 지남' 아님
  const producer = await browser.newContext();
  const producerPage = await producer.newPage();
  const producerClean = monitor(producerPage);
  await loginProducer(producerPage, "강영수");
  await producerPage.goto(`${producerUrl}/ship?status=AWAITING_DEPOSIT`);
  await expect(producerPage.getByText(new RegExp(`^${orderNo} · 기한 \\d+월 \\d+일`))).toBeVisible();
  await expect(producerPage.getByText(`${orderNo} · 기한 지남`, { exact: true })).toHaveCount(0);
  producerClean();
});
