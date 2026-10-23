import { test, expect, type Page } from "@playwright/test";
import { consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

// DEV-94 AC-01-20: 앱 안 회원 탈퇴. 카카오 계정은 공유 Mock에서만 흉내 낼 수 있어 공유 Mock을 초기화할 수 없으면 건너뛴다.
const mockUrl = process.env.FARMCLUB_MOCK_URL ?? "http://127.0.0.1:8083";
const CONSENT_VERSION = "2026-10-23";

test.beforeEach(async ({ request }) => {
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

async function withdrawInSheet(page: Page) {
  await expect(page.getByText("탈퇴하면 바로 지워져요")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("정말 탈퇴할까요?")).toBeVisible();
  await page.getByRole("button", { name: "탈퇴할게요" }).click();
}

test("DEV-94 AC-01-20: a Kakao consumer withdraws from 내 정보 and is signed out", async ({ page }) => {
  await page.goto(`${consumerUrl}/login`);
  await page.getByRole("button", { name: "카카오로 시작하기" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  const consents = ["TERMS", "PRIVACY", "AGE14"].map((kind) => ({ kind, version: CONSENT_VERSION }));
  expect(await mockApi(page, "consumer", "POST", "/api/auth/me/consents", { consents })).toBe(200);
  expect(
    await mockApi(page, "consumer", "PATCH", "/api/auth/me", { nickname: "귤러버", name: "박현", phone: "010-2345-6789" }),
  ).toBe(200);

  await page.goto(`${consumerUrl}/me`);
  await page.getByText("회원 탈퇴").click();
  await withdrawInSheet(page);
  await expect(page).toHaveURL(new RegExp(`^${consumerUrl}/?$`));
  await page.goto(`${consumerUrl}/me`);
  await expect(page.getByText("로그인이 필요해요")).toBeVisible();
  // 탈퇴한 토큰은 더 쓰지 않는다(로그아웃으로 지워짐)
  expect(await page.evaluate(() => localStorage.getItem("farmclub-consumer-shared-v1:token"))).toBeNull();
});

test("DEV-94 AC-01-20: test accounts see no 회원 탈퇴 entry", async ({ page }) => {
  // Mock은 카카오가 켜져 있으면 테스트 계정 목록을 숨긴다. 공유 Mock에서 토큰을 받아 넣는다
  await page.goto(consumerUrl);
  await page.evaluate(async (mockUrl) => {
    const res = await fetch(`${mockUrl}/api/auth/test-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u-minji", app: "consumer" }),
    });
    localStorage.setItem("farmclub-consumer-shared-v1:token", (await res.json()).accessToken);
  }, mockUrl);
  await page.goto(`${consumerUrl}/me`);
  await expect(page.getByText("로그아웃")).toBeVisible();
  await expect(page.getByText("회원 탈퇴")).toHaveCount(0);
});

test("DEV-94 AC-01-20: a producer waiting for approval can withdraw from the pending screen", async ({ page }) => {
  await skipHelpGuide(page);
  await page.goto(`${producerUrl}/login`);
  await page.getByRole("button", { name: "카카오로 시작하기" }).click();
  await expect(page).toHaveURL(/\/consent$/);
  const consents = ["TERMS", "PRIVACY"].map((kind) => ({ kind, version: CONSENT_VERSION }));
  expect(await mockApi(page, "producer", "POST", "/api/auth/me/consents", { consents })).toBe(200);
  expect(
    await mockApi(page, "producer", "POST", "/api/auth/producer-application", {
      ownerName: "김새농",
      farmName: "탈퇴 농장",
      region: "제주 서귀포시",
      mainItems: "감귤",
      phone: "010-9876-5432",
    }),
  ).toBe(200);
  await page.goto(`${producerUrl}/pending`);
  await page.getByRole("button", { name: "회원 탈퇴" }).click();
  await withdrawInSheet(page);
  await expect(page).toHaveURL(/\/login$/);
});
