// DEV-342 (FEAT-09 AC-09-12, R-28 · FEAT-12 AC-12-17): 짧은 입금자명과 입금 대기 주문 ‘채팅하기’.
// 소비자 입금 안내는 주문 번호가 아니라 ‘김민지76’ 꼴 입금자명을 보이고 복사한다.
// 생산자 입금 대기 줄 ‘채팅하기’는 그 소비자 대화를 열고 확인 글을 입력칸에만 넣는다(보내지 않음).
import { expect, test } from "./fixtures";

import { apiLogin, apiUrl, consumerUrl, loginConsumer, loginProducer, monitor, producerUrl } from "./helpers";

const CONSENTS = { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true };

async function awaitingOrder(request: Parameters<typeof apiLogin>[0], tag: string) {
  const headers = { Authorization: `Bearer ${await apiLogin(request, "u-minji", "consumer")}` };
  const created = await request.post(`${apiUrl}/api/orders`, {
    headers: { ...headers, "Idempotency-Key": `dev342-order-${tag}-${Date.now()}` },
    data: {
      productId: "p-house",
      optionId: "opt-5",
      quantity: 1,
      recipientName: "김민지",
      recipientPhone: "010-2345-6789",
      postalCode: "04001",
      address: "서울 마포구 월드컵북로 12",
      addressDetail: "302호",
      consents: CONSENTS,
      consentVersion: "dev342",
    },
  });
  expect(created.ok()).toBeTruthy();
  const { orderId } = await created.json();
  const deposited = await request.post(`${apiUrl}/api/orders/${orderId}/deposit`, {
    headers: { ...headers, "Idempotency-Key": `dev342-deposit-${tag}-${Date.now()}` },
    data: {},
  });
  expect(deposited.ok()).toBeTruthy();
  return {
    order: (await deposited.json()) as {
      orderId: string;
      orderNo: string;
      depositCode: string;
      totalAmount: number;
    },
    headers,
  };
}

