// DEV-481: 로그인한 채 앱(웹은 새로고침·주소 열기)을 다시 열면 저장된 토큰으로 `GET /api/auth/me`를 다시 읽는다.
// 그 답이 오기 전에 누른 동작(옵션 시트 열기, 탭 안 화면으로 이동)이 답이 온 뒤에도 남아야 한다.
// 전에는 탭 레이아웃이 `key={user?.userId ?? "guest"}`라 답이 오는 순간 탭 아래 화면을 통째로 다시 만들어
// 연 시트가 사라지고, 이동한 화면 대신 홈에 떨어졌다. 답을 일부러 늦춰(page.route) 그 틈을 넓혀 잰다.
// 앱 Mock(npm run dev, 공유 Mock)과 실서버 모두에서 돈다(가로채기는 주소 끝만 본다).
import { expect, test, type Page } from "@playwright/test";

import { consumerUrl } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

/** 심사자가 앱을 열자마자 누르는 틈보다 넉넉히(실기기 첫 실행에서 auth/me는 1초 안팎) */
const HOLD_MS = 2500;

async function consumerLogin(page: Page, name = "김민지") {
  await page.goto(`${consumerUrl}/login`);
  await page.getByRole("radio").filter({ hasText: name }).click();
  await page.getByRole("button", { name: `${name}로 로그인` }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** 다음 `GET /api/auth/me` 하나를 HOLD_MS 늦춘다. pending()은 아직 답을 안 보냈는지, answered는 답을 보내고
 * 앱이 받은 뒤 풀린다 */
async function holdNextMe(page: Page) {
  const url = /\/api\/auth\/me(\?|$)/;
  let held = false;
  let pending = true;
  let release!: (response: Promise<import("@playwright/test").Response>) => void;
  const released = new Promise<Promise<import("@playwright/test").Response>>((r) => (release = r));
  await page.route(url, async (route) => {
    if (held || route.request().method() !== "GET") return route.fallback();
    held = true;
    await new Promise((r) => setTimeout(r, HOLD_MS));
    pending = false;
    // 늦춘 바로 그 요청의 응답. 보내기 전에 기다리기 시작해 놓치지 않는다(못 받으면 실패)
    const request = route.request();
    const response = page.waitForResponse((r) => r.request() === request);
    await route.fallback();
    release(response);
  });
  const answered = (async () => {
    const response = await (await released);
    await response.finished();
  })();
  return { pending: () => pending, answered };
}

/** auth/me 답을 받은 뒤 다시 그려질 틈을 준다. 신호: 사용자가 있을 때만 부르는 이 상품의 내 예약 조회 응답 */
const mineFor = (page: Page, productId: string) =>
  page.waitForResponse(
    (r) => /\/api\/orders(\?|$)/.test(new URL(r.url()).pathname + "?") && r.url().includes(`productId=${productId}`),
  );

test("DEV_481 consumer: 예약하기 tapped before auth/me answers keeps the option sheet open", async ({ page }) => {
  await consumerLogin(page);
  const me = await holdNextMe(page);
  const mine = mineFor(page, "p-house");
  await page.goto(`${consumerUrl}/products/p-house`);

  const reserve = page.getByRole("button", { name: "예약하기" });
  await expect(reserve).toBeEnabled();
  expect(me.pending(), "auth/me must still be on hold when we tap").toBe(true);
  await reserve.click();
  const toCheckout = page.getByRole("button", { name: "주문서로" });
  await expect(toCheckout).toBeVisible();

  // 답이 오고, 로그인한 사용자 기준 조회까지 끝난 뒤에도 시트가 그대로
  await me.answered;
  await mine;
  await expect(toCheckout).toBeVisible();
  await toCheckout.click();
  await expect(page).toHaveURL(/\/checkout\/p-house/);
});

test("DEV_481 consumer: moving into a tab screen before auth/me answers stays there (not dropped to home)", async ({ page }) => {
  await consumerLogin(page);
  // 탭 밖 화면(주문서)까지 평소대로 간다
  await page.goto(`${consumerUrl}/products/p-house`);
  await page.getByRole("button", { name: "예약하기" }).click();
  await page.getByRole("button", { name: "주문서로" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house/);
  await expect(page.getByRole("heading", { name: "주문서", exact: true })).toBeVisible();

  // 주문서를 새로고침하고, auth/me 답이 오기 전에 머리의 ‘뒤로’를 누른다. 새로 뜬 앱이라 앱 안 이전 화면이 없어
  // 상품 화면(탭 안, /products/p-house)으로 바꿔 연다(goBackOr)
  const me = await holdNextMe(page);
  const mine = mineFor(page, "p-house");
  await page.reload();
  const back = page.getByRole("button", { name: "뒤로", exact: true });
  await expect(back).toBeVisible();
  expect(me.pending(), "auth/me must still be on hold when we move").toBe(true);
  await back.click();
  await expect(page).toHaveURL(/\/products\/p-house/);

  // 답이 오고 로그인한 사용자 기준 조회까지 끝난 뒤에도 상품 화면 그대로(홈 `/`으로 떨어지지 않음)
  // (고치기 전에는 답이 오는 순간 홈으로 떨어져 이 조회가 오지 않았다: 둘 중 먼저 온 것을 기다린 뒤 주소를 본다)
  await me.answered;
  await Promise.race([mine, page.waitForURL((u) => u.pathname === "/")]);
  await expect(page).toHaveURL(/\/products\/p-house$/);
  await expect(page.getByRole("button", { name: "예약하기" })).toBeVisible();
});
