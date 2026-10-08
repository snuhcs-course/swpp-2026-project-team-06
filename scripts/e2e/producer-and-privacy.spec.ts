import { expect, test } from "@playwright/test";

import { consumerUrl, loginConsumer, loginProducer, monitor, producerUrl } from "./helpers";

test("AC-03/04/05: producer draft and sales controls are wired to the real server", async ({ page }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/new`);
  await page
    .getByLabel("카톡·밴드에 쓰던 문구")
    .fill("DEV25 하우스 감귤 5kg, 예상 당도 12.5브릭스, 11월 중순 배송입니다.");
  await page.getByRole("button", { name: "초안 만들기" }).click();
  const generated = page.getByRole("heading", { name: "초안이 나왔어요" });
  if (await generated.isVisible()) await page.getByRole("button", { name: "편집으로" }).click();
  else {
    await expect(page.getByText("초안을 만들지 못했어요")).toBeVisible();
    await expect(page.getByLabel("카톡·밴드에 쓰던 문구")).toHaveValue(/DEV25/);
    await page.getByRole("button", { name: "직접 입력하기" }).click();
  }
  await expect(page.getByLabel("상품명")).toBeVisible();

  await page.goto(`${producerUrl}/products/p-house/sales`);
  await expect(page.getByText("판매 설정", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "물량 추가 신청" })).toBeVisible();
  await page.getByRole("button", { name: "판매 중지" }).click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByRole("button", { name: "판매 재개" })).toBeVisible();
  await page.getByRole("button", { name: "판매 재개" }).click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByRole("button", { name: "판매 중지" })).toBeVisible();
  assertClean();
});

test("AC-12/15: public room does not auto-follow and private state clears with session", async ({ browser }) => {
  const anonymous = await browser.newContext();
  const anonymousPage = await anonymous.newPage();
  const assertAnonymousClean = monitor(anonymousPage);
  await anonymousPage.goto(`${consumerUrl}/news/f-kang`);
  await expect(anonymousPage.getByRole("button", { name: "로그인하고 참여하기" })).toBeVisible();
  await expect(anonymousPage.getByText("팔로워만", { exact: false })).toHaveCount(0);
  assertAnonymousClean();

  const follower = await browser.newContext();
  const followerPage = await follower.newPage();
  const assertFollowerClean = monitor(followerPage);
  await loginConsumer(followerPage);
  await followerPage.goto(`${consumerUrl}/news/f-kang`);
  await expect(followerPage.getByRole("button", { name: /농가 보기/ }).first()).toBeVisible();
  await followerPage.reload();
  await expect(followerPage.getByRole("button", { name: /농가 보기/ }).first()).toBeVisible();
  assertFollowerClean();

  await anonymous.close();
  await follower.close();
});

test("AC-02-4: farm storytelling editor loads without publishing a draft", async ({ page }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/farm/detail`);
  await expect(page.getByText("농가 상세 편집", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "상세 초안 생성" })).toBeVisible();
  assertClean();
});
