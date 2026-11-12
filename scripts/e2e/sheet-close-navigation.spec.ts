// DEV-225 (HE-28·HE-X6, screens.md 3장 시트): 시트 안 버튼으로 다른 화면으로 가면 새 화면 위에 시트가 남지 않는다.
// 사전 점검(C3)처럼 창이 가려져 애니메이션이 멈춘 환경을 CDP로 만든다(Animation.setPlaybackRate 0).
// 고치기 전에는 닫힘 애니메이션이 끝나지 않아 시트가 새 화면 위에 계속 남았다.
import { expect, test, type Page } from "./fixtures";

import { consumerUrl, loginConsumer, loginProducer, monitor, producerUrl } from "./helpers";

/** 열린 시트의 여는 애니메이션이 끝날 때까지 기다린 뒤 페이지의 애니메이션을 멈춘다 */
async function freezeAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running"),
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
  return async () => {
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
    await cdp.detach();
  };
}

test("DEV-225 FEAT-08: option sheet and address sheet are gone once checkout and address entry appear", async ({
  page,
}) => {
  const assertClean = monitor(page);
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/products/p-house`);
  await page.getByRole("button", { name: "예약하기" }).click();
  const optionSheet = page.getByText("옵션과 수량", { exact: true });
  await expect(optionSheet).toBeVisible();
  let resume = await freezeAnimations(page);
  await page.getByRole("button", { name: "주문서로" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house/);
  await expect(page.getByRole("button", { name: "받는 곳 변경" })).toBeVisible();
  await expect(optionSheet).toHaveCount(0);
  await resume();

  // 주문서 받는 곳 시트 → ‘새 주소 입력’ → 배송지 입력
  await page.getByRole("button", { name: "받는 곳 변경" }).click();
  const addressSheet = page.getByRole("button", { name: "새 주소 입력" });
  await expect(addressSheet).toBeVisible();
  resume = await freezeAnimations(page);
  await addressSheet.click();
  await expect(page.getByLabel("우편번호", { exact: true })).toBeVisible();
  await expect(addressSheet).toHaveCount(0);
  await resume();
  assertClean();
});

test("DEV-225 decision 25: gate sheet is gone on login and option sheet is gone on checkout", async ({
  page,
}) => {
  const assertClean = monitor(page);
  await page.goto(`${consumerUrl}/products/p-house`);
  await page.getByRole("button", { name: "예약하기" }).click();
  await page.getByRole("button", { name: "주문서로" }).click();
  await expect(page.getByText("로그인하고 예약해요")).toBeVisible();
  // 닫히는 동안 제목은 비므로 본문으로 시트를 찾는다
  const gate = page.getByText("팔로우·예약·채팅은 로그인이 필요해요", { exact: false });
  await expect(gate).toBeVisible();
  const resume = await freezeAnimations(page);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "김민지로 로그인" })).toBeVisible();
  await expect(gate).toHaveCount(0);
  await expect(page.getByText("옵션과 수량", { exact: true })).toHaveCount(0);
  await resume();
  await page.getByRole("button", { name: "김민지로 로그인" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house/);
  await expect(page.getByText("옵션과 수량", { exact: true })).toHaveCount(0);
  assertClean();
});

// 웹에서는 나가기가 편집 화면을 스택에서 빼 시트도 함께 사라지므로 고치기 전에도 통과한다. 도우미로 바꾼 나가기 흐름이 그대로 동작하는지 본다
test("DEV-225 SCR-25: leave-without-saving sheet is gone once the product list appears", async ({
  page,
}) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/edit`);
  await page.getByLabel("보관", { exact: true }).fill("서늘한 곳에 두세요 (DEV-225)");
  await page.getByRole("button", { name: "뒤로" }).first().click();
  const leave = page.getByText("저장하지 않고", { exact: false });
  await expect(leave).toBeVisible();
  const resume = await freezeAnimations(page);
  await page.getByRole("button", { name: "나가기", exact: true }).click();
  await expect(page).toHaveURL(/\/products\/?$/);
  await expect(leave).toHaveCount(0);
  await resume();
  assertClean();
});
