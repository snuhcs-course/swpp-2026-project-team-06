import { expect, test, type APIRequestContext, type Page } from "./fixtures";

import { apiLogin, apiUrl, monitor, producerUrl } from "./helpers";

// 카카오 인가 화면은 테스트에서 열 수 없으므로 POST /api/auth/kakao만 가로채,
// 시드 생산자의 실제 토큰(test-login)으로 카카오 로그인이 성공한 것처럼 답한다. 그 뒤 /api/auth/me는 실서버가 답한다.
const STATE = "e2e-kakao-state";

async function fakeKakaoLogin(page: Page, request: APIRequestContext, userId: string) {
  const accessToken = await apiLogin(request, userId, "producer");
  const me = await request.get(`${apiUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(me.ok()).toBeTruthy();
  const user = await me.json();
  const cors = {
    "access-control-allow-origin": new URL(producerUrl).origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "POST, OPTIONS",
  };
  await page.route(`${apiUrl}/api/auth/kakao`, (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ status: 200, headers: cors, json: { accessToken, user } }),
  );
}

/** 카카오 버튼이 하는 일(state 저장) 뒤 카카오가 /auth/kakao?code&state로 돌려보낸 상황 */
async function returnFromKakao(page: Page) {
  await page.goto(`${producerUrl}/login`);
  await page.evaluate(
    (state) => sessionStorage.setItem("farmclub-producer:kakao-return", state),
    STATE,
  );
  await page.goto(`${producerUrl}/auth/kakao?code=e2e-code&state=${STATE}`);
}

const home = (path: string) =>
  new RegExp(`${producerUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${path === "/" ? "/?" : path}$`);

for (const [account, userId, path, heading] of [
  ["승인", "u-kang", "/", "주문·배송 현황"],
  ["확인 중", "u-misook", "/pending", "확인 중이에요"],
  ["농가 없음", "u-new", "/apply", "농가 등록 신청"],
] as const) {
  test(`AC-01-16: ${account} producer leaves /auth/kakao for ${path} and a reload does not show an error`, async ({
    page,
    request,
  }) => {
    const assertClean = monitor(page);
    await fakeKakaoLogin(page, request, userId);
    await returnFromKakao(page);
    await expect(page).toHaveURL(home(path));
    await expect(page.getByText(heading, { exact: false }).first()).toBeVisible();

    // 멈춘 화면에서 새로고침한 것처럼 같은 복귀 주소를 다시 연다(state는 이미 쓰였다)
    await page.goto(`${producerUrl}/auth/kakao?code=e2e-code&state=${STATE}`);
    await expect(page).toHaveURL(home(path));
    await expect(page.getByText("로그인 요청이 만료됐어요")).toHaveCount(0);
    await expect(page.getByText(heading, { exact: false }).first()).toBeVisible();
    assertClean();
  });
}

test("AC-01-16: an unused state without a session still explains the expired request", async ({ page }) => {
  const assertClean = monitor(page);
  await page.goto(`${producerUrl}/auth/kakao?code=e2e-code&state=other`);
  await expect(page.getByText("로그인 요청이 만료됐어요")).toBeVisible();
  await page.getByRole("button", { name: "다시 로그인" }).click();
  await expect(page).toHaveURL(/\/login$/);
  assertClean();
});
