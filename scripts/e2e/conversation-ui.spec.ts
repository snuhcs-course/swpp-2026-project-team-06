import { expect, test } from "./fixtures";
import {
  consumerUrl,
  producerUrl,
  loginConsumer,
  loginProducer,
  apiLogin,
  apiUrl,
} from "./helpers";

for (const width of [360, 390, 430]) {
  test(`AC-06-6/07-6/12-12 N-02: carousels, direct room, shelf and fixed purchase at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(consumerUrl);
    const news = page.getByLabel("농가 소식 가로 목록");
    // DEV-293: 제철 상품은 가로 캐러셀 대신 2열 그리드. 소식만 가로로 넘긴다
    const products = page.getByLabel("제철 상품 목록");
    // AC-06-9 (DEV-348): 제철 상품 위 개념 상자 한 번, 정적 알약 기둥 표식 셋(28×20, 화면 읽기에서 숨김)
    const note = page.getByTestId("stage-price-note");
    await expect(note).toHaveCount(1);
    await expect(note).toContainText(
      "일찍 예약할수록 싸요. 농가가 기간마다 가격을 정하고, 지금 예약하면 지금 가격으로 받아요.",
    );
    const mark = note.getByTestId("stair-mark");
    await expect(mark.locator("rect")).toHaveCount(3);
    const box = await mark.locator("svg").boundingBox();
    expect(Math.round(box!.width)).toBe(28);
    expect(Math.round(box!.height)).toBe(20);
    // DEV-348 홈 카드: 옵션이 여럿인 p-house는 ‘29,000원~’ 옆에 취소선 ‘36,000원’
    const house = products.getByRole("link", { name: "하우스 감귤 5kg / 10kg 상품 상세" });
    await expect(house.getByText("29,000원~", { exact: true })).toBeVisible();
    const cardStrike = house.getByText("36,000원", { exact: true });
    expect(await cardStrike.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain("line-through");
    await expect(news).toBeVisible();
    await expect(products).toBeAttached();
    expect(await products.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
    const cards = products.getByRole("link");
    const [first, second] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
    expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
    expect(second!.x).toBeGreaterThan(first!.x + first!.width);
    for (const carousel of [news]) {
      await expect
        .poll(() => carousel.evaluate((el) => el.scrollWidth > el.clientWidth))
        .toBeTruthy();
      await carousel.evaluate((el) => {
        el.scrollLeft = 300;
      });
      await expect
        .poll(() => carousel.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(100);
    }
    await news.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await page
      .getByRole("link", { name: "강씨네 귤밭 소식방에서 이어 보기" })
      .click();
    await expect(page).toHaveURL(/\/farms\/f-kang$/);
    // DEV-295: 판매 품목은 소비자도 한 줄로 접힌 채 시작한다(Figma 7:78)
    const shelf = page.getByRole("button", { name: "판매 품목", exact: true });
    await expect(shelf).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("link", { name: "하우스 감귤 5kg / 10kg 상품 상세" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("내 답장은 농가에서만 보여요", { exact: false }),
    ).toHaveCount(0);
    await shelf.click();
    await expect(shelf).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByRole("link", { name: "하우스 감귤 5kg / 10kg 상품 상세" }),
    ).toBeVisible();
    await shelf.click();
    await expect(shelf).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("link", { name: "하우스 감귤 5kg / 10kg 상품 상세" }),
    ).toHaveCount(0);
    await shelf.click();
    await page
      .getByRole("link", { name: "하우스 감귤 5kg / 10kg 상품 상세" })
      .click();
    await expect(page).toHaveURL(/\/products\/p-house$/);
    await expect(
      page.getByRole("heading", { name: "하우스 감귤 5kg / 10kg" }),
    ).toBeVisible();
    const buy = page.getByRole("button", { name: "예약하기", exact: true });
    // DEV-293: 구매 화면은 탭 바를 숨기고 CTA만 화면 아래에 고정
    await expect(buy).toBeInViewport();
    await expect(page.getByRole("tab", { name: "발견", exact: true })).toHaveCount(0);
    const a = await buy.boundingBox();
    expect(a!.y + a!.height).toBeLessThanOrEqual(844);
    // 취소선 비교 가격(마지막 기간 36,000원·68,000원)은 앵커로 유지(DEV-348 11/17 PM). 옵션 줄 가격 위 ‘지금 예약가 ~~36,000원~~’ 한 줄
    for (const price of ["36,000원", "29,000원", "68,000원", "55,000원"]) {
      const node = page.getByText(price, { exact: true }).first();
      await expect(node).toBeVisible();
      expect(
        await node.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBeTruthy();
    }
    const options = page.getByTestId("product-options");
    await expect(options.getByText("지금 예약가", { exact: true })).toHaveCount(2);
    const struck = options.getByText("36,000원", { exact: true });
    expect(await struck.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain("line-through");
    const [label, strike] = [
      await options.getByText("지금 예약가", { exact: true }).first().boundingBox(),
      await struck.boundingBox(),
    ];
    expect(Math.abs(label!.y + label!.height - (strike!.y + strike!.height))).toBeLessThan(3);
    // AC-07-9 가격 계단(시드 p-house 세 기간): 칸마다 날짜와 그 기간 가격, 차액 문구 없음
    const stair = page.getByTestId("price-stair");
    await expect(stair.getByText("일찍 예약할수록 싸요 · 5kg 기준", { exact: true })).toBeVisible();
    await expect(page.getByTestId("price-stair-step")).toHaveCount(2);
    await expect(stair.getByTestId("price-stair-label")).toHaveText([
      "지금 · 10월 12일까지29,000원",
      "10월 13일부터33,000원",
      "11월 6일부터36,000원",
    ]);
    await expect(stair.getByText(/이득|차이/)).toHaveCount(0);
    await expect(page.getByText(/^\d+명이 예약했어요$/)).toBeVisible();
    await expect(page.getByText(/^지금 예약하면 \d+번째예요$/)).toBeVisible();
    await expect(page.getByText("농가 계좌로 직접 입금해요", { exact: true })).toBeVisible();
    await expect(page.getByText("11월 30일까지 못 보내면 전액 환불", { exact: true })).toBeVisible();
    // 취소 규정 한 줄은 세 줄 아래에 그대로(지금 화면의 정보는 빼지 않는다)
    await expect(
      page.getByText("출하 전 전액 환불 · 출하 후 단순 변심 반품 불가", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^제주 서귀포 · 팬 \d+명$/)).toBeVisible();
    await page.screenshot({ path: info.outputPath(`product-${width}.png`) });
    await page.getByRole("link").filter({ hasText: "강씨네 귤밭" }).click();
    await expect(page).toHaveURL(/\/farms\/f-kang$/);
    await page.getByRole("button", { name: "강씨네 귤밭 농가 보기" }).click();
    await expect(page).toHaveURL(/\/farms\/f-kang\/info$/);
    await expect(
      page.getByRole("button", { name: "소식방으로" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("AC-12-12: consumer sends in the same room and folding preserves draft", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/farms/f-kang`);
  const input = page.getByRole("textbox", { name: "농가에 답장", exact: true });
  await expect(input).toBeVisible();
  const message = `DEV51 같은 방 답장 ${Date.now()}`;
  await input.fill(message);
  await page.getByRole("button", { name: "판매 품목", exact: true }).click();
  await expect(input).toHaveValue(message);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(page).toHaveURL(/\/farms\/f-kang$/);
  await page.screenshot({ path: info.outputPath("consumer-room.png") });
});

