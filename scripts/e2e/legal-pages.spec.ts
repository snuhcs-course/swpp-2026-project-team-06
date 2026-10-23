import { test, expect } from "@playwright/test";
import { consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

// DEV-113 (R-16, policy.md 6장): 첫 화면 하단 사업자 정보와 로그인 없이 열리는 약관·처리방침
test("DEV-113 R-16: consumer home and login show the legal footer and open /privacy and /terms without login", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(consumerUrl);
  const footer = page.getByTestId("legal-footer");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();
  // 로컬 Mock 빌드에는 사업자 정보 값이 없어 ‘테스트 서비스’만 보인다
  await expect(footer.getByText("farmclub · 테스트 서비스")).toBeVisible();
  await expect(footer.getByText(/통신판매중개자/)).toBeVisible();

  await footer.getByRole("link", { name: "개인정보 처리방침" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "제6조 (개인정보의 국외 이전)" })).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(page).toHaveURL(new RegExp(`^${consumerUrl}/?$`));

  await page.goto(`${consumerUrl}/terms`);
  await expect(page.getByRole("heading", { name: "제3조 (회사의 지위 — 통신판매중개자)" })).toBeVisible();

  await page.goto(`${consumerUrl}/login`);
  await expect(page.getByTestId("legal-footer")).toBeAttached();
  expect(errors).toEqual([]);
});

test("DEV-113 R-16: producer login shows the legal footer and the gate lets guests read the terms", async ({ page }) => {
  await skipHelpGuide(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(producerUrl);
  await expect(page).toHaveURL(/\/login$/);
  const footer = page.getByTestId("legal-footer");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();
  await footer.getByRole("link", { name: "이용약관" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { name: "제14조 (판매자의 의무)" })).toBeVisible();

  // 새로고침해도 비로그인 관문이 /login으로 보내지 않는다
  await page.goto(`${producerUrl}/privacy`);
  await expect(page.getByRole("heading", { name: "제12조 (개인정보 보호책임자)" })).toBeVisible();
  await expect(page).toHaveURL(/\/privacy$/);
  expect(errors).toEqual([]);
});

// DEV-116: 카카오가 켜진 운영 로그인은 내용이 짧다. 푸터가 화면 중간에 뜨지 않고 하단 바 바로 위에 붙는다
for (const [app, url] of [
  ["producer", producerUrl],
  ["consumer", consumerUrl],
] as const) {
  for (const width of [360, 390, 430]) {
    test(`DEV-116 R-16: ${app} Kakao login keeps the legal footer at the bottom at ${width}px`, async ({ page }, info) => {
      await skipHelpGuide(page);
      await page.setViewportSize({ width, height: 800 });
      await page.route("**/api/auth/kakao/config", (route) =>
        route.request().method() === "GET"
          ? route.fulfill({ json: { enabled: true, clientId: "e2e", redirectPath: "/auth/kakao" } })
          : route.continue(),
      );
      await page.goto(`${url}/login`);
      await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
      const footer = page.getByTestId("legal-footer");
      await expect(footer).toBeVisible();
      // 링크가 아닌 중복 글자는 하단 바에 없다
      await expect(page.getByText("테스트 서비스 · 이용약관 · 개인정보 처리방침", { exact: true })).toHaveCount(0);

      const box = await footer.boundingBox();
      // 하단 고정 바(카카오 버튼 또는 안내 문구)의 위 끝
      const barTop = await page.evaluate((bottom) => {
        const tops = [...document.querySelectorAll<HTMLElement>("div")]
          .filter((d) => getComputedStyle(d).position === "absolute" && d.getBoundingClientRect().bottom >= bottom - 1)
          .map((d) => d.getBoundingClientRect().top)
          .filter((t) => t > 0);
        return Math.min(...tops);
      }, 800);
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(barTop + 1);
      expect(barTop - (box!.y + box!.height)).toBeLessThan(24);
      await info.attach(`${app}-login-${width}`, { body: await page.screenshot(), contentType: "image/png" });
    });
  }
}
