// DEV-225 (HE-28·HE-X6, screens.md 3장 시트): 시트 안 버튼으로 다른 화면으로 가면 새 화면 위에 시트가 남지 않는다.
// 사전 점검(C3)처럼 창이 가려져 애니메이션이 멈춘 환경을 CDP로 만든다(Animation.setPlaybackRate 0).
// 고치기 전에는 닫힘 애니메이션이 끝나지 않아 시트가 새 화면 위에 계속 남았다.
import { expect, test, type Page } from "./fixtures";

import { apiUrl, consumerUrl, loginConsumer, loginProducer, monitor, producerUrl } from "./helpers";

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
  // 닫히는 동안 제목은 비므로 본문으로 시트를 찾는다. 예약 관문 본문은 DEV-356(UX ⑤)에서 예약용 한 문장으로 바뀌었다
  const gate = page.getByText("로그인하면 고른 옵션 그대로 주문서로 가요.", { exact: false });
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

// DEV-361 PR C: 상품 편집(SCR-25)의 '저장하지 않고 나가기' 시트는 상품 수정(composer)과 함께 없어졌다.
// 구매자에게 보이는 상품은 나가기 확인(PM 11/18)에서 '임시 저장하고 나가기'를 고르면 상품 초안에 저장하고 나간다. 나간 뒤 시트·덮개가 남지 않는지 본다
test("DEV-225 DEV-361: leaving 상품 수정 with edits asks, saves privately and nothing stays over the product list", async ({
  page,
  request,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true", "Requires explicitly enabled local source API");
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/edit`);
  await expect(page).toHaveURL(/composer=1/);
  await page.getByText("상품정보", { exact: true }).click();
  await page.getByTestId("product-basic-info").getByLabel("보관", { exact: true }).fill("서늘한 곳에 두세요 (DEV-225)");
  await page.getByRole("button", { name: "뒤로" }).first().click();
  // PM 11/18: 반영 안 한 수정이 있으면 나가기 전에 묻는다
  await page.getByTestId("leave-confirm").getByRole("button", { name: "임시 저장하고 나가기", exact: true }).click();
  await expect(page.getByText("임시 저장됐어요", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/products\/?$/);
  await expect(page.getByTestId("apply-confirm")).toHaveCount(0);
  await expect(page.getByTestId("leave-confirm")).toHaveCount(0);
  // 다른 spec이 보는 시드 상품에 비공개 초안을 남기지 않는다
  const token = (await (await request.post(`${apiUrl}/api/auth/test-login`, { data: { userId: "u-kang", app: "producer" } })).json()).accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  const view = await (await request.get(`${apiUrl}/api/source-analysis/product-workspaces/p-house/product-draft`, { headers })).json();
  expect(view.draft?.fields?.info?.storage).toBe("서늘한 곳에 두세요 (DEV-225)");
  await request.delete(`${apiUrl}/api/source-analysis/product-workspaces/p-house/product-draft?version=${view.version}`, { headers });
  assertClean();
});
