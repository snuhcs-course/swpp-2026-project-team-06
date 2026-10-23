import { test, expect } from "@playwright/test";
import { consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

// DEV-113 (R-16, policy.md 6장): 첫 화면 하단 사업자 정보와 로그인 없이 열리는 약관·처리방침
test("DEV-113 R-16: consumer home and login show the legal footer and open /privacy and /terms without login", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(consumerUrl);
  const footer = page.getByTestId("legal-footer");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();
  // 로컬 Mock 빌드에는 사업자 정보 값이 없어 ‘테스트 서비스’만 보인다
  await expect(footer.getByText("farmclub · 테스트 서비스")).toBeVisible();
  await expect(footer.getByText(/통신판매중개자/)).toBeVisible();

  await footer.getByRole("link", { name: "개인정보 처리방침" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "제6조 (개인정보의 국외 이전)" })).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(page).toHaveURL(new RegExp(`^${consumerUrl}/?$`));

  await page.goto(`${consumerUrl}/terms`);
  await expect(page.getByRole("heading", { name: "제3조 (회사의 지위 — 통신판매중개자)" })).toBeVisible();

  await page.goto(`${consumerUrl}/login`);
  await expect(page.getByTestId("legal-footer")).toBeAttached();
  expect(errors).toEqual([]);
});

test("DEV-113 R-16: producer login shows the legal footer and the gate lets guests read the terms", async ({ page }) => {
  await skipHelpGuide(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(producerUrl);
  await expect(page).toHaveURL(/\/login$/);
  const footer = page.getByTestId("legal-footer");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();
  await footer.getByRole("link", { name: "이용약관" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { name: "제14조 (판매자의 의무)" })).toBeVisible();

  // 새로고침해도 비로그인 관문이 /login으로 보내지 않는다
  await page.goto(`${producerUrl}/privacy`);
  await expect(page.getByRole("heading", { name: "제12조 (개인정보 보호책임자)" })).toBeVisible();
  await expect(page).toHaveURL(/\/privacy$/);
  expect(errors).toEqual([]);
});
