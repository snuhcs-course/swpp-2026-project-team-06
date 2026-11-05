import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

export const consumerUrl = process.env.FARMCLUB_CONSUMER_URL ?? "http://localhost:8081";
export const producerUrl = process.env.FARMCLUB_PRODUCER_URL ?? "http://localhost:8082";
export const apiUrl = process.env.FARMCLUB_API_URL ?? "http://localhost:8000";

const ignoredConsoleErrors = [
  /Require cycle:/,
  /pointerEvents is deprecated/,
  /Download the React DevTools/,
];

// DEV-234: 로컬 스택 밖(외부 폰트·이미지 CDN 등) 리소스를 못 받은 콘솔 오류는 실패가 아니라 경고 주석으로 남긴다.
// 2026-11-05 main CI 41962666285에서 외부 리소스 net::ERR_TIMED_OUT 한 건이 producer-and-privacy를 떨어뜨렸다.
// localhost(API·앱) 리소스 실패는 그대로 실패다.
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
function externalResourceFailure(text: string, url: string | undefined) {
  if (!/^Failed to load resource/.test(text) || !url) return false;
  try {
    return !localHosts.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function monitor(page: Page, allowedErrors: RegExp[] = []) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && externalResourceFailure(message.text(), message.location().url)) {
      const description = `external resource failed (not counted): ${message.text()} ${message.location().url}`;
      try {
        test.info().annotations.push({ type: "warning", description });
      } catch {
        // 테스트가 끝난 뒤 들어온 콘솔 이벤트(test.info() 없음)
        console.warn(description);
      }
      return;
    }
    if (
      message.type() === "error" &&
      !ignoredConsoleErrors.some((pattern) => pattern.test(message.text())) &&
      !allowedErrors.some((pattern) => pattern.test(message.text()))
    ) {
      failures.push(`console.error: ${message.text()}`);
    }
  });
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/__mock") || /:8083(?:\/|$)/.test(url)) failures.push(`Mock traffic: ${url}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`);
  });
  return () => expect(failures, failures.join("\n")).toEqual([]);
}

export async function loginConsumer(page: Page, name = "김민지") {
  await page.goto(`${consumerUrl}/login`);
  await page.getByRole("radio").filter({ hasText: name }).click();
  await page.getByRole("button", { name: /로그인$/ }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** 처음 진입 때 자동으로 열리는 생산자 도움말 시트(DEV-109)를 본 것으로 둔다 */
export async function skipHelpGuide(page: Page) {
  await page.addInitScript(() => localStorage.setItem("farmclub-producer:help-guide-seen", "1"));
}

export async function loginProducer(page: Page, accountName: string, { helpGuide = false } = {}) {
  if (!helpGuide) await skipHelpGuide(page);
  await page.goto(`${producerUrl}/login`);
  await page.getByRole("radio", { name: new RegExp(accountName) }).click();
  await page.getByRole("button", { name: /시작하기$/ }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function apiLogin(request: APIRequestContext, userId: string, app: "consumer" | "producer") {
  const response = await request.post(`${apiUrl}/api/auth/test-login`, { data: { userId, app } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).accessToken as string;
}

export async function newPage(context: BrowserContext) {
  const page = await context.newPage();
  const assertClean = monitor(page);
  return { page, assertClean };
}
