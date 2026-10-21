import { expect, test } from "@playwright/test";
import { loginProducer, monitor, producerUrl } from "./helpers";

const steps = [
  "farmclub에 오신 걸 환영해요",
  "새 상품 등록하기",
  "AI가 판매페이지 초안을 써 드려요",
  "채팅방 둘러보기",
  "반복되는 질문은 AI가 먼저 답해요",
  "궁금한 게 있으면 언제든지",
];

test("DEV-109: first dashboard visit opens the help guide once and walks all six steps", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const assertClean = monitor(page);
  await loginProducer(page, "강영수", { helpGuide: true });
  await expect(page.getByText("farmclub 사용 안내", { exact: true })).toBeVisible();
  for (const [i, title] of steps.entries()) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText(`${i + 1} / 6`, { exact: true })).toBeVisible();
    if (i === 0) await expect(page.getByRole("button", { name: "이전", exact: true })).toHaveCount(0);
    if (i === 1) await page.screenshot({ path: testInfo.outputPath("help-guide-step.png") });
    if (i < steps.length - 1) await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  await expect(page.getByText("모르는 게 있으면 운영자에게 편하게 문의해 주세요.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.getByRole("heading", { name: steps[4] })).toBeVisible();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  await expect(page.getByText("farmclub 사용 안내", { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("농가 현황", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "도움말" })).toBeVisible();
  await expect(page.getByText("farmclub 사용 안내", { exact: true })).toHaveCount(0);
  assertClean();
});

test("DEV-109: every tab screen has a top-right help button that reopens at step 1", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  for (const path of ["/", "/products", "/chats", "/settings"]) {
    await page.goto(`${producerUrl}${path}`);
    const help = page.getByRole("button", { name: "도움말" });
    await expect(help).toBeVisible();
    const box = (await help.boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(375 - 40);
    expect(box.y).toBeLessThan(160);
    await help.click();
    await expect(page.getByRole("heading", { name: steps[0] })).toBeVisible();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: steps[1] })).toBeVisible();
    await page.getByRole("button", { name: "닫기" }).last().click();
    await expect(page.getByText("farmclub 사용 안내", { exact: true })).toHaveCount(0);
    await help.click();
    await expect(page.getByRole("heading", { name: steps[0] })).toBeVisible();
    if (path === "/products") await page.screenshot({ path: testInfo.outputPath("help-guide-products.png") });
    await page.getByRole("button", { name: "닫기" }).last().click();
  }
  assertClean();
});
