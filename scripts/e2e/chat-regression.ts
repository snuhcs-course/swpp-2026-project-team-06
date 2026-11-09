import { execFileSync } from "node:child_process";
import path from "node:path";
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import { expect } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl } from "./helpers";

export type ChatState = {
  threadId: string | null;
  aiMode: string | null;
  version: number | null;
  readId: string | null;
  following: boolean;
  messages: { id: string; orderId: string | null; senderType: string; body: string }[];
  contexts: string[];
  inquiryCount: number;
  escalationCount: number;
  attachmentCount: number;
};
export type FixtureStart = { originalSettings: unknown; state: ChatState };
export function chatFixture<T = ChatState>(command: string, data: unknown = {}): T {
  const root = process.cwd();
  return JSON.parse(execFileSync(path.join(root, "server/.venv/bin/python"), [
    path.join(root, "scripts/e2e/chat-regression-fixture.py"), command, JSON.stringify(data),
  ], {
    cwd: path.join(root, "server"), encoding: "utf8",
    env: { ...process.env, FARMCLUB_CHAT_REGRESSION: "1" },
  }));
}

export function expectEmptyChat(state: ChatState) {
  expect(state.threadId).toBeNull();
  expect(state.following).toBe(false);
  expect(state.messages).toEqual([]);
  expect(state.contexts).toEqual([]);
  expect(state.inquiryCount).toBe(0);
  expect(state.escalationCount).toBe(0);
  expect(state.attachmentCount).toBe(0);
}

/** Paid eligibility is established through the real checkout/admin endpoints. */
export async function paidChatOrder(request: APIRequestContext) {
  const token = await apiLogin(request, "u-seojun", "consumer");
  const headers = { Authorization: `Bearer ${token}` };
  const mutation = () => ({ ...headers, "Idempotency-Key": crypto.randomUUID() });
  const created = await request.post(`${apiUrl}/api/orders`, {
    headers: mutation(), data: {
      productId: "p-noji", optionId: "opt-10", quantity: 1,
      recipientName: "DEV249 synthetic buyer", recipientPhone: "010-1234-5678",
      postalCode: "63584", address: "제주특별자치도 서귀포시 통합로 1",
      consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
      consentVersion: "dev249",
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { orderId, orderNo } = await created.json() as { orderId: string; orderNo: string };
  const deposit = await request.post(`${apiUrl}/api/orders/${orderId}/deposit`, {
    headers: mutation(), data: {},
  });
  expect(deposit.ok(), await deposit.text()).toBeTruthy();
  const admin = process.env.FARMCLUB_ADMIN_TOKEN;
  expect(admin, "standard isolated integration admin fixture").toBeTruthy();
  const confirmed = await request.post(`${apiUrl}/admin/orders/${orderId}/confirm-deposit`, {
    headers: { Authorization: `Bearer ${admin}`, "Idempotency-Key": crypto.randomUUID() }, data: {},
  });
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
  return { orderId, orderNo, headers, mutation };
}

export async function openPaidChat(page: Page, orderId: string) {
  await page.goto(`${consumerUrl}/orders/${orderId}`);
  await page.getByRole("button", { name: /^농가에 물어보기(?: ›)?$/ }).click();
  await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeEditable();
}

export async function openPrivateListChat(page: Page) {
  await page.goto(`${consumerUrl}/chats?view=private`);
  const row = page.getByRole("button", { name: /^한라네 과수원,/ });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page).toHaveURL(/\/chats\/f-halla$/);
  await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeVisible();
}

export async function attachChatPhoto(page: Page) {
  await page.getByRole("button", { name: "사진 첨부", exact: true }).click();
  const uploaded = page.waitForResponse(r => r.request().method() === "POST" &&
    new URL(r.url()).pathname === "/api/messaging/attachments");
  const image = chatFixture<{ base64: string }>("image");
  await page.locator('input[type="file"]').setInputFiles({
    name: "dev249.png", mimeType: "image/png", buffer: Buffer.from(image.base64, "base64"),
  });
  const response = await uploaded;
  expect(response.ok(), await response.text()).toBeTruthy();
  await expect(page.getByRole("img", { name: "비공개 문의 사진", exact: true }).first()).toBeVisible();
  return (await response.json()).attachmentId as string;
}

export async function expectDenied(response: APIResponse, status = 404, code = "NOT_FOUND") {
  expect(response.status(), await response.text()).toBe(status);
  const body = await response.json();
  expect(body).toEqual({ code, message: expect.any(String), details: expect.any(Object) });
  return body as { code: string; message: string; details: Record<string, unknown> };
}
