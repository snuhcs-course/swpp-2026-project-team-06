import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

export const consumerUrl = process.env.FARMCLUB_CONSUMER_URL ?? "http://localhost:8081";
export const producerUrl = process.env.FARMCLUB_PRODUCER_URL ?? "http://localhost:8082";
export const apiUrl = process.env.FARMCLUB_API_URL ?? "http://localhost:8000";

const ignoredConsoleErrors = [
  /Require cycle:/,
  /pointerEvents is deprecated/,
  /Download the React DevTools/,
];

export function monitor(page: Page, allowedErrors: RegExp[] = []) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
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

export async function loginProducer(page: Page, accountName: string) {
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
