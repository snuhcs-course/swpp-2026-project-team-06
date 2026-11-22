import { test, expect, type APIRequestContext, type Page } from "./fixtures";
import { apiUrl, consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

// DEV-363 (FEAT-01 AC-01-22~33): 아이디·비밀번호 로그인을 실서버로 확인한다. 공개 가입은 없고(PM 11/18)
// 계정은 운영자 API(관리자 웹 ‘아이디 계정’과 같은 경로)로 만든다. 첫 로그인은 비밀번호 변경 → 필수 동의 → 사용.
const adminToken = process.env.FARMCLUB_ADMIN_TOKEN ?? "";
const PASSWORD = "Gamgyul-Sweet-77";
const NEW_PASSWORD = "Hallabong-Brix-14";
const CONSENT_VERSION = "2026-11-20";
const CONSENTS = ["TERMS", "PRIVACY", "AGE14"].map((kind) => ({ kind, version: CONSENT_VERSION }));

async function createAccount(
  request: APIRequestContext,
  app: "consumer" | "producer",
  username: string,
  extra: Record<string, string> = {},
) {
  // Serial-suite retries share the DB with the failed attempt.
  username = `${username}${crypto.randomUUID().slice(0, 8)}`;
  const res = await request.post(`${apiUrl}/admin/id-accounts`, {
    headers: { Authorization: `Bearer ${adminToken}`, "Idempotency-Key": `e2e-create-${username}-${Date.now()}` },
    data: { app, username, ...(app === "consumer" ? { nickname: "귤친구", phone: "010-3456-7890" } : {}), ...extra },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = await res.json();
  expect(body.temporaryPassword).toBeTruthy();
  return body as { userId: string; username: string; temporaryPassword: string };
}

/** API로 첫 로그인을 끝낸다(비밀번호 PASSWORD로 변경 + 소비자 필수 동의) */
async function finishFirstLogin(request: APIRequestContext, username: string, temp: string) {
  const login = await request.post(`${apiUrl}/api/auth/login`, {
    data: { app: "consumer", username, password: temp },
  });
  const t1 = (await login.json()).accessToken;
  const changed = await request.post(`${apiUrl}/api/auth/me/password`, {
    headers: { Authorization: `Bearer ${t1}` },
    data: { currentPassword: temp, newPassword: PASSWORD },
  });
  const t2 = (await changed.json()).accessToken;
  const saved = await request.post(`${apiUrl}/api/auth/me/consents`, {
    headers: { Authorization: `Bearer ${t2}` },
    data: { consents: CONSENTS },
  });
  expect(saved.ok()).toBeTruthy();
}

async function fillLogin(page: Page, username: string, password: string) {
  await page.getByTestId("login-username").fill(username);
  await page.getByTestId("login-password").fill(password);
  await page.getByRole("button", { name: "로그인하기" }).click();
}

async function changePassword(page: Page, current: string, next: string) {
  await page.getByTestId("current-password").fill(current);
  await page.getByTestId("new-password").fill(next);
  await page.getByTestId("confirm-password").fill(next);
  await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
}

test.describe.configure({ mode: "serial" });

test("AC_01_22 login screens have ID login and the forgot note but no public sign-up", async ({ page }) => {
  await page.goto(`${consumerUrl}/login?id=1`);
  await expect(page.getByTestId("password-login-section")).toBeVisible();
  await expect(page.getByTestId("forgot-password")).toContainText("비밀번호를 잊었다면 farmclub에 문의해 주세요");
  await expect(page.getByRole("button", { name: "아이디로 회원가입" })).toHaveCount(0);
  // 빈 칸으로 누르면 그 칸만 빨갛게(PM 11/18)
  await page.getByRole("button", { name: "로그인하기" }).click();
  await expect(page.getByTestId("invalid-field-username")).toBeVisible();
  await expect(page.getByTestId("invalid-field-password")).toBeVisible();
  await skipHelpGuide(page);
  await page.goto(`${producerUrl}/login?id=1`);
  await expect(page.getByTestId("password-login-section")).toBeVisible();
  await expect(page.getByRole("button", { name: "아이디로 회원가입" })).toHaveCount(0);
});

test("AC_01_22 AC_01_23 AC_01_31 AC_01_30 operator-created consumer: forced change, then consents, then settings change", async ({ page, request }) => {
  test.skip(!adminToken, "FARMCLUB_ADMIN_TOKEN 필요(scripts/run-integration.mjs)");
  const created = await createAccount(request, "consumer", "pwbuyer1");

  await page.goto(`${consumerUrl}/login?id=1`);
  await fillLogin(page, created.username.toUpperCase(), "wrong-pass-1");
  await expect(page.getByTestId("login-error")).toHaveText("아이디 또는 비밀번호가 맞지 않아요");
  await fillLogin(page, created.username.toUpperCase(), created.temporaryPassword);
  await expect(page).toHaveURL(/\/password/);
  await expect(page.getByText(/새 비밀번호를\s*정해 주세요/)).toBeVisible();
  await page.goto(`${consumerUrl}/orders`);
  await expect(page).toHaveURL(/\/password/);
  await page.getByTestId("current-password").fill(created.temporaryPassword);
  await page.getByTestId("new-password").fill(NEW_PASSWORD);
  await page.getByTestId("confirm-password").fill("different-pass-1");
  await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
  await expect(page.getByTestId("invalid-field-confirm")).toBeVisible();
  await page.getByTestId("confirm-password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();

  // 비밀번호를 바꾸면 카카오 가입과 같은 필수 동의(SCR-06)
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText(/약관에 동의하고\s*시작해요/)).toBeVisible();
  await page.goto(`${consumerUrl}/orders`);
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
  await page.getByRole("button", { name: "동의하고 시작하기" }).click();
  await expect(page).not.toHaveURL(/\/onboarding|\/password/);

  // 내 정보 → 비밀번호 변경(아이디 계정만)
  await page.goto(`${consumerUrl}/me`);
  await page.getByText("비밀번호 변경").click();
  await expect(page).toHaveURL(/\/password/);
  await changePassword(page, "wrong-current-1", PASSWORD);
  await expect(page.getByText("지금 비밀번호가 맞지 않아요")).toBeVisible();
  await page.getByTestId("current-password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
  await expect(page.getByText("비밀번호를 바꿨어요")).toBeVisible();
});

test("AC_01_26 AC_01_27 one message for wrong login, 429 lock after 10 failures", async ({ page, request }) => {
  test.skip(!adminToken, "FARMCLUB_ADMIN_TOKEN 필요");
  const created = await createAccount(request, "consumer", "pwlocked1", { nickname: "잠금시험" });
  await finishFirstLogin(request, created.username, created.temporaryPassword);

  await page.goto(`${consumerUrl}/login?id=1`);
  await fillLogin(page, "nobody999", PASSWORD);
  await expect(page.getByTestId("login-error")).toHaveText("아이디 또는 비밀번호가 맞지 않아요");
  for (let i = 0; i < 10; i++) {
    const res = await request.post(`${apiUrl}/api/auth/login`, {
      data: { app: "consumer", username: created.username, password: "wrong-pass-1" },
    });
    expect(res.status()).toBe(401);
  }
  await fillLogin(page, created.username, PASSWORD);
  await expect(page.getByTestId("login-error")).toContainText("15분 뒤에 다시 시도해 주세요");
});

test("AC_01_23 AC_01_33 operator-created producer: forced change, consent, application, SCR-21 password link", async ({ page, request }) => {
  test.skip(!adminToken, "FARMCLUB_ADMIN_TOKEN 필요");
  const created = await createAccount(request, "producer", "pwfarmer1");
  await skipHelpGuide(page);
  await page.goto(`${producerUrl}/login?id=1`);
  await fillLogin(page, created.username, created.temporaryPassword);
  await expect(page).toHaveURL(/\/password/);
  await changePassword(page, created.temporaryPassword, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/consent/);
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
  await page.getByRole("button", { name: "동의하고 계속하기" }).click();
  await expect(page).toHaveURL(/\/apply/);
  // 신청하면 승인 대기(SCR-21)에서도 비밀번호를 바꿀 수 있다(PM 11/18)
  const login = await request.post(`${apiUrl}/api/auth/login`, {
    data: { app: "producer", username: created.username, password: NEW_PASSWORD },
  });
  const token = (await login.json()).accessToken;
  const applied = await request.post(`${apiUrl}/api/auth/producer-application`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { ownerName: "한라봉", farmName: "한라 감귤밭", region: "제주 서귀포", mainItems: "감귤", phone: "010-1111-2222" },
  });
  expect(applied.ok()).toBeTruthy();
  await page.goto(`${producerUrl}/pending`);
  await page.getByRole("button", { name: "비밀번호 변경" }).click();
  await expect(page).toHaveURL(/\/password/);
});

test("AC_01_22 AC-01-34 retired evaluator link keeps password and Kakao login without a seed chooser", async ({ page }) => {
  await page.route("**/api/auth/kakao/config", (route) =>
    route.fulfill({ json: { enabled: true, clientId: "test-client", redirectPath: "/auth/kakao" } }),
  );
  await page.route("**/api/auth/test-accounts*", (route) =>
    route.fulfill({
      json: [{ userId: "fixture-consumer", name: "이서준", role: "CONSUMER", farmName: null, farmStatus: null }],
    }),
  );
  await page.goto(`${consumerUrl}/login?evaluator=1`);
  await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
  await expect(page.getByTestId("password-login-section")).toBeVisible();
  await page.waitForLoadState("networkidle", { timeout: 10_000 });
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByTestId("login-bottom-bar")).toHaveCount(0);
});

test("AC_01_23 consumer without phone: consent wording, profile fields, and saved onboarding", async ({ page, request }, testInfo) => {
  test.skip(!adminToken, "FARMCLUB_ADMIN_TOKEN 필요(scripts/run-integration.mjs)");
  await page.setViewportSize({ width: 390, height: 844 });
  const created = await createAccount(request, "consumer", "pwnophone", { phone: "" });

  await page.goto(`${consumerUrl}/login?id=1`);
  await fillLogin(page, created.username, created.temporaryPassword);
  await expect(page).toHaveURL(/\/password/);
  await changePassword(page, created.temporaryPassword, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/onboarding/);

  const nickname = page.getByRole("textbox", { name: "닉네임", exact: true });
  const phone = page.getByRole("textbox", { name: "휴대폰 번호", exact: true });
  await expect(nickname).toBeVisible();
  await expect(phone).toBeVisible();
  // Capture before wording assertions so a failing regression retains its original UI.
  const screenshotPath = testInfo.outputPath("first-consent-no-phone.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await testInfo.attach("first-consent-no-phone", {
    path: screenshotPath,
    contentType: "image/png",
  });

  await expect(page.getByText(/약관에 동의하고\s*시작해요/)).toBeVisible();
  const start = page.getByRole("button", { name: "동의하고 시작하기", exact: true });
  await expect(start).toBeVisible();
  await nickname.fill("첫가입귤친구");
  const enteredPhone = "010-4567-8910";
  await phone.fill(enteredPhone);
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
  await start.click();
  await expect(page).not.toHaveURL(/\/onboarding|\/password|\/login/);
  await page.goto(`${consumerUrl}/orders`);
  await expect(page).toHaveURL(/\/orders(?:[/?#]|$)/);

  // Read persistence through the API without depending on browser token storage details.
  const loggedIn = await request.post(`${apiUrl}/api/auth/login`, {
    data: { app: "consumer", username: created.username, password: NEW_PASSWORD },
  });
  expect(loggedIn.ok(), await loggedIn.text()).toBeTruthy();
  const { accessToken } = await loggedIn.json();
  expect(accessToken).toBeTruthy();
  const me = await request.get(`${apiUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(me.ok(), await me.text()).toBeTruthy();
  const profile = await me.json();
  expect(profile.phone.replace(/\D/g, "")).toBe(enteredPhone.replace(/\D/g, ""));
  expect(profile.consentRequired).toBe(false);
});

// DEV-378 (FEAT-01 AC-01-35): 카카오가 켜져 있으면 아이디 로그인은 ‘아이디로 로그인’ 글자 하나로 접혀 있고,
// 누르면 펼치고 다시 누르면 접는다. 웹 `/login?id=1`은 처음부터 펼친다. 카카오 꺼짐·설정 못 읽음이면 지금처럼 펼친 채 링크가 없다.
function kakaoConfig(page: Page, mode: "enabled" | "disabled" | "error") {
  return page.route("**/api/auth/kakao/config", (route) =>
    mode === "error"
      ? route.fulfill({ status: 500, json: { code: "INTERNAL_ERROR", message: "Fixture error" } })
      : route.fulfill({
          json: { enabled: mode === "enabled", clientId: mode === "enabled" ? "test-client" : null, redirectPath: "/auth/kakao" },
        }),
  );
}

for (const { app, base } of [
  { app: "consumer", base: consumerUrl },
  { app: "producer", base: producerUrl },
] as const) {
  test(`AC_01_35 ${app} login collapses the ID form behind the link above the business footer when Kakao is on`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await kakaoConfig(page, "enabled");
    if (app === "producer") await skipHelpGuide(page);
    await page.goto(`${base}/login`);
    const toggle = page.getByTestId("id-login-toggle");
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText("아이디로 로그인");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("login-username")).toBeHidden();
    await expect(page.getByRole("button", { name: "로그인하기" })).toBeHidden();
    await expect(page.getByText("또는 아이디로 로그인")).toHaveCount(0);
    // 링크는 사업자 정보 칸 바로 위(남는 높이는 링크 위로, 결정 a2)
    const link = await toggle.boundingBox();
    const footer = await page.getByTestId("legal-footer").boundingBox();
    expect(link && footer).toBeTruthy();
    expect(footer!.y - (link!.y + link!.height)).toBeGreaterThanOrEqual(0);
    expect(footer!.y - (link!.y + link!.height)).toBeLessThanOrEqual(40);

    // 펼침: 칸·로그인하기·비밀번호 안내가 그대로, 아이디 칸에 포커스
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const username = page.getByTestId("login-username");
    await expect(username).toBeVisible();
    await expect(username).toBeFocused();
    await expect(page.getByRole("button", { name: "로그인하기" })).toBeVisible();
    await expect(page.getByTestId("forgot-password")).toBeVisible();
    await username.fill("keepme01");

    // 다시 누르면 접히고, 다시 펼쳐도 적은 아이디는 남는다
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(username).toBeHidden();
    await toggle.click();
    await expect(username).toHaveValue("keepme01");
  });

  test(`AC_01_35 ${app} login opens the ID form from ?id=1`, async ({ page }) => {
    await kakaoConfig(page, "enabled");
    if (app === "producer") await skipHelpGuide(page);
    // 기존 값(from·next)과 같이 붙어도 된다(소비자)
    await page.goto(app === "consumer" ? `${base}/login?from=reserve&next=%2Forders&id=1` : `${base}/login?id=1`);
    await expect(page.getByTestId("id-login-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("login-username")).toBeVisible();
    if (app === "consumer") await expect(page.getByText(/로그인하고\s*예약을 이어 가요/)).toBeVisible();
    // 펼친 채 시작해도 같은 글자로 접는다
    await page.getByTestId("id-login-toggle").click();
    await expect(page.getByTestId("login-username")).toBeHidden();
  });

  for (const mode of ["disabled", "error"] as const) {
    test(`AC_01_35 ${app} login keeps the ID form open without the link when Kakao config is ${mode}`, async ({ page }) => {
      await kakaoConfig(page, mode);
      if (app === "producer") await skipHelpGuide(page);
      await page.goto(`${base}/login`);
      await expect(page.getByTestId("login-username")).toBeVisible();
      await expect(page.getByRole("button", { name: "로그인하기" })).toBeVisible();
      await expect(page.getByTestId("id-login-toggle")).toHaveCount(0);
    });
  }

  test(`AC_01_35 AC_01_26 ${app} login keeps the form open while a login error is shown`, async ({ page }) => {
    await kakaoConfig(page, "enabled");
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({ status: 401, json: { code: "INVALID_CREDENTIALS", message: "아이디 또는 비밀번호가 맞지 않아요" } }),
    );
    if (app === "producer") await skipHelpGuide(page);
    await page.goto(`${base}/login`);
    const toggle = page.getByTestId("id-login-toggle");
    await toggle.click();
    await fillLogin(page, "nobody999", "wrong-pass-1");
    await expect(page.getByTestId("login-error")).toHaveText("아이디 또는 비밀번호가 맞지 않아요");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("login-error")).toBeVisible();
    await expect(page.getByTestId("login-username")).toBeVisible();
  });
}

test("AC_01_35 AC_01_31 a consumer opens the collapsed ID form and signs in with a temporary password", async ({ page, request }) => {
  test.skip(!adminToken, "FARMCLUB_ADMIN_TOKEN 필요(scripts/run-integration.mjs)");
  const created = await createAccount(request, "consumer", "pwfold");
  await kakaoConfig(page, "enabled");
  await page.goto(`${consumerUrl}/login`);
  await page.getByTestId("id-login-toggle").click();
  await fillLogin(page, created.username, created.temporaryPassword);
  await expect(page).toHaveURL(/\/password/);
});
