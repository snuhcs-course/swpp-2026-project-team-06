import { test, expect, type Page } from "@playwright/test";
import { consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

// DEV-113 AC-01-17·18: 약관 버전이 바뀌면 기존 회원도, 새 회원도 동의해야 쓴다.
// DEV-132 AC-01-19: 카카오 새 사용자는 약관에 동의해야 계정이 생긴다.
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

/** 그 앱의 Mock 카카오 계정이 이미 있는가(있으면 바로 로그인, 없으면 가입 토큰만 온다) */
async function kakaoAccountExists(page: Page, app: "consumer" | "producer") {
  return page.evaluate(
    async ({ app, mockUrl }) => {
      const res = await fetch(`${mockUrl}/api/auth/kakao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "probe", redirectUri: "x", app }),
      });
      return !!(await res.json()).user;
    },
    { app, mockUrl },
  );
}

/** 소비자 카카오 새 사용자: 가입 동의 화면에서 필수 약관에 동의해 계정을 만든다 */
async function consumerSignup(page: Page) {
  await page.goto(`${consumerUrl}/login`);
  await page.getByRole("button", { name: "카카오로 시작하기" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: /약관에 동의하고\s*가입해요/ })).toBeVisible();
  await expect(page.getByLabel("닉네임")).toHaveCount(0);
  const join = page.getByRole("button", { name: "동의하고 가입하기" });
  await expect(join).toBeDisabled();
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
  await join.click();
  // 가입되면 같은 화면이 프로필 입력(닉네임·휴대폰)으로 바뀐다. 동의 칸은 다시 보이지 않는다
  await expect(page.getByLabel("닉네임")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "모두 동의해요" })).toHaveCount(0);
}

test("DEV-132 AC-01-19: a new Kakao consumer gets no account until agreeing to the terms", async ({ page }) => {
  await page.goto(`${consumerUrl}/login`);
  await page.getByRole("button", { name: "카카오로 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /약관에 동의하고\s*가입해요/ })).toBeVisible();
  // 동의하지 않고 닫으면 계정이 남지 않는다
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page).not.toHaveURL(/\/onboarding/);
  expect(await kakaoAccountExists(page, "consumer")).toBe(false);

  await consumerSignup(page);
  expect(await kakaoAccountExists(page, "consumer")).toBe(true);
});

test("DEV-142 AC-01-12: sign-up asks only nickname and phone; name and address come at the first checkout", async ({ page }) => {
  await consumerSignup(page);
  // 가입은 한 화면: 이름 칸과 배송지 단계가 없다(당근식)
  await expect(page.getByLabel("이름")).toHaveCount(0);
  await expect(page.getByText("1 / 2")).toHaveCount(0);
  const start = page.getByRole("button", { name: "시작하기" });
  await expect(start).toBeDisabled();
  await page.getByLabel("닉네임").fill("귤러버");
  await page.getByLabel("휴대폰 번호").fill("01023456789");
  await start.click();
  await expect(page).not.toHaveURL(/\/onboarding/);
  expect(await mockApi(page, "consumer", "PUT", "/api/farms/f-kang/follow")).toBe(200);

  // 첫 주문서의 배송지 입력: 연락처는 가입한 휴대폰으로 채우고, 받는 사람은 여기서 처음 입력한다
  await page.goto(`${consumerUrl}/checkout/p-house/address`);
  await expect(page.getByLabel("연락처")).toHaveValue("010-2345-6789");
  await expect(page.getByLabel("받는 사람")).toHaveValue("");
  // ‘기본 배송지로 저장’은 첫 주문에서 켜진 채 시작한다
  await page.getByLabel("받는 사람").fill("박현");
  await page.getByLabel("우편번호").fill("06236");
  await page.getByLabel("주소", { exact: true }).fill("서울 강남구 테헤란로 1");
  await page.getByRole("button", { name: "이 주소로 받기" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house$/);
  await expect(page.getByText("06236 · 기본 배송지로 저장")).toBeVisible();

  // 예전 2/2 주소는 가입 화면으로 보낸다(가입을 마쳤으면 다음 화면으로)
  await page.goto(`${consumerUrl}/onboarding/address`);
  await expect(page).not.toHaveURL(/\/onboarding\/address/);
});

test("DEV-113 AC-01-17: a consumer who agreed to old terms is asked again and blocked until agreeing", async ({ page }) => {
  await consumerSignup(page);

  // 예전 버전에 동의하고 프로필을 채운 기존 회원으로 만든다
  const old = ["TERMS", "PRIVACY", "AGE14"].map((kind) => ({ kind, version: "2026-10-18" }));
  expect(await mockApi(page, "consumer", "POST", "/api/auth/me/consents", { consents: old })).toBe(200);
  expect(
    await mockApi(page, "consumer", "PATCH", "/api/auth/me", { nickname: "귤러버", name: "박현", phone: "010-2345-6789" }),
  ).toBe(200);
  expect(await mockApi(page, "consumer", "PUT", "/api/farms/f-kang/follow")).toBe(403);

  // 앱을 열면 재동의 화면이 한 번 뜬다(프로필 칸 없이)
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
  // 동의 전에는 계정이 없다(DEV-132). 가입 신청 주소로 가면 로그인으로 돌아간다
  expect(await kakaoAccountExists(page, "producer")).toBe(false);
  await page.goto(`${producerUrl}/apply`);
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(`${producerUrl}/consent`);
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
  expect(await kakaoAccountExists(page, "producer")).toBe(true);
});
