import { expect, test } from "@playwright/test";

import { consumerUrl, loginProducer, monitor, producerUrl } from "./helpers";

test("AC-06/07/15: anonymous discovery, public news, and login return", async ({ page }) => {
  const assertClean = monitor(page);
  await page.goto(consumerUrl);
  await expect(page.getByText("지금 예약하면 이득")).toBeVisible();

  await page.getByRole("link").filter({ hasText: "강씨네 귤밭" }).last().click();
  await expect(page.getByRole("heading", { name: "강씨네 귤밭", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "소식방 입장" }).click();
  await expect(page).toHaveURL(/\/news\/f-kang/);
  await expect(page.getByRole("button", { name: /소식방.*농가 보기/ }).first()).toBeVisible();

  await page.goto(`${consumerUrl}/products/p-house`);
  await page.getByRole("button", { name: "예약하기" }).click();
  await page.getByRole("button", { name: "주문서로" }).click();
  await expect(page.getByText("로그인하고 예약해요")).toBeVisible();
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("button", { name: "김민지로 로그인" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house/);
  assertClean();
});

test("AC-01-3: producer account gates use separate sessions", async ({ browser }) => {
  const gates = [
    ["오미숙", /\/pending$/, "확인 중이에요"],
    ["박순자", /\/pending$/, "신청이 반려됐어요"],
    ["최태호", /\/suspended$/, "계정이 정지됐어요"],
    ["신규 생산자", /\/apply$/, "농가 등록 신청"],
  ] as const;
  for (const [account, url, heading] of gates) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const assertClean = monitor(page);
    await loginProducer(page, account);
    await expect(page).toHaveURL(url);
    await expect(page.getByText(heading, { exact: false }).first()).toBeVisible();
    assertClean();
    await context.close();
  }

  const approved = await browser.newContext();
  const approvedPage = await approved.newPage();
  const assertApprovedClean = monitor(approvedPage);
  await loginProducer(approvedPage, "강영수");
  await expect(approvedPage).toHaveURL(new RegExp(`${producerUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?$`));
  await expect(approvedPage.getByText("출하할 주문")).toBeVisible();
  assertApprovedClean();
  await approved.close();
});

test("N-02: core discovery remains usable at supported widths", async ({ page }) => {
  const assertClean = monitor(page);
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(consumerUrl);
    await expect(page.getByText("지금 예약하면 이득")).toBeVisible();
    await expect(page.getByRole("button", { name: "농가·상품 검색" })).toBeVisible();
  }
  assertClean();
});
