import { expect, test } from "@playwright/test";

import { loginProducer, monitor, producerUrl } from "./helpers";

// DEV-84: 운영처럼 자료 분석이 꺼진 서버(SOURCE_ANALYSIS_ENABLED=false로 통합 실행)에서
// 새 상품·판매페이지 편집이 기존 문구/직접 입력·상세 편집으로 가는지 본다.
test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "false");

test("DEV-84: new product falls back to manual input when source analysis is off", async ({ page }) => {
  const assertClean = monitor(page);
  const workspaceCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/source-analysis/product-workspaces")) workspaceCalls.push(request.url());
  });
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products`);
  await page.getByRole("button", { name: "새 상품", exact: true }).click();
  await expect(page).toHaveURL(/\/products\/manual/);
  await page.getByLabel("카톡·밴드에 쓰던 문구").fill("DEV84 노지 감귤 5kg, 예상 당도 12브릭스");
  await page.getByRole("button", { name: "초안 만들기" }).click();
  const generated = page.getByRole("heading", { name: "초안이 나왔어요" });
  await expect(generated.or(page.getByText("초안을 만들지 못했어요"))).toBeVisible();
  if (await generated.isVisible()) await page.getByRole("button", { name: "편집으로" }).click();
  else await page.getByRole("button", { name: "직접 입력하기" }).click();
  await expect(page).toHaveURL(/\/products\/p-[^/]+\/edit/);
  await expect(page.getByLabel("상품명")).toBeVisible();
  expect(workspaceCalls).toEqual([]);
  assertClean();
});

test("DEV-84: sales page edit opens the legacy detail editor when source analysis is off", async ({ page }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await expect(page.getByText("이야기 초안 만들기", { exact: true })).toBeVisible();
  assertClean();
});
