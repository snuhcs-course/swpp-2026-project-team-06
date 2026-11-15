import { expect, test } from "./fixtures";
import { apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

// DEV-326 (11/15 생산자 피드백): 현황 맨 위에 소비자 페이지 안내 카드(Figma C3).
// 오른쪽 'farmclub.kr' 버튼은 내 농가 공유 링크를 복사하고, 닫으면 이 기기·농가에서는 다시 띄우지 않는다.

test("DEV-326 producer home shows the consumer page card that copies the farm page link and stays closed", async ({ page }) => {
  const assertClean = monitor(page);
  await page.setViewportSize({ width: 390, height: 844 });
  // 화면이 받은 농가 정보를 그대로 읽는다(응답 본문은 이동하면 사라지므로 가로채서 보관). 응답이 올 때마다 횟수를 센다
  const seen: { farm?: { farmId: string; name: string; shareUrl: string | null }; responses: number } = { responses: 0 };
  await page.route(`${apiUrl}/api/farms/me`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    seen.farm = await response.json();
    seen.responses += 1;
    await route.fulfill({ response });
  });
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/`);
  await expect.poll(() => seen.farm?.farmId ?? null).not.toBeNull();
  const farm = seen.farm!;

  const card = page.getByTestId("consumer-page-card");
  await expect(card).toBeVisible();
  await expect(card.getByText("소비자가 보는 내 농가", { exact: true })).toBeVisible();
  await expect(card.getByText(farm.name, { exact: true })).toBeVisible();
  // 맨 위: 늘 그려지는 '주문' 제목보다 위
  const orders = page.getByText("주문", { exact: true }).first();
  await expect(orders).toBeVisible();
  expect((await card.boundingBox())!.y).toBeLessThan((await orders.boundingBox())!.y);

  // 'farmclub.kr' 버튼은 페이지를 열지 않고 설정 화면 '복사'와 같은 공유 링크를 복사한다(PM 11/15)
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: producerUrl });
  let popups = 0;
  page.on("popup", () => (popups += 1));
  await card.getByRole("button", { name: "farmclub.kr 내 농가 링크 복사", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "링크를 복사했어요" })).toBeVisible();
  expect(farm.shareUrl).toMatch(/^https?:\/\//);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(farm.shareUrl);
  expect(popups).toBe(0);

  await card.getByRole("button", { name: "소비자 페이지 안내 닫기", exact: true }).click();
  await expect(card).toHaveCount(0);

  // 다시 열어도 안 뜬다: 농가 정보가 온 뒤(카드가 그려질 수 있는 때)에 확인한다
  const before = seen.responses;
  await page.reload();
  await expect.poll(() => seen.responses).toBeGreaterThan(before);
  await expect(page.getByText(`${farm.name} ·`, { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("consumer-page-card")).toHaveCount(0);
  assertClean();
});
