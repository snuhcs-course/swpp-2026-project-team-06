// DEV-226 (FEAT-10 AC-10-8 · SCR-13, FEAT-17 AC-17-10 · SCR-29, SCR-23 HE-X5): 주문 줄만 보고 주문을 가른다.
// 같은 상품을 두 번 주문하고 둘 다 입금을 알린 뒤, 소비자 미확정 탭 두 줄이 번호·주문일로 갈리고
// 생산자 입금 대기 줄·승인 시트에 상품명이 보이는지, 이름 없는 초안 카드마다 저장 시각이 붙는지 본다.
import { expect, test } from "./fixtures";

import {
  apiLogin,
  apiUrl,
  consumerUrl,
  loginConsumer,
  loginProducer,
  monitor,
  producerUrl,
} from "./helpers";

type Order = { orderId: string; orderNo: string; productName: string; createdAt: string };

test("DEV-226 AC-10-8/AC-17-10: repeated orders are told apart by number, date and product name", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const run = Date.now();
  const asConsumer = { Authorization: `Bearer ${await apiLogin(request, "u-minji", "consumer")}` };
  const buyer = `DEV226 구매자 ${run % 10000}`;
  const placed: Order[] = [];
  for (const n of [1, 2]) {
    const created = await request.post(`${apiUrl}/api/orders`, {
      headers: { ...asConsumer, "Idempotency-Key": `dev226-order-${run}-${n}` },
      data: {
        productId: "p-house",
        optionId: "opt-5",
        quantity: 1,
        recipientName: buyer,
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
        consentVersion: "dev226",
      },
    });
    expect(created.ok()).toBeTruthy();
    const order = (await created.json()) as Order;
    const reported = await request.post(`${apiUrl}/api/orders/${order.orderId}/deposit`, {
      headers: { ...asConsumer, "Idempotency-Key": `dev226-deposit-${run}-${n}` },
      data: {},
    });
    expect(reported.ok()).toBeTruthy();
    const told = await request.post(`${apiUrl}/api/orders/${order.orderId}/deposit-reported`, {
      headers: { ...asConsumer, "Idempotency-Key": `dev226-reported-${run}-${n}` },
      data: {},
    });
    expect(told.ok()).toBeTruthy();
    placed.push(order);
  }
  expect(placed[0].orderNo).not.toBe(placed[1].orderNo);

  // 소비자: 미확정 탭의 두 줄. DEV-207 굵은 줄·부제는 같고 맨 아래 줄(번호 · 주문일)만 다르다
  const consumer = await browser.newContext();
  const page = await consumer.newPage();
  const consumerClean = monitor(page);
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/orders?filter=pending`);
  const rows = placed.map((o) => page.getByRole("link").filter({ hasText: o.orderNo }));
  for (const [i, row] of rows.entries()) {
    await expect(row).toHaveCount(1);
    await expect(row.getByText(new RegExp(`^${placed[i].orderNo} · \\d+월 \\d+일 주문$`))).toBeVisible();
    await expect(row.getByText(/^\d+월 \d+일~(\d+월 )?\d+일 도착 예정$/)).toBeVisible();
    await expect(row.getByText(/입금 알림 · /)).toBeVisible();
  }
  expect(await rows[0].innerText()).not.toBe(await rows[1].innerText());
  consumerClean();

  // 생산자: 입금 대기 줄과 승인 시트에 ‘이름 · 상품명 옵션 × 수량’
  const producer = await browser.newContext();
  const producerPage = await producer.newPage();
  const producerClean = monitor(producerPage);
  await loginProducer(producerPage, "강영수");
  await producerPage.goto(`${producerUrl}/ship?status=AWAITING_DEPOSIT`);
  const asProducer = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
  const listed = await request.get(`${apiUrl}/api/orders/producer?status=AWAITING_DEPOSIT&limit=50`, {
    headers: asProducer,
  });
  expect(listed.ok()).toBeTruthy();
  const mine = ((await listed.json()).items as (Order & { recipientName: string })[]).filter((o) =>
    placed.some((p) => p.orderId === o.orderId),
  );
  expect(mine).toHaveLength(2);
  const productName = mine[0].productName;
  expect(productName).toBeTruthy();
  const who = `${mine[0].recipientName} · ${productName} 5kg × 1`;
  for (const o of placed) {
    await expect(producerPage.getByText(o.orderNo, { exact: true }).first()).toBeVisible();
  }
  // 줄은 조각 세 개(이름 · / 상품명 / 옵션 × 수량)라 상품명 조각으로 센다. 우리 주문 두 줄 모두 보여야 한다
  await expect(producerPage.getByText(productName, { exact: true }).first()).toBeVisible();
  const nameCount = await producerPage.getByText(productName, { exact: true }).count();
  expect(nameCount).toBeGreaterThanOrEqual(2);
  await producerPage.getByRole("button", { name: `${placed[1].orderNo} 입금 승인`, exact: true }).click();
  const sheet = producerPage.getByRole("dialog");
  await expect(sheet.getByText("입금을 승인할까요?", { exact: true })).toBeVisible();
  await expect(sheet.getByText(who, { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "아니요", exact: true }).click();
  producerClean();
});

test("DEV-226 SCR-23: every untitled draft card shows when it was last saved", async ({ page, request }) => {
  const asProducer = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
  for (let i = 0; i < 2; i += 1) {
    const created = await request.post(`${apiUrl}/api/products`, { headers: asProducer, data: {} });
    expect(created.ok()).toBeTruthy();
  }
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products?filter=draft`);
  const untitled = page.getByRole("button", { name: "이름 없는 초안 편집", exact: true });
  await expect(untitled.first()).toBeVisible();
  expect(await untitled.count()).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < 2; i += 1) {
    await expect(
      untitled.nth(i).getByText(/^\d+월 \d+일( 오[전후] \d+:\d\d)? 저장$/),
    ).toBeVisible();
  }
  clean();
});