test("FEAT-13 AC-13-5: consumer reports an AI answer and both sides see the server marker", async ({ page, request }) => {
  // API 키 없이도 전달되지 않는 AI 답변을 받도록 소량 주문 원칙을 저장하고 대화를 AUTO로 돌린다.
  const producerToken = await apiLogin(request, "u-kang", "producer");
  const auth = { Authorization: `Bearer ${producerToken}` };
  const settings = await (await request.get(`${apiUrl}/api/farms/me/ai-settings`, { headers: auth })).json();
  const savedSettings = await request.put(`${apiUrl}/api/farms/me/ai-settings`, {
    headers: { ...auth, "Idempotency-Key": `ac13-5-settings-${Date.now()}` },
    data: { ...settings, smallOrderPolicy: "1kg부터 주문할 수 있어요." },
  });
  expect(savedSettings.ok()).toBeTruthy();
  const chat = await (await request.get(`${apiUrl}/api/messaging/producer/chats/u-seojun/messages`, { headers: auth })).json();
  const auto = await request.put(`${apiUrl}/api/messaging/producer/chats/u-seojun/ai-mode`, {
    headers: { ...auth, "Idempotency-Key": `ac13-5-mode-${Date.now()}` },
    data: { mode: "AUTO", version: chat.thread.version },
  });
  expect(auto.ok()).toBeTruthy();

  await loginConsumer(page, "이서준");
  await page.goto(`${consumerUrl}/chats/f-kang?start=1`);
  const prompt = "소량 주문 되나요?";
  await page.getByRole("textbox", { name: "메시지" }).fill(prompt);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(prompt, { exact: true })).toBeVisible();
  const reportButton = page.getByRole("button", { name: "답변 확인 요청", exact: true });
  await expect(reportButton).toBeVisible({ timeout: 15_000 });
  await reportButton.click();
  // DEV-296: 누르면 버튼 대신 빨간 깃발 '농가에 확인 요청함'이 붙는다
  await expect(page.getByText("농가에 확인 요청함", { exact: true })).toBeVisible();
  await expect(reportButton).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("농가에 확인 요청함", { exact: true })).toBeVisible();

  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats/u-seojun`);
  // DEV-296: 생산자 용어도 '확인 요청'(옛 '소비자가 신고한 답변'은 없다)
  await expect(page.getByText("확인 요청", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("소비자가 신고한 답변", { exact: true })).toHaveCount(0);
  await page.getByText("확인 요청", { exact: true }).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "답장", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("AC-14-3/14-4/17-6/12-12: dashboard keeps chat to one unanswered count, chat opens own collapsed room", async ({
  page,
  request,
}, info) => {
  test.setTimeout(120_000);
  // DEV-318: fulfillment tests may already have harvested every seeded order.
  // Give the Reserved-tab assertion its own reserved order instead of relying on
  // another test leaving seeded reservations available.
  const buyer = { Authorization: `Bearer ${await apiLogin(request, "u-minji", "consumer")}` };
  const farm = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
  const created = await request.post(`${apiUrl}/api/orders`, {
    headers: { ...buyer, "Idempotency-Key": crypto.randomUUID() },
    data: {
      productId: "p-house",
      optionId: "opt-5",
      quantity: 1,
      recipientName: "DEV318 합성 구매자",
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
      consentVersion: "dev318-dashboard",
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { orderId } = await created.json() as { orderId: string };
  const deposit = await request.post(`${apiUrl}/api/orders/${orderId}/deposit`, {
    headers: { ...buyer, "Idempotency-Key": crypto.randomUUID() }, data: {},
  });
  expect(deposit.ok(), await deposit.text()).toBeTruthy();
  const confirmed = await request.post(`${apiUrl}/api/orders/${orderId}/confirm-deposit`, {
    headers: { ...farm, "Idempotency-Key": crypto.randomUUID() }, data: {},
  });
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
  expect((await confirmed.json()).status).toBe("RESERVED");
  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  await expect(page.getByRole("heading", { name: "현황", exact: true })).toBeVisible();
  await expect(page.getByText("답변할 대화", { exact: false })).toHaveCount(0);
  // DEV-294: 채팅 관련은 할 일 '답하지 않은 문의 n건' 한 줄뿐이다(있을 때만)
  expect(await page.getByRole("button", { name: /^답하지 않은 문의 \d+건$/ }).count()).toBeLessThanOrEqual(1);
  await expect(
    page.getByRole("button", { name: "수확 시작", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /^전체 주문 \d+건$/ }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("producer-dashboard.png") });
  await page.getByRole("tab", { name: /^채팅(?:, 안 읽음 \d+)?$/ }).click();
  const input = page.getByRole("textbox", {
    name: "모두에게 보낼 소식",
    exact: true,
  });
  await expect(input).toBeVisible();
  const shelf = page.getByRole("button", { name: "판매 품목", exact: true });
  await expect(shelf).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("tab", { name: "내 소식방", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tab", { name: /전체 대화|답변 필요/ }),
  ).toHaveCount(0);
  const message = `DEV51 소식 ${Date.now()}`;
  await input.fill(message);
  await shelf.click();
  await expect(input).toHaveValue(message);
  await shelf.click();
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await page.getByRole("button", { name: "확인 · 보내기", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(shelf).toHaveAttribute("aria-expanded", "false");
  const a = await input.boundingBox(),
    b = await page
      .getByRole("tab", { name: "설정", exact: true })
      .boundingBox();
  expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y);
  await page.screenshot({ path: info.outputPath("producer-room.png") });
  await page.getByRole("tab", { name: "1:1 채팅", exact: true }).click();
  await expect(input).not.toBeVisible();
  await page.getByRole("tab", { name: "내 소식방", exact: true }).click();
  await expect(input).toBeVisible();
  const harvestWrites: string[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && /^\/api\/orders\/producer\/harvest-(orders|start)$/.test(new URL(r.url()).pathname))
      harvestWrites.push(r.url());
  });
  await page.goto(`${producerUrl}/ship?status=RESERVED`);
  // DEV-361: one bottom Start harvest button for the selected reservations (all by default); no per-row
  // status button, no per-period shortcut rows, and opening the tab or the sheet does not change anything.
  await expect(page.getByRole("button", { name: "수확 시작", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^예약 / })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: /건 수확 시작하기(?: |$)/ })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "전체 선택", exact: true })).toHaveAttribute("aria-checked", "true");
  const harvestButton = page.getByRole("button", { name: /^수확 시작 · [1-9]\d*건$/ });
  await expect(harvestButton).toBeVisible();
  await harvestButton.click();
  await expect(page.getByRole("dialog").getByText("수확을 시작할까요?", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "아니요", exact: true }).click();
  expect(harvestWrites).toEqual([]);
});

test("AC-12-13: producer confirms follower count and preview before sending news", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  await page.getByRole("tab", { name: /^채팅(?:, 안 읽음 \d+)?$/ }).click();
  const input = page.getByRole("textbox", {
    name: "모두에게 보낼 소식",
    exact: true,
  });
  await expect(input).toHaveAttribute(
    "placeholder",
    /^팔로워 \d+명에게 보내기$/,
  );
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/messaging/rooms/"))
      posts.push(r.url());
  });
  const message = `DEV210 확인 ${Date.now()}`;
  await input.fill(message);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/^팔로워 \d+명에게 보낼까요\?$/)).toBeVisible();
  await expect(sheet.getByText(message, { exact: true })).toBeVisible();
  await expect(
    page.getByText("보낸 소식의 본문은 수정하거나 삭제할 수 있어요.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "아니요", exact: true }).click();
  await expect(page.getByText(/^팔로워 \d+명에게 보낼까요\?$/)).toHaveCount(0);
  await expect(input).toHaveValue(message);
  expect(posts).toHaveLength(0);

  await page.getByRole("button", { name: "전송", exact: true }).click();
  await page.getByRole("button", { name: "확인 · 보내기", exact: true }).click();
  await expect(page.getByText(/^팔로워 \d+명에게 보냈어요$/)).toBeVisible();
  await expect(sheet).toHaveCount(0);
  await expect(input).toHaveValue("");
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  expect(posts).toHaveLength(1);
});

test("AC-12-14/16: producer deletes own news, or deletes and rewrites it", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const token = await apiLogin(request, "u-kang", "producer");
  const auth = { Authorization: `Bearer ${token}` };
  const post = async (text: string) => {
    const r = await request.post(`${apiUrl}/api/messaging/rooms/f-kang/messages`, {
      headers: { ...auth, "Idempotency-Key": `dev210-${Date.now()}-${Math.random()}` },
      data: { text },
    });
    expect(r.status()).toBe(200);
    return (await r.json()).broadcastId as string;
  };
  const typo = `DEV210 오타 ${Date.now()}`;
  const typoId = await post(typo);

  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  await page.getByRole("tab", { name: /^채팅(?:, 안 읽음 \d+)?$/ }).click();
  const input = page.getByRole("textbox", {
    name: "모두에게 보낼 소식",
    exact: true,
  });
  const menuOf = (text: string) => ({ click: async () => {
    await page.getByText(text, { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "삭제·다시 쓰기", exact: true }).click();
  }});
  await expect(page.getByText(typo, { exact: true })).toBeVisible();
  await menuOf(typo).click();
  await expect(page.getByText("이 소식을 삭제할까요?", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "삭제하고 다시 쓰기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Verify each temporary notification separately; an existing global timer race
  // can otherwise let the first toast's queued hide erase the second one.
  const rewritten = page.getByText("소식을 삭제했어요 · 고쳐서 다시 보내 주세요", { exact: true });
  await expect(rewritten).toBeVisible();
  await expect(rewritten).toBeHidden({ timeout: 7000 });
  await expect(input).toHaveValue(typo);
  // 입력칸(textarea)에 돌아온 글은 빼고 말풍선만 센다
  const bubble = (text: string) => page.locator(`div[dir="auto"]:text-is("${text}")`);
  await expect(bubble(typo)).toHaveCount(0);

  const minji = await apiLogin(request, "u-minji", "consumer");
  const room = await (
    await request.get(`${apiUrl}/api/messaging/rooms/f-kang/messages`, {
      headers: { Authorization: `Bearer ${minji}` },
    })
  ).json();
  expect(room.items.map((m: { messageId: string }) => m.messageId)).not.toContain(typoId);

  await input.fill("");
  const wrong = `DEV210 잘못 보냄 ${Date.now()}`;
  await post(wrong);
  await expect(page.getByText(wrong, { exact: true })).toBeVisible();
  await menuOf(wrong).click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("소식을 삭제했어요", { exact: true })).toBeVisible();
  await expect(bubble(wrong)).toHaveCount(0);
  await expect(input).toHaveValue("");
});

test("AC-12-14: an open consumer room drops news the farm deleted", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const token = await apiLogin(request, "u-kang", "producer");
  const auth = { Authorization: `Bearer ${token}` };
  await page.setViewportSize({ width: 390, height: 844 });
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/farms/f-kang`);
  await expect(page.getByRole("textbox", { name: "농가에 답장", exact: true })).toBeVisible();

  const text = `DEV210 곧 지울 소식 ${Date.now()}`;
  const sent = await request.post(`${apiUrl}/api/messaging/rooms/f-kang/messages`, {
    headers: { ...auth, "Idempotency-Key": `dev210-open-${Date.now()}` },
    data: { text },
  });
  expect(sent.status()).toBe(200);
  const bubble = page.locator(`div[dir="auto"]:text-is("${text}")`);
  await expect(bubble).toHaveCount(1);

  const deleted = await request.delete(
    `${apiUrl}/api/messaging/news/${(await sent.json()).broadcastId}`,
    { headers: auth },
  );
  expect(deleted.status()).toBe(204);
  // 2초 새로고침에서 빠진다(가장 최근 소식이어도)
  await expect(bubble).toHaveCount(0);
});

