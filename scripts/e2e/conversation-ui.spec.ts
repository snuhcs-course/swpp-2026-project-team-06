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
    const products = page.getByLabel("상품 가로 목록");
    await expect(news).toBeVisible();
    await expect(products).toBeAttached();
    for (const carousel of [news, products]) {
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
    const shelf = page.getByRole("button", { name: "판매 품목", exact: true });
    await expect(shelf).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByText("내 답장은 농가에서만 보여요", { exact: false }),
    ).toHaveCount(0);
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
    const tab = page.getByRole("tab", { name: "발견", exact: true });
    await expect(buy).toBeVisible();
    await expect(tab).toBeVisible();
    const a = await buy.boundingBox(),
      b = await tab.boundingBox();
    expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y);
    for (const price of ["36,000원", "29,000원", "68,000원", "55,000원"]) {
      const node = page.getByText(price, { exact: true }).first();
      await expect(node).toBeVisible();
      expect(
        await node.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBeTruthy();
    }
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
  await expect(page.getByRole("button", { name: "확인 요청됨", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "확인 요청됨", exact: true })).toBeVisible();

  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats/u-seojun`);
  await expect(page.getByText("소비자가 신고한 답변", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "답장", exact: true }).first()).toBeVisible();
});

test("AC-14-4/17-6/12-12: dashboard has only fulfillment, chat opens own collapsed room", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  await expect(page.getByText("주문·배송 현황", { exact: true })).toBeVisible();
  await expect(page.getByText("답변할 대화", { exact: false })).toHaveCount(0);
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
    page.getByRole("tab", { name: "소식방", exact: true }),
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
      .getByRole("tab", { name: "환경설정", exact: true })
      .boundingBox();
  expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y);
  await page.screenshot({ path: info.outputPath("producer-room.png") });
  await page.getByRole("tab", { name: "1:1 채팅", exact: true }).click();
  await expect(input).not.toBeVisible();
  await page.getByRole("tab", { name: "소식방", exact: true }).click();
  await expect(input).toBeVisible();
  const harvestWrites: string[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/orders/producer/harvest-start")
      harvestWrites.push(r.url());
  });
  await page.goto(`${producerUrl}/ship?status=RESERVED`);
  // DEV-231 adds navigation to the stage card; no direct per-order transition here.
  await expect(page.getByRole("button", { name: "수확 시작", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^예약 / })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const harvestTarget = page.getByRole("button", { name: /건 수확 시작하기(?: |$)/ }).first();
  await expect(harvestTarget).toBeVisible();
  await harvestTarget.click();
  await expect(page).toHaveURL(/\/products\/[^/]+\/stages\?stage=[^&]+$/);
  const selectedStage = new URL(page.url()).searchParams.get("stage");
  expect(selectedStage).toBeTruthy();
  await expect(page.locator(`[id="stage-${selectedStage}"]`)
    .getByRole("button", { name: /^(?:수확 시작 · 출하 준비 \d+건|남은 예약 \d+건도 출하 준비로)$/ })).toBeVisible();
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
    /^팔로워 \d+명에게 소식 보내기$/,
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
    page.getByText("보낸 소식은 지울 수 있지만 고칠 수는 없어요.", {
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
  // 통합 환경은 시각이 고정돼 같은 시각 소식끼리 순서가 정해지지 않으므로 그 말풍선의 ⋯를 찾는다
  const menuOf = (text: string) =>
    page
      .locator("div")
      .filter({ has: page.getByText(text, { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "소식 메뉴", exact: true }) })
      .last()
      .getByRole("button", { name: "소식 메뉴", exact: true });
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
  const bottom = page.getByRole("tab", { name: "발견", exact: true });
  await expect(bottom).toBeInViewport();
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
  await expect(page.getByText("AI 안내 없이 농가가 직접 답해요 · 답이 오면 여기에 보여요")).toBeVisible();
  const question = `DEV-208 당도는 얼마예요? ${Date.now()}`;
  await page.getByRole("textbox", { name: "메시지" }).fill(question);
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
