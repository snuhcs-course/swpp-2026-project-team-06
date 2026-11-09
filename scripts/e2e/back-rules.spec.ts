// DEV-224 (ia.md 4장 뒤로 규칙·탭 첫 화면, 5장 없는 농가, screens.md 3장): 하위 화면의 헤더 뒤로와 하단 탭.
// - b1 탭을 누르면 언제나 그 탭의 첫 화면(HE-01 채팅 탭, HE-X3 내 주문 탭)
// - a1 상품·농가 정보·주문 상세에서 연 1:1 방의 뒤로는 연 화면
// - c1 주소로 바로 열기·새로고침 뒤 헤더 뒤로는 부모 화면(HE-X1 제자리 5곳 포함)
// - d1 없는 농가 링크는 '찾을 수 없는 농가예요'와 '농가 둘러보기'
// 실서버(FastAPI + 두 앱) 대상. 시드 김민지(강씨네 귤밭 팔로워, 주문 o-11)·강영수(p-house).
import { expect, test } from "./fixtures";
import type { Page } from "./fixtures";

import { consumerUrl, loginConsumer, loginProducer, monitor, producerUrl } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

async function tab(page: Page, label: string) {
  await page.getByText(label, { exact: true }).last().click();
}
// 헤더 뒤로(입력 화면은 '닫기')
const backButton = (page: Page) => page.getByRole("button", { name: /^(뒤로|닫기)$/ }).first();
const back = (page: Page) => backButton(page).click();
const path = (page: Page) => {
  const u = new URL(page.url());
  return u.pathname + u.search;
};

test("DEV-224 HE-01: a room opened from a product goes back to it, and the chat tab opens the list", async ({ page }) => {
  const assertClean = monitor(page);
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/products/p-house`);
  await page.getByRole("button", { name: "채팅", exact: true }).click();
  await expect(page).toHaveURL(/\/chats\/f-kang\?.*productId=p-house/);
  await back(page);
  await expect(page).toHaveURL(/\/products\/p-house$/);
  // DEV-293: 상품 상세는 구매 화면이라 탭 바가 없다. 판매자 줄 → 농가 정보(발견 탭, 탭 바 있음)에서 채팅 탭을 누른다
  await page.getByRole("link", { name: /^강씨네 귤밭/ }).click();
  await expect(page).toHaveURL(/\/farms\/f-kang$/);
  await page.getByRole("button", { name: "강씨네 귤밭 농가 보기" }).click();
  await expect(page).toHaveURL(/\/farms\/f-kang\/info$/);
  await tab(page, "채팅");
  await expect(page).toHaveURL(/\/chats$/);
  // 채팅 탭 안에서 연 방의 뒤로는 목록
  await page.goto(`${consumerUrl}/chats?view=private`);
  await page.getByText("강씨네 귤밭").first().click();
  await expect(page).toHaveURL(/\/chats\/f-kang$/);
  await back(page);
  await expect(page).toHaveURL(/\/chats(\?view=private)?$/);
  assertClean();
});

test("DEV-224 a1: rooms opened from farm info and order detail go back there", async ({ page }) => {
  const assertClean = monitor(page);
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/farms/f-kang/info`);
  await page.getByRole("button", { name: "1:1 채팅" }).click();
  await expect(page).toHaveURL(/\/chats\/f-kang\?.*from=info/);
  await back(page);
  await expect(page).toHaveURL(/\/farms\/f-kang\/info$/);
  // 주문 상세에서 연 방(주소로 열어 탭 기록이 없어도 그 주문으로)
  // o-11 is Minji's paid f-halla order. The legacy route now validates this pair.
  await page.goto(`${consumerUrl}/chats/f-halla?from=order&fromOrder=o-11`);
  await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeEditable();
  await back(page);
  await expect(page).toHaveURL(/\/orders\/o-11$/);
  assertClean();
});

test("DEV-224 HE-X3: after order done → home, the orders tab opens the order list", async ({ page }) => {
  const assertClean = monitor(page);
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/orders/o-11/done`);
  await page.getByRole("button", { name: "홈으로" }).click();
  await expect(page).toHaveURL(/\/$/);
  await tab(page, "내 주문");
  await expect(page).toHaveURL(/\/orders(\?filter=[a-z_]+)?$/);
  assertClean();
});

const CONSUMER_DIRECT: [string, RegExp][] = [
  ["/checkout/p-house/pay?orderId=o-11&optionId=opt-5&quantity=1", /^\/orders\/o-11$/], // HE-X1
  ["/orders/o-11/inquiry", /^\/orders\/o-11$/], // HE-X1
  ["/orders/o-11", /^\/orders(\?.*)?$/],
  ["/checkout/p-house?optionId=opt-5&quantity=1", /^\/products\/p-house$/],
  ["/products/p-house", /^\/farms\/f-kang$/],
  ["/farms/f-kang/info", /^\/farms\/f-kang$/],
  ["/chats/f-kang", /^\/chats\?view=private$/],
  ["/me/addresses/edit", /^\/me\/addresses$/],
];

test("DEV-224 c1: consumer screens opened directly go back to their parent", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await loginConsumer(page);
  for (const [url, want] of CONSUMER_DIRECT) {
    const p = await ctx.newPage();
    await p.goto(`${consumerUrl}${url}`);
    await expect(backButton(p)).toBeVisible();
    await back(p);
    await expect.poll(() => path(p), { message: url }).toMatch(want);
    await p.close();
  }
  await ctx.close();
});

const PRODUCER_DIRECT = [
  "/products/p-house/sell", // HE-X1
  "/products/p-house/stages", // HE-X1
  "/products/source-analysis?composer=1", // HE-X1 판매페이지 만들기
  "/products/p-house/edit",
];

test("DEV-224 c1: producer product sub-screens opened directly go back to the product list", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await loginProducer(page, "강영수");
  for (const url of PRODUCER_DIRECT) {
    const p = await ctx.newPage();
    await p.goto(`${producerUrl}${url}`);
    await expect(backButton(p)).toBeVisible();
    await back(p);
    await expect.poll(() => path(p), { message: url }).toMatch(/^\/products(\?.*)?$/);
    await p.close();
  }
  await ctx.close();
});

test("DEV-224 d1: a link to a farm that does not exist shows the not-found screen", async ({ page }) => {
  const assertClean = monitor(page, [/404/, /Failed to load resource/]);
  await page.goto(`${consumerUrl}/farms/f-nope`);
  await expect(page.getByText("찾을 수 없는 농가예요")).toBeVisible();
  await expect(page.getByText("링크가 바뀌었거나 지금은 활동하지 않는 농가예요.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^팔로우/ })).toHaveCount(0);
  await expect(page.getByText("소식방", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "농가 둘러보기" }).click();
  await expect(page).toHaveURL(/\/farms$/);
  assertClean();
});