test("AC-07-6 N-02: long farm names and full-ratio story image retain fixed controls", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/products/p-house", async (route) => {
    const response = await route.fetch();
    const product = await response.json();
    await route.fulfill({
      response,
      json: {
        ...product,
        farmName: "제주 서귀포에서 감귤을 함께 키우는 아주 긴 이름의 농가",
        detailContent: {
          blocks: [
            {
              id: "fixture",
              type: "image",
              uri: "/photos/farm-story.png",
              alt: "DEV51 이미지 비율 fixture",
            },
          ],
        },
      },
    });
  });
  await page.goto(`${consumerUrl}/products/p-house`);
  const story = page
    .getByRole("img", { name: "DEV51 이미지 비율 fixture", exact: true })
    .first();
  await expect(story).toBeAttached();
  await expect
    .poll(async () => {
      const box = await story.boundingBox();
      return box ? box.height / box.width : 0;
    })
    .toBeCloseTo(2056 / 765, 2);
  await story.scrollIntoViewIfNeeded();
  const buy = page.getByRole("button", { name: "예약하기", exact: true });
  await expect(buy).toBeInViewport();
  // DEV-293: 구매 화면은 탭 바 없이 CTA만
  await expect(page.getByRole("tab", { name: "발견", exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: info.outputPath("story-fixed-controls.png") });
});

