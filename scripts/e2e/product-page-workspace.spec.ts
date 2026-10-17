import { test, expect } from "@playwright/test";
import { producerUrl, loginProducer, monitor } from "./helpers";

test("AC-SRC-9: selling product edits remain private until explicit apply", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products?filter=selling`);
  // The default group is selling; use the product-specific action, never generic upload entry.
  const card = page
    .getByRole("button", { name: /하우스 감귤 5kg.*편집/ })
    .locator("..");
  await card
    .getByRole("button", { name: "판매페이지 수정", exact: true })
    .click();
  await expect(page).toHaveURL(/\/products\/p-house\/detail$/);
  await expect(
    page.getByText("현재 상품에 반영된 내용을 수정해요.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "설명 추가", exact: true }).click();
  const content = `판매페이지 수정 검증 ${Date.now()}`;
  await page.getByLabel("내용 1", { exact: true }).fill(content);
  await page.getByRole("button", { name: "수정본 저장", exact: true }).click();
  await expect(
    page.getByText("수정본을 저장했어요. 아직 상품에는 반영되지 않았어요.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("내용 1", { exact: true })).toHaveValue(content);
  await page.getByRole("button", { name: "미리보기", exact: true }).click();
  await expect(page.getByTestId("product-page-preview")).toContainText(content);
  await page.getByRole("button", { name: "상품에 반영", exact: true }).click();
  await expect(
    page.getByText("반영하면 구매자가 보는 판매페이지가 바로 바뀌어요.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "확인 · 상품에 반영", exact: true })
    .click();
  await expect(
    page.getByText("상품에 반영했어요.", { exact: true }),
  ).toBeVisible();
  clean();
});
