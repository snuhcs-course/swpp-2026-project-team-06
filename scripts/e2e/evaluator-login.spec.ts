import { test, expect, type Page } from "./fixtures";
import { consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

const kakaoConfigPath = "/api/auth/kakao/config";
const seedAccountsPath = "/api/auth/test-accounts";
const seedLoginPath = "/api/auth/test-login";
const retiredInputs = [
  { label: "plain", query: false, storage: [] },
  { label: "retired query", query: true, storage: [] },
  { label: "retired localStorage", query: false, storage: ["localStorage"] },
  { label: "retired sessionStorage", query: false, storage: ["sessionStorage"] },
  { label: "all retired browser inputs", query: true, storage: ["localStorage", "sessionStorage"] },
] as const;

function kakaoConfig(page: Page, mode: "enabled" | "disabled" | "error") {
  return page.route(`**${kakaoConfigPath}`, (route) =>
    mode === "error"
      ? route.fulfill({ status: 500, json: { code: "INTERNAL_ERROR", message: "Fixture error" } })
      : route.fulfill({
          json: { enabled: mode === "enabled", clientId: mode === "enabled" ? "test-client" : null, redirectPath: "/auth/kakao" },
        }),
  );
}

for (const { app, base, account, role } of [
  { app: "consumer", base: consumerUrl, account: "이서준", role: "CONSUMER" },
  { app: "producer", base: producerUrl, account: "강영수", role: "PRODUCER" },
] as const) {
  for (const mode of ["disabled", "error"] as const) {
    test(`AC-01-34 dev ${app} can sign in with a ${role} seed when Kakao config is ${mode}`, async ({ page }) => {
      await kakaoConfig(page, mode);
      if (app === "producer") await skipHelpGuide(page);

      const [config, accounts] = await Promise.all([
        page.waitForResponse((response) =>
          response.request().method() === "GET" && new URL(response.url()).pathname === kakaoConfigPath,
        ),
        page.waitForResponse((response) => {
          const url = new URL(response.url());
          return response.request().method() === "GET" && url.pathname === seedAccountsPath && url.searchParams.get("app") === app;
        }),
        page.goto(`${base}/login`),
      ]);
      expect(config.status()).toBe(mode === "error" ? 500 : 200);
      expect(accounts.ok()).toBe(true);
      const seeds: { userId: string; name: string; role: string }[] = await accounts.json();
      const seed = seeds.find((candidate) => candidate.name === account && candidate.role === role);
      expect(seed?.userId, `The local ${app} API fixture contains ${account} (${role})`).toBeTruthy();

      await expect(page.getByTestId("password-login-section")).toBeVisible();
      // 카카오 꺼짐·설정 오류면 칸이 펼친 채이고 접는 링크가 없다(DEV-378)
      await expect(page.getByTestId("login-username")).toBeVisible();
      await expect(page.getByTestId("id-login-toggle")).toHaveCount(0);
      if (mode === "disabled") await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toHaveCount(0);
      const radio = page.getByRole("radio").filter({ hasText: account });
      await expect(radio).toBeVisible();
      await radio.click();
      await expect(radio).toBeChecked();

      const action = page.getByRole("button", { name: app === "consumer" ? /로그인$/ : /^(?!카카오).*시작하기$/ });
      const [login] = await Promise.all([
        page.waitForResponse((response) =>
          response.request().method() === "POST" && new URL(response.url()).pathname === seedLoginPath,
        ),
        action.click(),
      ]);
      expect(login.request().postDataJSON()).toMatchObject({ app, userId: seed?.userId });
      expect(login.ok()).toBe(true);
      await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/);
    });
  }

  for (const { label, query, storage } of retiredInputs) {
    test(`AC-01-34 dev ${app} keeps seed login hidden with Kakao enabled (${label})`, async ({ page }) => {
      await kakaoConfig(page, "enabled");
      // A populated service ensures the chooser can't be hidden merely by an empty or unavailable list.
      await page.route(`**${seedAccountsPath}*`, (route) =>
        route.fulfill({
          json: [{
            userId: `fixture-${app}`,
            name: account,
            role,
            farmName: app === "producer" ? "테스트 농장" : null,
            farmStatus: app === "producer" ? "APPROVED" : null,
          }],
        }),
      );
      if (app === "producer") await skipHelpGuide(page);
      if (storage.length) {
        await page.addInitScript((keys) => {
          for (const key of keys) window[key].setItem("farmclub:evaluator", "1");
        }, storage);
      }

      await page.goto(`${base}/login${query ? "?evaluator=1" : ""}`);
      await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
      await expect(page.getByTestId("password-login-section")).toBeVisible();
      // 카카오가 켜지면 칸은 링크 뒤에 접혀 있고, 누르면 펼친다(DEV-378)
      const toggle = page.getByTestId("id-login-toggle");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByTestId("login-username")).toBeHidden();
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
      await expect(page.getByRole("radio")).toHaveCount(0);
      await expect(page.getByTestId("login-bottom-bar")).toHaveCount(0);
      await toggle.click();
      await expect(page.getByTestId("login-username")).toBeVisible();
    });
  }
}