test("DEV-208 AC-13-9: direct-mode room shows who answers and a forwarded status under the question", async ({
  page,
  request,
}) => {
  // 시드 김민지–강씨네 방은 농가가 답한 대화라 HUMAN이다. 강씨네는 최근 답이 5건 미만이라 숫자 없는 문구가 나온다.
  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/chats/f-kang`);
  // DEV-295: 위 안내 띠 대신 대화 맨 위 시스템 문구 한 줄(Figma 1:38)
  await expect(page.getByTestId("chat-system-line")).toHaveText("AI 안내가 꺼져 있어요 · 농가가 직접 답해요");
  // 같은 DB에서 먼저 돈 spec(checkout-and-fulfillment의 o-07 문의, consumer-order-recovery의 DEV-318 문의)이
  // 이 방에 결제 주문을 둘 이상 연결해 두면, 방은 주문을 고르기 전까지 입력칸을 잠근다(주문이 하나면 자동 선택).
  // 그때는 사용자가 하듯 주문 하나를 골라 같은 질문을 보낸다. 주문이 하나일 때 자동 선택되는 것과 같은 경로이고,
  // 전달 상태 줄은 주문과 상관없이 ‘농가가 답해야 하는 마지막 질문’ 아래에 붙으므로 아래 단언은 그대로다(DEV-356)
  const pickOrder = page.getByRole("button", { name: "주문 선택", exact: true });
  if (await pickOrder.isVisible()) {
    await pickOrder.click();
    await page.getByRole("button", { name: /^주문 \S+ · .+ · \d+개$/ }).first().click();
  }
  const composer = page.getByRole("textbox", { name: "메시지" });
  await expect(composer).toBeEditable();
  const question = `DEV-208 당도는 얼마예요? ${Date.now()}`;
  await composer.fill(question);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  const status = page.getByTestId("chat-forward-status");
  await expect(status).toHaveCount(1);
  await expect(status).toHaveText("농가에 전달했어요 · 답이 오면 여기에 보여요");

  // 농가가 답하면 상태 줄은 사라진다
  const producerToken = await apiLogin(request, "u-kang", "producer");
  const reply = await request.post(`${apiUrl}/api/messaging/producer/chats/u-minji/messages`, {
    headers: { Authorization: `Bearer ${producerToken}`, "Idempotency-Key": `dev208-${Date.now()}` },
    data: { text: "당도는 11.8Brix예요." },
  });
  expect(reply.ok()).toBeTruthy();
  await expect(page.getByText("당도는 11.8Brix예요.", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("chat-forward-status")).toHaveCount(0);
});
