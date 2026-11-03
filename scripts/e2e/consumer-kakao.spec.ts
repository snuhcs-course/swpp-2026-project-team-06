import { expect, test, type APIRequestContext, type Page } from "./fixtures";

import { apiLogin, apiUrl, consumerUrl, monitor } from "./helpers";

// 카카오 인가 화면은 테스트에서 열 수 없으므로 POST /api/auth/kakao만 가로채,
// 시드 소비자의 실제 토큰(test-login)으로 카카오 로그인이 성공한 것처럼 답한다. 그 뒤 /api/auth/me는 실서버가 답한다(DEV-112).
const STATE = "e2e-kakao-state";
const RETURN_KEY = "farmclub-consumer:kakao-return";

async function fakeKakaoLogin(page: Page, request: APIRequestContext, userId: string) {
  const accessToken = await apiLogin(request, userId, "consumer");
  const me = await request.get(`${apiUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(me.ok()).toBeTruthy();
  const user = await me.json();
  const cors = {
    "access-control-allow-origin": new URL(consumerUrl).origin,
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

const atHome = new RegExp(`${consumerUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?$`);

test("AC-01-13: Kakao return goes back to the saved screen and a reload does not show an error", async ({
  page,
  request,
}) => {
  const assertClean = monitor(page);
  await fakeKakaoLogin(page, request, "u-minji");
  // 카카오 버튼이 하는 일(돌아갈 화면·state 저장) 뒤 카카오가 /auth/kakao?code&state로 돌려보낸 상황
  await page.goto(`${consumerUrl}/login`);
  await page.evaluate(
    ([key, state]) =>
      sessionStorage.setItem(key, JSON.stringify({ nonce: state, next: "/", resume: null })),
    [RETURN_KEY, STATE],
  );
  await page.goto(`${consumerUrl}/auth/kakao?code=e2e-code&state=${STATE}`);
  await expect(page).toHaveURL(atHome);
  await expect(page.getByText("오늘, 농가에서")).toBeVisible();

  // 복귀 화면에서 새로고침한 것처럼 같은 주소를 다시 연다(state는 이미 쓰였다)
  await page.goto(`${consumerUrl}/auth/kakao?code=e2e-code&state=${STATE}`);
  await expect(page).toHaveURL(atHome);
  await expect(page.getByText("로그인 요청이 만료됐어요")).toHaveCount(0);
  await expect(page.getByText("오늘, 농가에서")).toBeVisible();
  assertClean();
});

test("AC-01-13: an unused state without a session still explains the expired request", async ({ page }) => {
  const assertClean = monitor(page);
  await page.goto(`${consumerUrl}/auth/kakao?code=e2e-code&state=other`);
  await expect(page.getByText("로그인 요청이 만료됐어요")).toBeVisible();
  await page.getByRole("button", { name: "다시 로그인" }).click();
  await expect(page).toHaveURL(/\/login/);
  assertClean();
});
