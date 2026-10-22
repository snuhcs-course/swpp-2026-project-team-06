import { test, expect } from "@playwright/test";
import { consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

for (const width of [360, 390]) {
  test(`DEV-85 AC-06-6 AC-01-6 AC-14-4: approved logos preserve search and producer login at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await skipHelpGuide(page);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));

    await page.goto(consumerUrl);
    const wordmark = page.getByTestId("brand-logo-wordmark");
    await expect(wordmark).toBeVisible();
    await expect.poll(() => wordmark.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByText("소식방에서 이어 보기 →").first()).toBeVisible();
    const search = page.getByRole("button", { name: "농가·상품 검색" });
    const wordmarkBox = await wordmark.boundingBox();
    const searchBox = await search.boundingBox();
    expect(wordmarkBox!.x + wordmarkBox!.width).toBeLessThan(searchBox!.x);
    await page.screenshot({ path: testInfo.outputPath("consumer-home.png") });
    await search.click();
    await expect(page).toHaveURL(/\/farms\?focus=search/);

    await page.goto(`${producerUrl}/login`);
    const full = page.getByTestId("brand-logo-full");
    await expect(full).toBeVisible();
    await expect.poll(() => full.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByTestId("brand-logo-wordmark")).toHaveCount(0);
    const heading = page.getByRole("heading", { name: /계정을 골라\s*시작하세요/ });
    await expect(heading).toHaveCSS("font-size", "30px");
    await expect(heading).toHaveCSS("line-height", "32px");
    expect((await heading.boundingBox())!.height).toBe(64);
    await expect(full).toHaveCSS("width", "172px");
    await expect(full).toHaveCSS("height", "129px");
    const cta = page.getByRole("button", { name: /강영수로 시작하기/ });
    await expect(cta).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("producer-login.png") });

    await page.getByRole("radio", { name: /강영수/ }).click();
    await cta.click();
    await expect(page).not.toHaveURL(/\/login/);
    const symbol = page.getByTestId("brand-logo-icon");
    await expect(symbol).toBeVisible();
    await expect.poll(() => symbol.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByText("농가 현황", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /전체 주문 \d+건/ })).toBeVisible();
    await expect(symbol).toHaveCSS("width", "36px");
    await expect(symbol).toHaveCSS("height", "40px");
    await page.screenshot({ path: testInfo.outputPath("producer-dashboard.png") });
    expect(errors).toEqual([]);
  });
}
