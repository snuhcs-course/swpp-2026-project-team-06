// DEV-222 (screens.md SCR-17 로그아웃 → SCR-01, FEAT-01 AC-01-12, 결정 25): 주문을 넣은 뒤 로그아웃하면 홈으로 가고,
// 다시 로그인해도 지난 주문서가 열리지 않는다. 관문 예약 → 로그인 → 주문서 흐름은 그대로.
// 실서버(FastAPI + 소비자 앱) 대상. 시드 p-house(FIXED_NOW 2026-10-07).
import { expect, test } from "./fixtures";
import type { Page } from "./fixtures";

import { consumerUrl, loginConsumer, monitor } from "./helpers";

async function tab(page: Page, label: string) {
  await page.getByText(label, { exact: true }).last().click();
}

/** 상품 → 예약하기 → 주문서로(로그인돼 있으면 주문서가 열린다) */
async function openCheckoutFromProduct(page: Page) {
  await page.goto(`${consumerUrl}/products/p-house`);
  await page.getByRole("button", { name: "예약하기" }).click();
  await page.getByRole("button", { name: "주문서로" }).click();
}

/** 상품에서 주문서를 열고 받는 곳·동의를 채운다 */
async function fillCheckout(page: Page) {
  await openCheckoutFromProduct(page);
  await expect(page).toHaveURL(/\/checkout\/p-house/);
  const add = page.getByRole("button", { name: "받는 사람과 주소 입력" });
  const other = page.getByRole("button", { name: "다른 배송지" });
  await expect(add.or(other)).toBeVisible();
  if (await add.isVisible()) {
    await add.click();
    await page.getByLabel("받는 사람").fill("DEV222 구매자");
    await page.getByLabel("연락처").fill("010-1234-5678");
    await page.getByLabel("우편번호").fill("04001");
    await page.getByRole("textbox", { name: "주소", exact: true }).fill("서울 마포구 월드컵북로 12");
    await page.getByLabel("상세 주소").fill("302호");
    await page.getByRole("button", { name: "이 주소로 받기" }).click();
  }
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
}

/** 주문서를 채워 예약하고 입금 안내에서 '입금을 마쳤어요' → 완료 화면 */
async function placeOrder(page: Page) {
  await fillCheckout(page);
  await page.getByRole("button", { name: "예약하기" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house\/pay/);
  await page.getByRole("button", { name: "입금을 마쳤어요" }).click();
  await expect(page).toHaveURL(/\/orders\/[^/]+\/done/);
}

test("SCR-17: order → logout → home, and logging in again does not reopen the old checkout", async ({ page }) => {
  const assertClean = monitor(page);
  await loginConsumer(page);
  await placeOrder(page);
  await page.getByRole("button", { name: "홈으로" }).click();
  await expect(page).toHaveURL(`${consumerUrl}/`);

  await tab(page, "내 정보");
  await page.getByText("로그아웃", { exact: true }).click();
  await expect(page).toHaveURL(`${consumerUrl}/`);
  // 스택에 남은 화면이 늦게 로그인으로 바꾸지 않는다(예전엔 /login?next=/checkout/...)
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(`${consumerUrl}/`);
  await expect(page.getByText("오늘, 농가에서")).toBeVisible();

  await tab(page, "내 정보");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fme/);
  await page.getByRole("radio").filter({ hasText: "이서준" }).click();
  await page.getByRole("button", { name: /^이서준.*로그인$/ }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page).not.toHaveURL(/checkout/);
  assertClean();
});

test("SCR-17: logout from the done screen's order list also lands on home", async ({ page }) => {
  const assertClean = monitor(page);
  await loginConsumer(page);
  await placeOrder(page);
  await page.getByRole("button", { name: "주문 내역" }).click();
  await expect(page).toHaveURL(/\/orders/);
  await tab(page, "내 정보");
  await page.getByText("로그아웃", { exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(`${consumerUrl}/`);
  assertClean();
});

test("AC-01-12: reserve gate → login → checkout with the chosen option", async ({ page }) => {
  const assertClean = monitor(page);
  await openCheckoutFromProduct(page);
  await expect(page.getByText("로그인하고 예약해요")).toBeVisible();
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("button", { name: "김민지로 로그인" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house\?optionId=opt-\w+&quantity=1/);
  await expect(page.getByText("주문서").first()).toBeVisible();
  assertClean();
});

test("SCR-12: back from the done screen does not reopen the finished checkout", async ({ page }) => {
  const assertClean = monitor(page);
  await loginConsumer(page);
  await placeOrder(page);
  await page.goBack();
  await page.waitForTimeout(1000);
  await expect(page).not.toHaveURL(/\/checkout\//);
  assertClean();
});

test("screens.md 7.1: a 401 on the checkout opens one login with the signed-out notice", async ({ page }) => {
  // 만료된 토큰으로 보낸 주문은 401(클라이언트가 토큰을 지움)
  const assertClean = monitor(page, [/status of 401/]);
  await loginConsumer(page);
  await fillCheckout(page);
  await page.evaluate(() => localStorage.setItem("farmclub-consumer:token", "expired"));
  await page.getByRole("button", { name: "예약하기" }).click();
  await expect(page).toHaveURL(/\/login\?.*reason=signedout/);
  await expect(page.getByText("로그인이 풀렸어요")).toBeVisible();
  // 남은 주문서가 뒤늦게 이 화면을 안내 없는 로그인으로 바꾸지 않는다
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/login\?.*reason=signedout/);
  await expect(page.getByText("로그인이 풀렸어요")).toBeVisible();
  await page.getByRole("radio").filter({ hasText: "김민지" }).click();
  await page.getByRole("button", { name: "김민지로 로그인" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house/);
  assertClean();
});
