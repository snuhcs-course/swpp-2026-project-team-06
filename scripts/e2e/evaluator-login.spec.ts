import { test, expect, type Page } from "./fixtures";
import { consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

// DEV-198: 운영처럼 카카오가 켜져 있으면 로그인 화면은 카카오만 보인다.
// 평가용 주소(?evaluator=1)로 들어온 경우에만 테스트 계정 목록을 함께 보인다.
async function kakaoOn(page: Page) {
  await page.route("**/api/auth/kakao/config", (route) =>
    route.fulfill({ json: { enabled: true, clientId: "test-client", redirectPath: "/auth/kakao" } }),
  );
}

for (const app of ["consumer", "producer"] as const) {
  const base = app === "consumer" ? consumerUrl : producerUrl;
  const account = app === "consumer" ? "이서준" : "강영수";

  test(`AC_01_1 DEV-198 ${app} login hides test accounts when Kakao is on`, async ({ page }) => {
    await kakaoOn(page);
    await page.goto(`${base}/login`);
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
  });

  test(`AC_01_1 DEV-198 ${app} evaluator link shows test accounts beside Kakao and signs in`, async ({ page }) => {
    await kakaoOn(page);
    if (app === "producer") await skipHelpGuide(page);
    await page.goto(`${base}/login?evaluator=1`);
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    const radio = page.getByRole("radio").filter({ hasText: account });
    await expect(radio).toBeVisible();
    // 운영 평가 화면에 Mock 안내 문구가 나오면 안 된다
    await expect(page.getByText(/^Mock:/)).toHaveCount(0);
    // 같은 탭에서 표시 없이 /login으로 다시 와도(로그아웃·관문) 목록이 남는다
    await page.goto(`${base}/login`);
    await expect(radio).toBeVisible();
    await radio.click();
    await expect(radio).toBeChecked();
    await page.getByRole("button", { name: app === "consumer" ? /로그인$/ : /^(?!카카오).*시작하기$/ }).click();
    await expect(page).not.toHaveURL(/\/login/);
  });
}
