import { test, expect, type Page } from "./fixtures";
import { consumerUrl, loginProducer, producerUrl } from "./helpers";

// DEV-258: 원산지표시법 시행규칙 별표 3 2호가목1) — 통신판매 화면은 원산지를 상품명·가격 옆·위·아래에,
// 상품명·가격과 같거나 큰 글자, 같은 색으로. 소비자 상품 상세는 상품명 바로 아래 줄에 둔다.
async function styleOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const text = el.querySelector("div,span") ?? el;
    const s = getComputedStyle(text);
    return { fontSize: parseFloat(s.fontSize), color: s.color };
  });
}

async function editProduct(page: Page, edit: (p: Record<string, unknown>) => void) {
  await page.route("**/api/products/p-house", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    edit(body);
    await route.fulfill({ response, json: body });
  });
}

test("DEV-258 consumer product page shows the origin right under the name at the same size and color", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${consumerUrl}/products/p-house`);
  const name = page.getByRole("heading", { name: "하우스 감귤 5kg / 10kg" });
  const origin = page.getByTestId("product-origin");
  await expect(name).toBeVisible();
  await expect(origin).toHaveText("원산지 제주 서귀포");

  const nameStyle = await name.evaluate((el) => {
    const s = getComputedStyle(el);
    return { fontSize: parseFloat(s.fontSize), color: s.color };
  });
  const originStyle = await styleOf(page, '[data-testid="product-origin"]');
  expect(originStyle.fontSize).toBeGreaterThanOrEqual(nameStyle.fontSize);
  expect(originStyle.color).toBe(nameStyle.color);

  // 상품명 바로 아래(사이 8 이하), 받는 시기·가격보다 위
  const nameBox = (await name.boundingBox())!;
  const originBox = (await origin.boundingBox())!;
  const windowBox = (await page.getByText(/도착 예정/).first().boundingBox())!;
  expect(originBox.y - (nameBox.y + nameBox.height)).toBeLessThanOrEqual(8);
  expect(originBox.y + originBox.height).toBeLessThanOrEqual(windowBox.y);
});

test("DEV-258 the origin stays in place when the product is sold out", async ({ page }) => {
  await editProduct(page, (p) => {
    p.soldOut = true;
    p.availability = "SOLD_OUT";
  });
  await page.goto(`${consumerUrl}/products/p-house`);
  await expect(page.getByTestId("product-origin")).toHaveText("원산지 제주 서귀포");
});

test("DEV-258 a published product with a blank origin hides the line", async ({ page }) => {
  await editProduct(page, (p) => {
    (p.info as Record<string, string>).origin = "  ";
  });
  await page.goto(`${consumerUrl}/products/p-house`);
  await expect(page.getByRole("heading", { name: "하우스 감귤 5kg / 10kg" })).toBeVisible();
  await expect(page.getByTestId("product-origin")).toHaveCount(0);
});

test("DEV-258 producer origin field says where the origin shows and that it is required", async ({ page }) => {
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/edit`);
  await expect(
    page.getByText("구매자 화면에는 상품명 바로 아래 같은 크기로 보이고, 비어 있으면 판매 요청을 할 수 없어요.", {
      exact: true,
    }),
  ).toBeVisible();
});
