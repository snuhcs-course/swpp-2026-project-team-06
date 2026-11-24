// Acceptance-based incremental tracking input regressions.
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, producerUrl, loginProducer } from "./helpers";

const marker = () => crypto.randomUUID().replace(/[0-9]/g, n => String.fromCharCode(103 + Number(n)));
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const mutation = (token: string) => ({ ...auth(token), "Idempotency-Key": crypto.randomUUID() });
async function reviewShot(page: Page, name: string) {
  mkdirSync(".artifacts/uat-followup-review", { recursive: true });
  await page.screenshot({ path: `.artifacts/uat-followup-review/${name}.png`, fullPage: true });
}
test.beforeEach(() => {
  for (const url of [apiUrl, consumerUrl, producerUrl])
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(url).hostname);
});

test("AC17 invoice: typing groups immediately; middle edits, separator deletion, selection and paste retain digits and caret", async ({ page, request }) => {
  test.setTimeout(120_000);
  const producerToken = await apiLogin(request, "u-kang", "producer");
  const consumerToken = await apiLogin(request, "u-minji", "consumer");
  const created = await request.post(`${apiUrl}/api/orders`, {
    headers: mutation(consumerToken), data: {
      productId: "p-house", optionId: "opt-5", quantity: 1,
      recipientName: `송장검증 ${marker()}`, recipientPhone: "010-1234-5678",
      postalCode: "04001", address: "서울 마포구 월드컵북로 12",
      consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
      consentVersion: "uat-invoice",
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const order = await created.json();
  for (const [action, token] of [["deposit", consumerToken], ["confirm-deposit", producerToken]]) {
    const response = await request.post(`${apiUrl}/api/orders/${order.orderId}/${action}`, {
      headers: mutation(token), data: {},
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/ship?status=PREPARING`);
  await page.getByRole("button", { name: new RegExp(`${order.recipientName}.*송장 입력`) }).click();
  await page.getByRole("radio", { name: "CJ대한통운", exact: true }).click();
  const input = page.getByRole("textbox", { name: "송장 번호", exact: true });
  const replaceByTyping = async (text: string) => {
    await input.press("ControlOrMeta+A");
    await input.pressSequentially(text);
  };
  const moveTo = async (position: number) => {
    await input.press("Home");
    for (let index = 0; index < position; index++) await input.press("ArrowRight");
  };
  const selected = () => input.evaluate(node => ({
    start: (node as HTMLInputElement).selectionStart,
    end: (node as HTMLInputElement).selectionEnd,
  }));
  await input.pressSequentially("1234");
  await expect(input).toHaveValue("1234");
  await input.pressSequentially("5");
  await expect(input).toHaveValue("1234-5");
  await expect(input).toBeFocused();
  expect(await selected()).toEqual({ start: 6, end: 6 });
  await input.pressSequentially("6789012");
  await expect(input).toHaveValue("1234-5678-9012");

  await moveTo(6); // Insert after the fifth digit, rather than appending at the end.
  await input.pressSequentially("0");
  await expect(input).toHaveValue("1234-5067-89012");
  expect(await selected()).toEqual({ start: 7, end: 7 });
  await input.press("Backspace");
  await expect(input).toHaveValue("1234-5678-9012");
  expect(await selected()).toEqual({ start: 6, end: 6 });

  await moveTo(5); // Backspace directly after the inserted separator.
  await input.press("Backspace");
  await expect(input).toHaveValue("1235-6789-012");
  expect(await selected()).toEqual({ start: 3, end: 3 });
  await replaceByTyping("123456789012");
  await moveTo(4); // Forward Delete directly before the separator.
  await input.press("Delete");
  await expect(input).toHaveValue("1234-6789-012");
  const deletionOffset = await input.evaluate(node => {
    const field = node as HTMLInputElement;
    return field.value.slice(0, field.selectionStart ?? 0).replace(/\D/g, "").length;
  });
  expect(deletionOffset).toBe(4);

  await replaceByTyping("123456789012");
  await moveTo(3);
  for (let index = 0; index < 7; index++) await input.press("Shift+ArrowRight");
  expect(await selected()).toEqual({ start: 3, end: 10 });
  await input.pressSequentially("55");
  await expect(input).toHaveValue("1235-5901-2");
  expect(await selected()).toEqual({ start: 6, end: 6 });

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: producerUrl });
  await page.evaluate(() => navigator.clipboard.writeText("12345678901234567890"));
  await input.press("ControlOrMeta+A");
  await input.press("ControlOrMeta+V");
  await expect(input).toHaveValue("1234-5678-901234567890");
  expect(await selected()).toEqual({ start: 22, end: 22 });
  await replaceByTyping("DEV25-1234");
  await expect(input).toHaveValue("DEV25-1234");
  await page.getByRole("radio", { name: "기타", exact: true }).click();
  await replaceByTyping("123456789012");
  await expect(input).toHaveValue("123456789012");
  await page.getByRole("radio", { name: "CJ대한통운", exact: true }).click();
  await replaceByTyping("123456789012");
  await expect(input).toHaveValue("1234-5678-9012");
  await reviewShot(page, "invoice");
  await replaceByTyping("987654321098");
  await expect(input).toHaveValue("9876-5432-1098");
  const fiftyDigits = "1234567890".repeat(5);
  await replaceByTyping(fiftyDigits);
  await expect(input).toHaveValue(fiftyDigits);
  expect(await selected()).toEqual({ start: 50, end: 50 });
  await page.evaluate(text => navigator.clipboard.writeText(text), fiftyDigits);
  await input.press("ControlOrMeta+A");
  await input.press("ControlOrMeta+V");
  await expect(input).toHaveValue(fiftyDigits);
  expect(await selected()).toEqual({ start: 50, end: 50 });
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(input).toHaveCount(0);
  await page.getByRole("button", { name: `${order.orderNo} 송장 수정`, exact: true }).click();
  await expect(input).toHaveValue(fiftyDigits);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: "1건 출하 처리", exact: true }).click();
  await page.getByRole("button", { name: "1건 출하 처리", exact: true }).last().click();
  await expect.poll(async () => {
    const response = await request.get(`${apiUrl}/api/orders/${order.orderId}`, { headers: auth(consumerToken) });
    expect(response.ok(), await response.text()).toBeTruthy();
    const saved = await response.json();
    return { status: saved.status, trackingNumber: saved.trackingNumber };
  }).toEqual({ status: "SHIPPED", trackingNumber: fiftyDigits });
});
