import { test, expect, type Page } from "./fixtures";
import { consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

// DEV-198: 운영처럼 카카오가 켜져 있으면 로그인 화면은 카카오만 보인다.
// 평가용 주소(?evaluator=1)로 들어온 경우에만 테스트 계정 목록을 함께 보인다.
async function kakaoOn(page: Page) {
  await page.route("**/api/auth/kakao/config", (route) =>
    route.fulfill({ json: { enabled: true, clientId: "test-client", redirectPath: "/auth/kakao" } }),
  );
}

// DEV-200: 앱 평가용 빌드(EXPO_PUBLIC_EVALUATOR_LOGIN=1)로 띄운 경우에만 도는 케이스가 있고,
// 그때는 "표시 없으면 숨김"을 확인하는 DEV-198 케이스를 건너뛴다(빌드 전체가 평가 모드라서).
const evaluatorBuild = process.env.EXPO_PUBLIC_EVALUATOR_LOGIN === "1";

for (const app of ["consumer", "producer"] as const) {
  const base = app === "consumer" ? consumerUrl : producerUrl;
  const account = app === "consumer" ? "이서준" : "강영수";

  test(`AC_01_1 DEV-200 ${app} evaluator build shows test accounts on plain /login and signs in`, async ({ page }) => {
    test.skip(!evaluatorBuild, "EXPO_PUBLIC_EVALUATOR_LOGIN=1로 띄운 앱에서만");
    await kakaoOn(page);
    if (app === "producer") await skipHelpGuide(page);
    await page.goto(`${base}/login`);
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    const radio = page.getByRole("radio").filter({ hasText: account });
    await expect(radio).toBeVisible();
    await expect(page.getByText(/^Mock:/)).toHaveCount(0);
    await radio.click();
    await page.getByRole("button", { name: app === "consumer" ? /로그인$/ : /^(?!카카오).*시작하기$/ }).click();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test(`AC_01_1 DEV-198 ${app} login hides test accounts when Kakao is on`, async ({ page }) => {
    test.skip(evaluatorBuild, "평가용 빌드는 항상 목록을 보인다(DEV-200)");
    await kakaoOn(page);
    await page.goto(`${base}/login`);
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
  });

  test(`AC_01_1 DEV-198 ${app} evaluator link shows test accounts beside Kakao and signs in`, async ({ page }) => {
    test.skip(evaluatorBuild, "평가용 빌드에서는 DEV-200 케이스가 대신한다");
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

// DEV-283: 평가가 끝나 테스트 로그인이 꺼진 운영에서, 기기에 남은 평가 표시(farmclub:evaluator)로
// 평가 화면('지금은 로그인할 수 없어요')이 뜨지 않게 표시를 지우고 카카오만 보인다.
const EVALUATOR_KEY = "farmclub:evaluator";
async function markEvaluator(page: Page, base: string) {
  await page.goto(`${base}/privacy`);
  await page.evaluate((key) => localStorage.setItem(key, "1"), EVALUATOR_KEY);
}
const storedMark = (page: Page) => page.evaluate((key) => localStorage.getItem(key), EVALUATOR_KEY);

for (const app of ["consumer", "producer"] as const) {
  const base = app === "consumer" ? consumerUrl : producerUrl;
  const testAccounts = (page: Page, reply: "off" | "empty") =>
    page.route("**/api/auth/test-accounts*", (route) =>
      reply === "off"
        ? route.fulfill({ status: 404, json: { code: "NOT_FOUND", message: "Mock login is off", details: null } })
        : route.fulfill({ json: [] }),
    );

  test(`AC_01_1 DEV-283 ${app} stale evaluator mark is cleared when test login is off`, async ({ page }) => {
    test.skip(evaluatorBuild, "평가용 빌드는 표시를 쓰지 않는다(DEV-200)");
    await kakaoOn(page);
    await testAccounts(page, "off");
    await markEvaluator(page, base);
    await page.goto(`${base}/login`);
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    await expect(page.getByText("지금은 로그인할 수 없어요")).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByTestId("login-bottom-bar")).toHaveCount(0);
    await expect.poll(() => storedMark(page)).toBeNull();
  });

  test(`AC_01_1 DEV-283 ${app} stale evaluator mark is cleared when there are no test accounts`, async ({ page }) => {
    test.skip(evaluatorBuild, "평가용 빌드는 표시를 쓰지 않는다(DEV-200)");
    await kakaoOn(page);
    await testAccounts(page, "empty");
    await markEvaluator(page, base);
    await page.goto(`${base}/login`);
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect.poll(() => storedMark(page)).toBeNull();
  });

  test(`AC_01_1 DEV-283 ${app} evaluator link with test login off shows Kakao only and keeps no mark`, async ({ page }) => {
    test.skip(evaluatorBuild, "평가용 빌드는 표시를 쓰지 않는다(DEV-200)");
    await kakaoOn(page);
    await testAccounts(page, "off");
    await page.goto(`${base}/login?evaluator=1`);
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    await expect(page.getByText("지금은 로그인할 수 없어요")).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    expect(await storedMark(page)).toBeNull();
  });
}

test("AC_01_1 DEV-283 producer evaluator list has the same labels as the consumer list", async ({ page }) => {
  test.skip(evaluatorBuild, "평가용 빌드에서는 DEV-200 케이스가 대신한다");
  await kakaoOn(page);
  await skipHelpGuide(page);
  await page.goto(`${producerUrl}/login?evaluator=1`);
  const kakao = page.getByRole("button", { name: "카카오로 시작하기" });
  await expect(kakao).toBeVisible();
  await expect(page.getByText("생산자 테스트 계정을 골라 주세요")).toBeVisible();
  await expect(page.getByText("소비자는 소비자 앱에서 따로 로그인해요.")).toBeAttached();
  await expect(page.getByText("처음이세요? 농가로 가입 신청 ›")).toBeAttached();
  // 카카오 버튼은 목록보다 위 본문에, '○○으로 시작하기'는 하단 고정 바에 있다
  const bar = page.getByTestId("login-bottom-bar");
  await expect(bar.getByRole("button", { name: /시작하기$/ })).toBeVisible();
  await expect(bar.getByRole("button", { name: "카카오로 시작하기" })).toHaveCount(0);
});
