import { expect, test } from "./fixtures";

import { loginProducer, monitor, producerUrl } from "./helpers";

// DEV-84: 운영처럼 자료 분석이 꺼진 서버(SOURCE_ANALYSIS_ENABLED=false로 통합 실행)에서
// 새 상품·판매페이지 편집이 기존 문구/직접 입력·상세 편집으로 가는지 본다.
// DEV-361 PR C(C-1): 예전 편집기는 지웠다. 상품 수정은 같은 composer를 상품만으로 연다(AI 없음, '상세 고치기' → 블록 편집기).
test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "false");

test("DEV-84 DEV-361: new product falls back to manual input when source analysis is off", async ({ page }) => {
  // 상품만 여는 composer는 판매 중 상품의 상품 초안 API를 읽어 보고 404(꺼진 서버)면 바로 반영 방식으로 간다(C-2)
  const assertClean = monitor(page, [/status of 404/]);
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
  // The old 상품 편집 screen is gone: the new product opens in the product-only composer (DEV-361 C-1)
  await expect(page).toHaveURL(/\/products\/p-[^/]+\/detail/);
  const basic = page.getByTestId("product-basic-info");
  await expect(basic.getByLabel("상품명", { exact: true })).toBeVisible();
  await expect(basic.getByLabel("상품명", { exact: true })).toBeEditable();
  await expect(page.getByRole("button", { name: "AI 시트 열기" })).toHaveCount(0);
  // A draft product keeps the two steps: 다음 goes to 판매·가격 (C-4)
  await expect(page.getByTestId("presale-steps")).toBeVisible();
  await expect(page.getByRole("button", { name: "다음: 판매·가격", exact: true })).toBeVisible();
  // A draft product is not buyer-visible, so no product-draft read either: no source-analysis traffic at all
  expect(workspaceCalls).toEqual([]);
  assertClean();
});

test("DEV-84 DEV-361: sales page edit opens the product-only composer and its detail editor when source analysis is off", async ({ page }) => {
  // 판매 중 상품의 상품 초안 GET은 꺼진 서버에서 404다(C-2 바로 반영 방식)
  const assertClean = monitor(page, [/status of 404/]);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/detail`);
  const basic = page.getByTestId("product-basic-info");
  await expect(basic).toBeVisible();
  await expect(page).not.toHaveURL(/composer=1/);
  await expect(page.getByRole("button", { name: "AI 시트 열기" })).toHaveCount(0);
  await expect(page.getByText("상품을 열지 못했어요. 다시 시도해 주세요.", { exact: true })).toHaveCount(0);
  // No private draft on this server: no 임시 저장 for a selling product (C-2)
  await expect(page.getByRole("button", { name: "임시 저장", exact: true })).toHaveCount(0);
  await expect(page.getByText("이 화면에서는 상세를 저장하면 구매자에게 바로 보여요.", { exact: true })).toBeVisible();
  // The story is read-only here; '상세 고치기' opens the block detail editor (old legacy-editor fallback)
  await page.getByRole("button", { name: "상세 고치기", exact: true }).click();
  await expect(page).toHaveURL(/\/products\/p-house\/story/);
  await expect(page.getByText("이야기 초안 만들기", { exact: true })).toBeVisible();
  assertClean();
});
