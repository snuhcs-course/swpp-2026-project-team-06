import { test, expect } from "@playwright/test";
import { consumerUrl, loginConsumer, producerUrl } from "./helpers";

// DEV-136: 앱 Mock 모드(npm run dev)에서는 두 앱 모두 카카오 버튼과 시드 테스트 계정 목록을 함께 보인다(SCR-05·SCR-19).
// Mock 카카오는 항상 켜져 있어, 이 규칙이 없으면 소비자 앱에서 시드 계정을 고를 수 없다. 공유 Mock이 없으면 건너뛴다.
const mockUrl = process.env.FARMCLUB_MOCK_URL ?? "http://127.0.0.1:8083";

test.beforeEach(async ({ request }) => {
  const config = await request.get(`${mockUrl}/api/auth/kakao/config`).catch(() => null);
  test.skip(!config?.ok(), "공유 Mock이 있어야 한다(npm run dev)");
});

test("AC_01_1 DEV-136 consumer Mock login shows Kakao and seeded accounts, and a seeded account signs in", async ({ page }) => {
  await page.goto(`${consumerUrl}/login`);
  await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
  await expect(page.getByText("Mock: 카카오로 시작하면 처음 가입하는 새 소비자로 들어가요")).toBeVisible();
  await expect(page.getByRole("radio").filter({ hasText: "김민지" })).toBeVisible();
  await expect(page.getByRole("radio").filter({ hasText: "이서준" })).toBeVisible();
  // DEV-141: 고른 계정이 aria-checked로 나온다
  await page.getByRole("radio").filter({ hasText: "이서준" }).click();
  await expect(page.getByRole("radio").filter({ hasText: "이서준" })).toBeChecked();
  await expect(page.getByRole("radio").filter({ hasText: "김민지" })).not.toBeChecked();
  await loginConsumer(page, "이서준");
});

test("AC_01_1 DEV-136 producer Mock login keeps Kakao and seeded accounts together", async ({ page }) => {
  await page.goto(`${producerUrl}/login`);
  await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
  await expect(page.getByRole("radio").filter({ hasText: "강영수" })).toBeVisible();
  await expect(page.getByRole("radio").filter({ hasText: "신규 생산자" })).toBeVisible();
});
