import { expect, test } from "@playwright/test";
import {
  consumerUrl,
  producerUrl,
  loginConsumer,
  loginProducer,
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
  await page.goto(`${producerUrl}/ship?status=RESERVED`);
  await expect(page.getByRole("button", { name: "수확 시작" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^예약 / })).toHaveAttribute(
    "aria-selected",
    "true",
  );
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
