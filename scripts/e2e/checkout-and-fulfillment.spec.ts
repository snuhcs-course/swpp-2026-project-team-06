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

test("AC-08-1/09/10: consumer checkout counts consents, reaches producer and preserves status", async ({
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
    await consumerPage.getByRole("button", { name: "받는 곳 변경" }).click();
    await consumerPage.getByRole("button", { name: "새 주소 입력" }).click();
  }
  await consumerPage.getByLabel("받는 사람").fill("DEV25 구매자");
  await consumerPage.getByLabel("연락처").fill("010-1234-5678");
  await consumerPage.getByLabel("우편번호", { exact: true }).fill("63584");
  await consumerPage
    .getByRole("textbox", { name: "주소", exact: true })
    .fill("제주특별자치도 서귀포시 통합로 25");
  await consumerPage.getByLabel("상세 주소").fill("통합동 101호");
  await consumerPage.getByRole("button", { name: "이 주소로 받기" }).click();
  // AC-08-1 (DEV-138): 동의 5개(ORDER_CONSENT_KEYS) 중 하나라도 빠지면 예약할 수 없다. 모두 동의하면 켜진다.
  // DEV-293: CTA 위 개수 문구는 없앴고 버튼에 금액이 들어간다(‘N원 예약하기’)
  const reserve = consumerPage.getByRole("button", { name: /^[\d,]+원 예약하기$/ });
  for (const title of ["받는 시기", "지연 시 환불", "흉작·수량 부족", "취소·반품 조건"])
    await consumerPage.getByRole("checkbox", { name: `${title} (필수)`, exact: true }).click();
  await expect(reserve).toBeDisabled();
  // 꺼진 이유는 화면 읽기에만(aria-describedby, DEV-293)
  await expect(reserve).toHaveAccessibleDescription("필수 동의 5개 중 4개 했어요");
  await expect(consumerPage.getByRole("checkbox", { name: "모두 동의해요" })).not.toBeChecked();
  // DEV-141 뒤로는 aria-checked도 나오므로 toBeChecked로 체크 상태까지 확인한다
  await consumerPage.getByRole("checkbox", { name: "모두 동의해요" }).click();
  // DEV-141: 동의 체크 상태가 aria-checked로 DOM에 나온다(react-native-web은 accessibilityState를 무시)
  await expect(
    consumerPage.getByRole("checkbox", { name: "모두 동의해요" }),
  ).toBeChecked();
  await expect(
    consumerPage.getByRole("checkbox", { name: "개인정보 제3자 제공 (판매자)" }),
  ).toBeChecked();
  await expect(reserve).toBeEnabled();
  await reserve.click();
  // DEV-68: 입금 안내(농가 계좌·입금자명(DEV-342 짧은 입금 코드)·기한·중개자 고지) → 입금했어요 → 입금 확인 중
  await expect(consumerPage).toHaveURL(/\/pay/);
  await expect(consumerPage.getByText("101-23-456789")).toBeVisible();
  await expect(
    consumerPage.getByText("farmclub은 통신판매중개자예요"),
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
  let depositApprovals = 0;
  producerPage.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/confirm-deposit")) depositApprovals++;
  });
  const token = await apiLogin(request, "u-kang", "producer");
  const headers = { Authorization: `Bearer ${token}` };
  // SCR-29 shows the order total (item price + shipping/remote fees), not the option price.
  const awaiting = await request.get(
    `${apiUrl}/api/orders/producer?status=AWAITING_DEPOSIT&limit=50`,
    { headers },
  );
  const awaitingOrder = (await awaiting.json()).items.find(
    (o: { orderId: string; orderNo: string; totalAmount: number }) => o.orderId === orderId,
  );
  // Target this run's order: a leftover awaiting order from an earlier run may sort first.
  const approveButton = producerPage.getByRole("button", {
    name: `${awaitingOrder.orderNo} 입금 승인`, exact: true,
  });
  expect(awaitingOrder.totalAmount).toBeGreaterThan(29000);
  const totalText = `${awaitingOrder.totalAmount.toLocaleString("ko-KR")}원`;
  // AC-09-8: 통장 대조 후 확인 시트에서 최종 승인 → 예약 완료
  await producerPage.goto(`${producerUrl}/ship?status=AWAITING_DEPOSIT`);
  await expect(producerPage.getByText("DEV25 구매자").first()).toBeVisible();
  await expect(
    producerPage.getByText("입금했다고 알렸어요").first(),
  ).toBeVisible();
  await approveButton.click();
  const depositSheet = producerPage.getByRole("dialog");
  await expect(depositSheet.getByText("입금을 승인할까요?", { exact: true })).toBeVisible();
  await expect(depositSheet.getByText("DEV25 구매자", { exact: false })).toBeVisible();
  await expect(depositSheet.getByText(/5kg × 1/)).toBeVisible();
  await expect(depositSheet.getByText(totalText, { exact: true })).toBeVisible();
  expect(depositApprovals).toBe(0);
  await depositSheet.getByRole("button", { name: "닫기", exact: true }).click();
  expect(depositApprovals).toBe(0);
  await expect(producerPage.getByText("DEV25 구매자").first()).toBeVisible();
  await approveButton.click();
  const approved = producerPage.waitForResponse(response =>
    response.url().endsWith("/confirm-deposit") && response.request().method() === "POST",
  );
  await depositSheet.getByRole("button", { name: "확인 · 입금 승인", exact: true }).click();
  expect((await approved).ok()).toBeTruthy();
  await consumerPage.goto(`${consumerUrl}/orders/${orderId}`);
  await expect(
    consumerPage.getByRole("heading", { name: "예약 완료" }),
  ).toBeVisible();
  expect(depositApprovals).toBe(1);
  await producerPage.goto(`${producerUrl}/ship?status=RESERVED`);
  await expect(producerPage.getByText("DEV25 구매자").first()).toBeVisible();
  await expect(producerPage.getByText(totalText, { exact: true }).first()).toBeVisible();
  // DEV-361 (AC-17-3·AC-17-11): 예약 탭에서 고른 주문만 한 번에 수확 시작(기본 전체 선택, 기간과 상관없음)
  // 화면은 모든 페이지를 읽으므로 기대 건수도 커서 끝까지 읽는다
  const reservedItems: { orderId: string; orderNo: string }[] = [];
  for (let cursor: string | null = null, first = true; first || cursor; first = false) {
    const page = await request.get(
      `${apiUrl}/api/orders/producer?status=RESERVED&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { headers },
    );
    const body = await page.json();
    reservedItems.push(...body.items);
    cursor = body.nextCursor;
  }
  const reservedOrder = reservedItems.find((o) => o.orderId === orderId);
  expect(reservedOrder).toBeTruthy();
  await expect(
    producerPage.getByText("예약 기간에서 수확을 시작하면 출하 준비로 옮겨져요", { exact: true }),
  ).toHaveCount(0);
  let harvestCalls = 0;
  producerPage.on("request", (req) => {
    if (req.method() === "POST" && /\/harvest-(orders|start)$/.test(req.url())) harvestCalls++;
  });
  const selectAll = producerPage.getByRole("checkbox", { name: "전체 선택", exact: true });
  await expect(selectAll).toHaveAttribute("aria-checked", "true");
  const harvestButton = producerPage.getByRole("button", { name: /^수확 시작 · \d+건$/ });
  await expect(harvestButton).toHaveText(new RegExp(`^수확 시작 · ${reservedItems.length}건$`));
  // 이 테스트 주문만 남기고 뺀다
  await selectAll.click();
  await expect(harvestButton).toHaveText("수확 시작 · 0건");
  await expect(harvestButton).toBeDisabled();
  const row = producerPage.getByRole("checkbox", {
    name: new RegExp(`^${reservedOrder!.orderNo} .*고르기$`),
  });
  await row.click();
  await expect(row).toHaveAttribute("aria-checked", "true");
  await expect(harvestButton).toHaveText("수확 시작 · 1건");
  await harvestButton.click();
  const harvestSheet = producerPage.getByRole("dialog");
  await expect(harvestSheet.getByText("수확을 시작할까요?", { exact: true })).toBeVisible();
  await expect(harvestSheet.getByText(/‘수확·포장 중’으로 보여요/)).toBeVisible();
  await expect(harvestSheet.getByText(/DEV25 구매자/)).toBeVisible();
  await harvestSheet.getByRole("button", { name: "아니요", exact: true }).click();
  expect(harvestCalls).toBe(0);
  await expect(producerPage.getByRole("dialog")).toHaveCount(0);
  await harvestButton.click();
  const harvested = producerPage.waitForResponse(response =>
    response.url().endsWith("/harvest-orders") && response.request().method() === "POST",
  );
  await producerPage
    .getByRole("dialog")
    .getByRole("button", { name: "수확 시작 · 1건", exact: true })
    .click();
  const harvestResponse = await harvested;
  expect(JSON.parse(harvestResponse.request().postData() ?? "{}").orderIds).toEqual([orderId]);
  const harvestBody = await harvestResponse.json();
  expect(harvestBody.orderIds).toEqual([orderId]);
  await expect(producerPage.getByText(`${harvestBody.changed}건을 출하 준비로 옮겼어요`)).toBeVisible();
  // 뺀 예약은 그대로 남는다
  await expect(producerPage.getByRole("tab", { name: `예약 ${reservedItems.length - 1}` })).toBeVisible();
  expect(harvestCalls).toBe(1);
  await consumerPage.goto(`${consumerUrl}/orders/${orderId}`);
  await expect(
    consumerPage.getByRole("heading", { name: "수확·포장 중" }),
  ).toBeVisible();
  await producerPage.goto(`${producerUrl}/ship?status=PREPARING`);
  await expect(producerPage.getByText("DEV25 구매자")).toBeVisible();
  await producerPage
    .getByRole("button", { name: /DEV25 구매자.*송장 입력/ })
    .click();
  await producerPage.getByRole("radio", { name: "CJ대한통운" }).click();
  await producerPage
    .getByRole("textbox", { name: "송장 번호", exact: true })
    .fill("DEV25-1234");
  await producerPage.getByRole("button", { name: "저장", exact: true }).click();
  await producerPage.getByRole("button", { name: "1건 출하 처리" }).click();
  await producerPage
    .getByRole("button", { name: "1건 출하 처리" })
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

  // AC-17-9: a shipped order keeps its shipping state while correcting its invoice.
  await producerPage.goto(`${producerUrl}/ship?status=SHIPPED`);
  await producerPage
    .getByRole("button", { name: `${reservedOrder.orderNo} 송장 수정`, exact: true })
    .click();
  await expect(
    producerPage.getByRole("textbox", { name: "송장 번호", exact: true }),
  ).toHaveValue("DEV25-1234");
  await expect(producerPage.getByRole("radio", { name: "CJ대한통운" })).toBeChecked();
  await producerPage
    .getByRole("textbox", { name: "송장 번호", exact: true })
    .fill("DEV25-5678");
  const correctedResponse = producerPage.waitForResponse(response =>
    response.url() === `${apiUrl}/api/orders/${orderId}/tracking` &&
    response.request().method() === "PATCH",
  );
  await producerPage.getByRole("button", { name: "저장", exact: true }).click();
  expect((await correctedResponse).ok()).toBeTruthy();
  await producerPage
    .getByRole("button", { name: `${reservedOrder.orderNo} 송장 수정`, exact: true })
    .click();
  await expect(
    producerPage.getByRole("textbox", { name: "송장 번호", exact: true }),
  ).toHaveValue("DEV25-5678");
  await consumerPage.goto(`${consumerUrl}/orders/${orderId}`);
  await expect(consumerPage.getByRole("heading", { name: "배송 중" })).toBeVisible();
  await expect(consumerPage.getByText("DEV25-5678")).toBeVisible();
  await expect(consumerPage.getByText("DEV25-1234")).toHaveCount(0);
  await consumerPage.evaluate(() => {
    window.open = ((url?: string | URL) => {
      (window as unknown as { deliveryLookup?: string }).deliveryLookup = String(url);
      return null;
    }) as typeof window.open;
  });
  await consumerPage.getByRole("link", { name: "CJ대한통운 배송 조회, 새 창", exact: true }).click();
  expect(await consumerPage.evaluate(() =>
    (window as unknown as { deliveryLookup?: string }).deliveryLookup,
  )).toBe("https://trace.cjlogistics.com/next/tracking.html?wblNo=DEV255678");
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
  // 같은 시드에서 다시 돌려도 이번 문의만 가리키도록 시각을 붙인다(DEV-192)
  const message = `DEV25 연결 실패 뒤에도 남아야 하는 문의 ${Date.now().toString(36)}`;
  await input.fill(message);
  await page.route(
    `${apiUrl}/api/orders/o-07/inquiries`,
    (route) => route.abort("failed"),
    { times: 1 },
  );
  await page.getByRole("button", { name: "농가에 문의 보내기" }).click();
  // 실패가 화면에 보인 뒤에 입력 유지를 보고 가로채기를 푼다. 먼저 풀면 첫 요청이 서버에
  // 닿아 실패 경로를 건너뛸 수 있다(DEV-192)
  await expect(
    page.getByText("인터넷 연결을 확인하고 다시 시도해 주세요."),
  ).toBeVisible();
  await expect(input).toHaveValue(message);
  await page.unroute(`${apiUrl}/api/orders/o-07/inquiries`);
  await page.getByRole("button", { name: "농가에 문의 보내기" }).click();
  await expect(page).toHaveURL(/\/chats\/f-kang/);
  // 주문 탭에 남은 문의 입력창(textarea)도 같은 글자를 가지므로 대화방 말풍선만 본다(DEV-192)
  await expect(
    page
      .getByText(message, { exact: true })
      .and(page.locator(":not(textarea)")),
  ).toBeVisible();
  assertClean();
});

test("AC-08-5 (DEV-147): address sheet marks the current recipient address as the checked radio", async ({
  page,
}) => {
  const assertClean = monitor(page);
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/products/p-house`);
  await page.getByRole("button", { name: "예약하기" }).click();
  await page.getByRole("button", { name: "주문서로" }).click();
  // 시드 김민지: 기본 배송지 a-1(월드컵북로 12) + '회사' a-2(세종대로 110).
  // 같은 파일의 앞 테스트가 새 주소를 기본으로 저장할 수 있어, 처음 기본값이 어느 줄인지는 가정하지 않는다
  const other = page.getByRole("button", { name: "받는 곳 변경" });
  await other.click();
  const home = page.getByRole("radio").filter({ hasText: "월드컵북로 12" });
  const office = page.getByRole("radio").filter({ hasText: "세종대로 110" });
  // 처음 열면 채워진 기본 배송지 하나만 선택돼 있다(aria-checked, react-native-web은 accessibilityState를 무시)
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
  await expect(office).not.toBeChecked();
  await office.click();
  await expect(office).toBeHidden();
  // 고른 주소로 바뀐 뒤 시트를 다시 열면 그 주소가 선택돼 있다
  await other.click();
  await expect(office).toBeChecked();
  await expect(home).not.toBeChecked();
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
  assertClean();
});
