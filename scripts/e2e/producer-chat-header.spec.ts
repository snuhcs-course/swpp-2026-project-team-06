import { expect, test } from "@playwright/test";
import { loginProducer, producerUrl } from "./helpers";

// DEV-232: 생산자 1:1 머리 이름을 대화 응답에서 읽는다. 링크로 바로 열거나 새로고침해도 목록과 같은 가림 이름이다
test("DEV-232: producer 1:1 header keeps the masked consumer name on direct link and reload", async ({ page }) => {
  await loginProducer(page, "강영수");
  const header = page.getByText("1:1 채팅", { exact: true }).locator("..");

  await page.goto(`${producerUrl}/chats/u-minji`);
  // 대화가 그려진 뒤(응대 바 버튼)를 기준으로 본다
  await expect(page.getByRole("button", { name: /직접 응대로 전환|AI 응답 재개/ })).toBeVisible();
  const shot = process.env.DEV232_SHOT;
  if (shot) await page.screenshot({ path: shot });
  await expect(header.getByText("김○○", { exact: true })).toBeVisible();
  await expect(header.getByText("소비자", { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(header.getByText("김○○", { exact: true })).toBeVisible();

  await page.goto(`${producerUrl}/chats?view=private`);
  await page.getByLabel(/^김○○, /).click();
  await expect(header.getByText("김○○", { exact: true })).toBeVisible();
});
