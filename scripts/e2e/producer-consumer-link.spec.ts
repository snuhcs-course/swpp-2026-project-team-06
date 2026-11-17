import { expect, test } from "./fixtures";
import { apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

// DEV-331 (PM 11/15): 현황 머리 아래 고정 막대 '소비자에게 우리 농가 공유하기'(Figma v6 시안 D).
// 막대를 누르면 내 농가 공유 링크를 복사한다. 닫기는 없고, 스크롤해도 머리와 함께 보인다(DEV-326 카드를 바꿈).

test("DEV-331 producer home pins a share bar that copies the farm link, has no close button and stays on scroll", async ({ page }) => {
  const assertClean = monitor(page);
  await page.setViewportSize({ width: 390, height: 844 });
  // 화면이 받은 농가 정보를 그대로 읽는다(응답 본문은 이동하면 사라지므로 가로채서 보관)
  const seen: { farm?: { farmId: string; name: string; shareUrl: string | null } } = {};
  await page.route(`${apiUrl}/api/farms/me`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    seen.farm = await response.json();
    await route.fulfill({ response });
  });
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/`);
  await expect.poll(() => seen.farm?.farmId ?? null).not.toBeNull();
  const farm = seen.farm!;

  const bar = page.getByTestId("consumer-share-bar");
  await expect(bar).toBeVisible();
  await expect(bar.getByText("소비자에게 우리 농가 공유하기", { exact: true })).toBeVisible();
  // 닫기는 없다
  await expect(page.getByRole("button", { name: "소비자 페이지 안내 닫기" })).toHaveCount(0);
  // 머리(농가명·날짜 줄) 바로 아래, '주문' 제목보다 위
  const dateLine = page.getByText(`${farm.name} ·`, { exact: false }).first();
  const orders = page.getByText("주문", { exact: true }).first();
  await expect(orders).toBeVisible();
  const barBox = (await bar.boundingBox())!;
  expect(barBox.y).toBeGreaterThan((await dateLine.boundingBox())!.y);
  expect(barBox.y).toBeLessThan((await orders.boundingBox())!.y);
  // 누르는 영역은 48 이상
  expect(barBox.height).toBeGreaterThanOrEqual(48);

  // 막대를 누르면 페이지를 열지 않고 설정 화면 '복사'와 같은 공유 링크를 복사한다(PM 11/15)
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: producerUrl });
  let popups = 0;
  page.on("popup", () => (popups += 1));
  await page.getByRole("button", { name: "소비자에게 우리 농가 공유하기, farmclub.kr 링크 복사", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "링크를 복사했어요" })).toBeVisible();
  expect(farm.shareUrl).toMatch(/^https?:\/\//);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(farm.shareUrl);
  expect(popups).toBe(0);

  // 좁은 폰(360)에서도 문구가 말줄임으로 잘리지 않는다
  await page.setViewportSize({ width: 360, height: 780 });
  const label = bar.getByText("소비자에게 우리 농가 공유하기", { exact: true });
  await expect(label).toBeVisible();
  const clipped = await label.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(clipped).toBeLessThanOrEqual(0);

  // 스크롤해도 막대는 같은 자리에 남는다(머리와 함께 고정). 화면을 줄여 스크롤이 생기게 한 뒤 스크롤 영역을 직접 내린다
  await page.setViewportSize({ width: 390, height: 520 });
  const pinnedY = (await bar.boundingBox())!.y;
  const ordersY = (await orders.boundingBox())!.y;
  const scrolled = await orders.evaluate((node) => {
    let el: HTMLElement | null = node as HTMLElement;
    while (el && !(el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== "visible")) el = el.parentElement;
    if (!el) return 0;
    el.scrollTop = 200;
    return el.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  await expect.poll(async () => (await orders.boundingBox())?.y ?? ordersY).toBeLessThan(ordersY - scrolled + 1);
  expect(Math.abs((await bar.boundingBox())!.y - pinnedY)).toBeLessThan(1);
  await expect(bar).toBeVisible();
  assertClean();
});
