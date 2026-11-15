import { expect, test, type Page } from "./fixtures";
import { consumerUrl, loginProducer, producerUrl } from "./helpers";

// DEV-322 (PM 11/15): 상품 대표 사진이 없거나 불러오지 못하면 기본 사진(면색 + 그레이스케일 로고)을 보여 준다.
// 64px 이하 썸네일은 지금처럼 작은 로고만 둔다.
async function editProduct(page: Page, edit: (p: Record<string, unknown>) => void) {
  await page.route("**/api/products/p-house", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    edit(body);
    await route.fulfill({ response, json: body });
  });
}

const NAME = "하우스 감귤 5kg / 10kg";

test("DEV-322 product page shows the default photo when the main photo is empty", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await editProduct(page, (p) => {
    p.photo = null;
    p.photos = [];
  });
  await page.goto(`${consumerUrl}/products/p-house`);
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
  const fallback = page.getByTestId("product-photo-fallback").first();
  await expect(fallback).toBeVisible();
  await expect(page.getByRole("img", { name: `${NAME} 사진 없음` })).toBeVisible();
  // 사진 자리를 다 채운다(작은 로고가 아님)
  const box = await fallback.boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.height).toBeGreaterThan(200);
});

test("DEV-322 product page shows the default photo when the main photo fails to load", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const broken = `${consumerUrl}/photos/dev-322-missing.jpg`;
  await page.route(broken, (route) => route.fulfill({ status: 404, body: "" }));
  await editProduct(page, (p) => {
    p.photo = broken;
    p.photos = [broken];
  });
  await page.goto(`${consumerUrl}/products/p-house`);
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
  await expect(page.getByTestId("product-photo-fallback").first()).toBeVisible();
});

test("DEV-322 product page keeps the real photo when it loads", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${consumerUrl}/products/p-house`);
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
  await expect(page.getByRole("img", { name: NAME }).first()).toBeVisible();
  await expect(page.getByTestId("product-photo-fallback")).toHaveCount(0);
});

test("DEV-322 producer buyer preview shows the default photo when the product has no photo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  await page.route("**/api/products/mine/p-house", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.photos = [];
    await route.fulfill({ response, json: body });
  });
  await page.goto(`${producerUrl}/products/p-house/sell`);
  await expect(page.getByTestId("product-photo-fallback").first()).toBeVisible();
  await expect(page.getByRole("img", { name: `${NAME} 사진 없음` })).toBeVisible();
});

test("DEV-322 producer buyer preview keeps the seeded product photos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/sell`);
  await expect(page.getByRole("img", { name: NAME }).first()).toBeVisible();
  // 시드 사진(/photos/…)이 API 주소로 잘못 바뀌어 못 불러오면 기본 사진이 뜬다
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("product-photo-fallback")).toHaveCount(0);
});

test("DEV-322 producer farm photo keeps the small logo placeholder (not the product default photo)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  await page.route("**/api/farms/me", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.photo = null;
    await route.fulfill({ response, json: body });
  });
  await page.goto(`${producerUrl}/farm`);
  await expect(page.getByText("소비자 앱에서 내 농가 보기", { exact: true })).toBeVisible();
  await expect(page.getByTestId("product-photo-fallback")).toHaveCount(0);
});
