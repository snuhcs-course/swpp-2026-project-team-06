import { expect, test, type Page } from "./fixtures";

import { apiUrl, consumerUrl, loginConsumer, loginProducer, monitor, producerUrl } from "./helpers";

// DEV-316 (PM 11/12): 내 정보·설정 첫 화면에는 실명·휴대폰·이메일·주소·계좌번호를 두지 않는다.
// 하위 화면(내 정보 고치기·배송지 관리·입금 계좌)에서는 지금처럼 보이고 고칠 수 있다.
// 실서버 시드 김민지는 테스트 계정이라, 카카오 계정 화면은 GET /api/auth/me 응답에만 카카오 값(닉네임·휴대폰·이메일)을 얹어 본다.
const SEED = {
  name: "김민지",
  phone: "010-2345-6789", // 시드 기본 배송지 받는 사람 번호와 같음
  address: "서울 마포구 월드컵북로 12",
};
const EMAIL = "minji@example.com";

async function asKakaoUser(page: Page, nickname: string | null) {
  // 서버 규칙(needs_onboarding): 닉네임이 없는 카카오 소비자는 가입 전이다
  const needsOnboarding = !nickname;
  await page.route(`${apiUrl}/api/auth/me`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const user = await response.json();
    await route.fulfill({
      response,
      json: { ...user, isTestAccount: false, needsOnboarding, nickname, phone: SEED.phone, email: EMAIL },
    });
  });
}

async function expectNoPersonalData(page: Page) {
  const text = await page.locator("body").innerText();
  for (const value of [SEED.name, SEED.phone, SEED.address, EMAIL])
    expect(text, `첫 화면에 ${value}가 보인다`).not.toContain(value);
}

test("DEV-316 AC-08-5: 내 정보 first screen shows the nickname and address count, not name, phone, email or address", async ({
  page,
}) => {
  const assertClean = monitor(page);
  await loginConsumer(page, SEED.name);
  await asKakaoUser(page, "귤러버");
  await page.goto(`${consumerUrl}/me`);
  await expect(page.getByText("귤러버", { exact: true })).toBeVisible();
  await expect(page.getByText(/^저장한 배송지 \d+개$/)).toBeVisible();
  await expectNoPersonalData(page);

  // 하위 화면에서는 지금처럼 보인다
  await page.getByText("내 정보 고치기", { exact: true }).click();
  await expect(page).toHaveURL(/\/me\/profile$/);
  await expect(page.getByLabel("휴대폰 번호")).toHaveValue(SEED.phone);
  await expect(page.getByLabel("카카오계정 이메일")).toHaveValue(EMAIL);
  await page.goto(`${consumerUrl}/me/addresses`);
  await expect(page.getByText(SEED.address, { exact: false }).first()).toBeVisible();
  assertClean();
});

test("DEV-316: without a nickname the header asks for one instead of showing the real name", async ({ page }) => {
  const assertClean = monitor(page);
  await loginConsumer(page, SEED.name);
  await asKakaoUser(page, null);
  await page.goto(`${consumerUrl}/me`);
  await expect(page.getByText("닉네임을 정해 주세요", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "가입 마치기" })).toBeVisible();
  await expectNoPersonalData(page);
  assertClean();
});

test("DEV-316: a test account without a nickname shows a neutral label, not the seed name", async ({ page }) => {
  const assertClean = monitor(page);
  await loginConsumer(page, SEED.name);
  await page.goto(`${consumerUrl}/me`);
  await expect(page.getByText("닉네임 없음", { exact: true })).toBeVisible();
  await expect(page.getByText(/테스트 계정/).first()).toBeVisible();
  await expectNoPersonalData(page);
  assertClean();
});

test("DEV-316 AC-02-1: producer settings and farm profile hide the account number; the account screen still shows it", async ({
  page,
}) => {
  const assertClean = monitor(page);
  // 시드 f-kang: 제주은행 101-23-456789, 예금주 = 대표자 강영수
  await loginProducer(page, "강영수");
  for (const path of ["/settings", "/farm"]) {
    await page.goto(`${producerUrl}${path}`);
    await expect(page.getByText("강씨네 귤밭").first()).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text).not.toContain("101-23-456789");
    expect(text).not.toContain("강영수");
  }
  await expect(page.getByText("제주은행 계좌를 등록했어요")).toBeVisible();
  await page.getByRole("button", { name: /^입금 계좌 고치기/ }).click();
  await expect(page).toHaveURL(/\/farm\/account$/);
  await expect(page.getByLabel("계좌번호")).toHaveValue("101-23-456789");
  await expect(page.getByLabel("예금주")).toHaveValue("강영수");
  assertClean();
});

test("DEV-316 AC-01-3: the pending screen hides the applicant name and phone; the application sheet still shows it", async ({
  page,
}) => {
  const assertClean = monitor(page);
  // 시드 f-wimi: 대표자 오미숙, 연락처 010-4321-8765, 확인 중
  await loginProducer(page, "오미숙");
  await expect(page).toHaveURL(/\/pending$/);
  await expect(page.getByText("확인 중이에요")).toBeVisible();
  await expect(page.getByText("신청서에 적은 번호로 연락드려요")).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("010-4321-8765");
  expect(text).not.toContain("오미숙");
  await page.getByRole("button", { name: /^신청 내용 보기/ }).click();
  await expect(page.getByText("010-4321-8765")).toBeVisible();
  await expect(page.getByText("오미숙")).toBeVisible();
  assertClean();
});