test("AC-09-12: consumer deposit card shows and copies the short depositor name", async ({ browser, request }) => {
  const { order } = await awaitingOrder(request, "card");
  // 닉네임 앞 3글자(없으면 가림 이름 앞 글자) + 숫자 2자리(PM 11/17)
  expect(order.depositCode).toMatch(/^[가-힣A-Za-z]{1,3}\d{2}$/);
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: consumerUrl });
  const page = await context.newPage();
  const clean = monitor(page);
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/checkout/p-house/pay?orderId=${order.orderId}&optionId=opt-5&quantity=1`);
  await expect(page.getByText(order.depositCode, { exact: true })).toBeVisible();
  // 닉네임이 들어 있어 세션 녹화에서 가린다(N-05: data-ph-private 안)
  await expect(page.locator("[data-ph-private]").getByText(order.depositCode, { exact: true })).toHaveCount(1);
  // 주문 번호는 입금자명으로 보이지 않는다(입금 안내 화면)
  await expect(page.getByText(order.orderNo, { exact: true })).toHaveCount(0);
  // 입금 안내는 DEV-356 입금자명 안내 상자가 짧은 코드로 같은 말을 한다(카드 아래 한 줄은 이 화면에서 숨김)
  await expect(page.getByText(new RegExp(`받는 분 통장 표시를 ${order.depositCode}(로|으로) 바꿔 보내 주세요`))).toBeVisible();
  // 안내 상자 제목에도 입금자명이 들어 있어 녹화에서 가린다(N-05)
  await expect(page.locator("[data-ph-private]").getByText(/받는 분 통장 표시를 /)).toHaveCount(1);
  await expect(page.getByText("은행 앱 ‘받는 분 통장 표시’에 입금자명을 그대로 적어 주세요")).toHaveCount(0);
  // 입금자명 줄의 ‘복사’(이름이 정확히 ‘복사’인 버튼 중 계좌번호 다음 두 번째. 금액 복사는 ‘입금할 금액 복사’)
  await page.getByRole("button", { name: "복사", exact: true }).nth(1).click();
  await expect(page.getByText("입금자명을 복사했어요")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(order.depositCode);

  // 주문 완료·주문 상세에도 같은 입금자명. 완료 화면은 주문 번호를 따로 보인다
  await page.goto(`${consumerUrl}/orders/${order.orderId}/done`);
  await expect(page.locator("[data-ph-private]").getByText(order.depositCode, { exact: true })).toBeVisible();
  await expect(page.getByText("은행 앱 ‘받는 분 통장 표시’에 입금자명을 그대로 적어 주세요")).toBeVisible();
  await expect(page.getByText(order.orderNo, { exact: true })).toBeVisible();
  await page.goto(`${consumerUrl}/orders/${order.orderId}`);
  await expect(page.locator("[data-ph-private]").getByText(order.depositCode, { exact: true })).toBeVisible();
  clean();
  await context.close();
});

test("AC-12-17: producer awaiting order '채팅하기' opens the buyer chat with the check message prefilled", async ({
  browser,
  request,
}) => {
  const { order } = await awaitingOrder(request, "chat");
  const producerHeaders = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
  const before = await request.get(`${apiUrl}/api/messaging/producer/chats/u-minji/messages?limit=50`, {
    headers: producerHeaders,
  });
  const beforeIds = ((await before.json()).items as { messageId: string }[]).map((m) => m.messageId);

  const context = await browser.newContext();
  const page = await context.newPage();
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/ship?status=AWAITING_DEPOSIT`);
  // 줄과 승인 시트에 입금자명
  await expect(page.getByText(order.depositCode, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: `${order.orderNo} 입금 승인`, exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(order.depositCode, { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "닫기", exact: true }).click();

  await page.getByRole("button", { name: `${order.orderNo} 채팅하기`, exact: true }).click();
  await expect(page).toHaveURL(/\/chats\/u-minji/);
  const amount = `${order.totalAmount.toLocaleString("ko-KR")}원`;
  const expected = `주문하신 하우스 감귤 5kg(${amount}) 입금 확인이 안되네요. 혹시 입금하셨다면 입금자명과 입금 시각을 알려주세요.`;
  await expect(page.getByRole("textbox", { name: "메시지" })).toHaveValue(expected);
  // 미리 넣기만 하고 보내지 않는다
  await page.waitForTimeout(1000);
  const after = await request.get(`${apiUrl}/api/messaging/producer/chats/u-minji/messages?limit=50`, {
    headers: producerHeaders,
  });
  const afterIds = ((await after.json()).items as { messageId: string }[]).map((m) => m.messageId);
  expect(afterIds).toEqual(beforeIds);
  // 미리 넣을 글은 주소(URL)에 싣지 않는다
  expect(page.url()).not.toContain("draft");
  expect(decodeURIComponent(page.url())).not.toContain("입금 확인");
  // 뒤로는 주문 현황으로
  await page.getByRole("button", { name: /뒤로/ }).first().click();
  await expect(page).toHaveURL(/\/ship/);
  clean();
  await context.close();
});

