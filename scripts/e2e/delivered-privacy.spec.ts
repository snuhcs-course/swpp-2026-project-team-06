import { mkdir } from "node:fs/promises";

import { expect, test } from "./fixtures";
import { apiLogin, apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

test("DEV-254 AC-17-13: All orders masks the delivered seed recipient without leaking their shipping details", async ({ page, request }) => {
  const clean = monitor(page);
  const ownerHeaders = { Authorization: `Bearer ${await apiLogin(request, "u-minji", "consumer")}` };
  const detail = await request.get(`${apiUrl}/api/orders/o-07`, { headers: ownerHeaders });
  expect(detail.ok()).toBeTruthy();
  const original = await detail.json();
  expect(original.status).toBe("DELIVERED");
  expect(original.recipientName).toBeTruthy();
  expect(original.address).toBeTruthy();
  expect(original.addressDetail).toBeTruthy();

  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/ship?status=all`);
  const orderNumber = page.getByText(original.orderNo, { exact: false });
  await expect(orderNumber).toHaveCount(1);
  // Find the smallest order container with both number and product, keeping checks local
  // when several seed orders share the same recipient and address.
  // The [1] stays on the reverse ancestor axis, selecting the nearest match.
  const productLiteral = `'${original.productName.replaceAll("'", "',\"'\",'")}'`;
  const row = orderNumber.locator(`xpath=ancestor::div[contains(., concat(${productLiteral}, ''))][1]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText(original.productName);
  await mkdir(".artifacts/dev254", { recursive: true });
  const label = process.env.DEV254_EVIDENCE_LABEL ?? "current";
  await page.screenshot({ path: `.artifacts/dev254/${label}-all-orders.png`, fullPage: true });
  await row.screenshot({ path: `.artifacts/dev254/${label}-delivered-row.png` });

  await expect(row).toContainText("○○○");
  for (const value of [original.recipientName, original.recipientPhone, original.postalCode,
    original.address, original.addressDetail, original.deliveryNote]) {
    if (value) await expect(row).not.toContainText(value);
  }
  const after = await request.get(`${apiUrl}/api/orders/o-07`, { headers: ownerHeaders });
  expect(after.ok()).toBeTruthy();
  const ownerAfter = await after.json();
  for (const field of ["recipientName", "recipientPhone", "postalCode", "address", "addressDetail", "deliveryNote"]) {
    expect(ownerAfter[field]).toEqual(original[field]);
  }
  clean();
});
