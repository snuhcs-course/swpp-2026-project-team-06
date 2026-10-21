import { expect, test } from "@playwright/test";
import { apiLogin, apiUrl, loginProducer, newPage, producerUrl } from "./helpers";

// 1x1 PNG. 브라우저가 실제로 디코드할 수 있어야 canvas 축소를 거친다.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
);

test("AC-02-3 DEV-102: farm photo is uploaded as a file and saved as a URL, not base64", async ({
  context,
  request,
}) => {
  const { page, assertClean } = await newPage(context);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/farm`);

  const uploaded = page.waitForResponse(
    (r) => r.url() === `${apiUrl}/api/media` && r.request().method() === "POST",
  );
  const saved = page.waitForResponse(
    (r) => r.url() === `${apiUrl}/api/farms/me` && r.request().method() === "PATCH",
  );
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "사진 바꾸기" }).click();
  await (await chooser).setFiles({ name: "farm.png", mimeType: "image/png", buffer: PNG });

  expect((await uploaded).status()).toBe(201);
  expect((await saved).status()).toBe(200);
  await expect(page.getByText("사진을 바꿨어요")).toBeVisible();

  const token = await apiLogin(request, "u-kang", "producer");
  const farm = await (
    await request.get(`${apiUrl}/api/farms/me`, { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  expect(farm.photo).toMatch(new RegExp(`^${apiUrl}/api/media/med-[0-9a-f]+\\.jpg$`));
  const image = await request.get(farm.photo);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/jpeg");
  assertClean();
});
