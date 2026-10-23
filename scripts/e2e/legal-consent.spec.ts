import { test, expect, type Page } from "@playwright/test";
import { consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

// DEV-113 AC-01-17·18: 약관 버전이 바뀌면 기존 회원도, 새 회원도 동의해야 쓴다.
// 카카오 로그인은 Mock(공유 Mock 서버)에서만 흉내 낼 수 있어, 공유 Mock을 초기화할 수 없으면 건너뛴다.
const mockUrl = process.env.FARMCLUB_MOCK_URL ?? "http://127.0.0.1:8083";

test.beforeEach(async ({ request }) => {
  // 공유 Mock 초기화는 로그인한 요청만 받는다. 시드 테스트 계정으로 토큰을 받아 부른다
  const login = await request
    .post(`${mockUrl}/api/auth/test-login`, { data: { userId: "u-minji", app: "consumer" } })
    .catch(() => null);
  const token = login?.ok() ? (await login.json()).accessToken : null;
  const reset = token
    ? await request.post(`${mockUrl}/__mock/reset`, { headers: { Authorization: `Bearer ${token}` } })
    : null;
  test.skip(!reset?.ok(), "공유 Mock이 있어야 카카오 로그인을 흉내 낼 수 있다(npm run dev)");
});

async function mockApi(page: Page, app: "consumer" | "producer", method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ app, method, path, body, mockUrl }) => {
      const token = localStorage.getItem(`farmclub-${app}-shared-v1:token`);
      const res = await fetch(`${mockUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return res.status;
    },
    { app, method, path, body, mockUrl },
  );
}

test("DEV-113 AC-01-17: a consumer who agreed to old terms is asked again and blocked until agreeing", async ({ page }) => {
  await page.goto(`${consumerUrl}/login`);
  await page.getByRole("button", { name: "카카오로 시작하기" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // 예전 버전에 동의하고 프로필을 채운 기존 회원으로 만든다
  const old = ["TERMS", "PRIVACY", "AGE14"].map((kind) => ({ kind, version: "2026-10-18" }));
  expect(await mockApi(page, "consumer", "POST", "/api/auth/me/consents", { consents: old })).toBe(200);
  expect(
    await mockApi(page, "consumer", "PATCH", "/api/auth/me", { nickname: "귤러버", name: "박현", phone: "010-2345-6789" }),
  ).toBe(200);
  expect(await mockApi(page, "consumer", "PUT", "/api/farms/f-kang/follow")).toBe(403);

  // 앱을 열면 재동의 화면이 한 번 뜬다(프로필 칸·배송지 단계 없이)
  await page.goto(consumerUrl);
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: /약관이\s*바뀌었어요/ })).toBeVisible();
  await expect(page.getByLabel("닉네임")).toHaveCount(0);
  const submit = page.getByRole("button", { name: "동의하고 계속하기" });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
  await submit.click();
  await expect(page).not.toHaveURL(/\/onboarding/);
  expect(await mockApi(page, "consumer", "PUT", "/api/farms/f-kang/follow")).toBe(200);
});

test("DEV-113 AC-01-18: a new Kakao producer agrees to the terms before applying", async ({ page }) => {
  await skipHelpGuide(page);
  await page.goto(`${producerUrl}/login`);
  await page.getByRole("button", { name: "카카오로 시작하기" }).click();
  await expect(page).toHaveURL(/\/consent$/);
  await expect(page.getByRole("heading", { name: /약관에 동의하고\s*시작해요/ })).toBeVisible();

  // 동의 전에는 가입 신청 주소로 가도 동의 화면으로 돌아온다
  await page.goto(`${producerUrl}/apply`);
  await expect(page).toHaveURL(/\/consent$/);

  await page.getByRole("link", { name: "이용약관 전문 보기" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(page).toHaveURL(/\/consent$/);

  const submit = page.getByRole("button", { name: "동의하고 계속하기" });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
  await submit.click();
  await expect(page).toHaveURL(/\/apply$/);
  await expect(page.getByText("농가 등록 신청")).toBeVisible();
});