test("AC-12-18: a buyer who does not follow the farm sees and answers the producer's '채팅하기' message", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  // 이서준이 강씨네 귤밭 팔로우를 끊고 입금 대기 주문을 둔다
  const seojun = { Authorization: `Bearer ${await apiLogin(request, "u-seojun", "consumer")}` };
  expect((await request.delete(`${apiUrl}/api/farms/f-kang/follow`, { headers: seojun })).ok()).toBeTruthy();
  try {
    const created = await request.post(`${apiUrl}/api/orders`, {
      headers: { ...seojun, "Idempotency-Key": `dev342-unfollowed-${Date.now()}` },
      data: {
        productId: "p-house",
        optionId: "opt-5",
        quantity: 1,
        recipientName: "이서준",
        recipientPhone: "010-3456-7890",
        postalCode: "48094",
        address: "부산 해운대구 해운대로 570",
        consents: CONSENTS,
        consentVersion: "dev342",
      },
    });
    expect(created.ok()).toBeTruthy();
    const { orderId } = await created.json();
    const deposited = await request.post(`${apiUrl}/api/orders/${orderId}/deposit`, {
      headers: { ...seojun, "Idempotency-Key": `dev342-unfollowed-deposit-${Date.now()}` },
      data: {},
    });
    const order = await deposited.json();
    expect(order.depositCode).toMatch(/^[가-힣A-Za-z]{1,3}\d{2}$/);

    // 생산자: ‘채팅하기’ → 미리 넣은 글이 입력칸에 다 보이게 늘어난 뒤 보낸다
    const producer = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await producer.newPage();
    const producerClean = monitor(page);
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/ship?status=AWAITING_DEPOSIT`);
    await page.getByRole("button", { name: `${order.orderNo} 채팅하기`, exact: true }).click();
    await expect(page).toHaveURL(/\/chats\/u-seojun/);
    const box = page.getByRole("textbox", { name: "메시지" });
    await expect(box).toHaveValue(/^주문하신 하우스 감귤 5kg\(/);
    // 웹 입력칸이 글 길이만큼 늘어난다(한 줄 40보다 크고 6줄 상한 이하, 안에서 스크롤 없음)
    await expect.poll(async () => (await box.boundingBox())?.height ?? 0).toBeGreaterThan(60);
    const fits = await box.evaluate((el) => (el as HTMLTextAreaElement).scrollHeight <= el.clientHeight + 1);
    expect(fits).toBeTruthy();
    const sent = page.waitForResponse((r) => r.url().endsWith("/producer/chats/u-seojun/messages") && r.request().method() === "POST");
    await page.getByRole("button", { name: "전송" }).click();
    expect((await sent).ok()).toBeTruthy();
    // 보낸 뒤 입력칸은 비고 한 줄 높이로 돌아온다
    await expect(box).toHaveValue("");
    await expect.poll(async () => (await box.boundingBox())?.height ?? 0).toBeLessThan(50);
    producerClean();

    // 소비자(팔로우 안 함): 채팅 목록과 대화에서 생산자 메시지를 보고, 그 주문을 골라 답한다
    const consumer = await browser.newContext();
    const cpage = await consumer.newPage();
    const consumerClean = monitor(cpage);
    await loginConsumer(cpage, "이서준");
    await cpage.goto(`${consumerUrl}/chats?view=private`);
    await expect(cpage.getByText("강씨네 귤밭").first()).toBeVisible();
    await cpage.goto(`${consumerUrl}/chats/f-kang`);
    await expect(cpage.getByText(/입금 확인이 안되네요/).first()).toBeVisible();
    // 생산자 쪽 문맥은 연결 주문이 아니라 ‘문의할 주문’ 고르기 없이 보통 메시지로 답한다
    await expect(cpage.getByText(new RegExp(`문의할 주문 · .*${orderId}`))).toHaveCount(0);
    const reply = "오늘 오후 3시에 이서준으로 보냈어요";
    await cpage.getByRole("textbox", { name: "메시지" }).fill(reply);
    const replied = cpage.waitForResponse((r) => r.url().endsWith("/api/messaging/chats/f-kang/messages") && r.request().method() === "POST");
    await cpage.getByRole("button", { name: "전송" }).click();
    expect((await replied).ok()).toBeTruthy();
    consumerClean();

    const producerHeaders = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
    const seen = await request.get(`${apiUrl}/api/messaging/producer/chats/u-seojun/messages?limit=50`, {
      headers: producerHeaders,
    });
    expect(((await seen.json()).items as { body: string }[]).some((m) => m.body === reply)).toBeTruthy();
    await producer.close();
    await consumer.close();
  } finally {
    // 다른 테스트를 위해 실패해도 팔로우를 되돌린다
    await request.put(`${apiUrl}/api/farms/f-kang/follow`, { headers: seojun });
  }
});
