import { test, expect } from "@playwright/test";
import { loginProducer, producerUrl, monitor } from "./helpers";

for (const width of [360, 390, 430]) {
  test(`AC-SRC-1/4 ${width}px: compact files and live analysis status`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const clean = monitor(page);
    await loginProducer(page, "강영수");
    const target = {
      id: "target-ui",
      name: "하우스감귤",
      productId: "p-house",
    };
    const batch = {
      id: "ui-preview",
      version: 1,
      reviewVersion: 1,
      targets: [target],
      sources: [
        {
          id: "photo",
          filename: "감귤 사진.jpg",
          mime: "image/jpeg",
          originalPhoto: true,
        },
        {
          id: "pdf",
          filename: "판매 안내.pdf",
          mime: "application/pdf",
          originalPhoto: false,
        },
        {
          id: "txt",
          filename: "보관 안내.txt",
          mime: "text/plain",
          originalPhoto: false,
        },
      ].map((s) => ({
        ...s,
        targetIds: [],
        common: true,
        revision: 1,
        sanitizationVersion: 1,
        privacyApproved: true,
        status: "PREPARED",
        pageCount: 1,
        error: null,
      })),
    };
    let status = "ANALYZING";
    let imageRequests = 0;
    await page.route(
      "**/api/source-analysis/batches/ui-preview**",
      async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() === "POST" && path.endsWith("/sources")) {
          const added = {
            ...batch.sources[0],
            id: "new-photo",
            filename: "tangerine-box.jpg",
            pageCount: 0,
            status: "UPLOADED",
          };
          batch.sources.push(added);
          return route.fulfill({ json: added, status: 201 });
        }
        if (path.endsWith("/text"))
          return route.fulfill({
            json: { text: "서늘한 곳에 보관해 주세요." },
          });
        if (path.endsWith("/image")) {
          imageRequests++;
          return route.fulfill({
            path: "apps/consumer/public/photos/tangerine-box.jpg",
            contentType: "image/jpeg",
          });
        }
        if (path.endsWith("/runs"))
          return route.fulfill({
            json: {
              items: [
                {
                  id: "run-ui",
                  mode: "openrouter",
                  model: "fixture",
                  status,
                  completed: status === "SUCCEEDED" ? 2 : 0,
                  total: 2,
                  items: [],
                },
              ],
            },
          });
        if (path.endsWith("/review"))
          return route.fulfill({
            json: {
              reviewVersion: 1,
              targets: [target],
              fields: [],
              candidates: [],
              conflicts: [],
              sourcePhotoRequests: [],
            },
          });
        if (path.endsWith("/drafts"))
          return route.fulfill({ json: { items: [] } });
        return route.fulfill({ json: batch });
      },
    );
    await page.goto(
      `${producerUrl}/products/source-analysis?batchId=ui-preview`,
    );
    const banner = page.getByTestId("source-analysis-status");
    await expect(banner).toContainText("분석 중이에요");
    await expect(
      page.getByRole("button", { name: "분석 중이에요", exact: true }),
    ).toBeDisabled();
    await expect(page.getByTestId("product-photo-box")).not.toContainText(
      "감귤 사진.jpg",
    );
    await expect(page.getByTestId("source-material-box")).not.toContainText(
      "판매 안내.pdf",
    );
    await expect(
      page.getByRole("button", { name: "상세페이지 편집", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /개인정보 가림/ }),
    ).toHaveCount(0);
    status = "PRIVACY_REVIEW";
    await expect(banner).toContainText("이전 분석을 다시 시작해 주세요");
    status = "SUCCEEDED";
    await expect(banner).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "자료 준비·분석 시작", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    clean();
  });
}

test("AC-SRC-1: New Product opens uploads linked to a new private product", async ({
  page,
}) => {
  await loginProducer(page, "강영수");
  let creates = 0;
  let productId = "";
  await page.route(
    "**/api/source-analysis/product-workspaces",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      creates++;
      const response = await route.fetch();
      productId = (await response.json()).productId;
      await route.fulfill({ response });
    },
  );
  await page.goto(`${producerUrl}/products`);
  await page.getByRole("button", { name: "새 상품", exact: true }).click();
  await expect(page).toHaveURL(/source-analysis\?batchId=/);
  await expect(
    page.getByRole("button", { name: "자료 파일 추가", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("상세를 만들 상품 선택 (최대 10개)", { exact: true }),
  ).toHaveCount(0);
  expect(creates).toBe(1);
  await page
    .getByRole("button", { name: "상품 정보·판매 설정", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/products/${productId}/edit$`));
  await expect(page.getByLabel("상품명", { exact: true })).toHaveValue("");
});

test("AC-SRC-1: workspace retry reuses the new product and idempotency key", async ({
  page,
}) => {
  await loginProducer(page, "강영수");
  let creates = 0;
  let batches = 0;
  let firstProductId = "";
  const keys: string[] = [];
  await page.route(
    "**/api/source-analysis/product-workspaces",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      batches++;
      keys.push(route.request().headers()["idempotency-key"]);
      // Lose the response after the server commits; retry must return the same product.
      const response = await route.fetch();
      const body = await response.json();
      if (batches === 1) {
        creates++;
        firstProductId = body.productId;
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "fixture" },
        });
      }
      expect(body.productId).toBe(firstProductId);
      return route.fulfill({ response });
    },
  );
  await page.goto(`${producerUrl}/products/new`);
  await page
    .getByRole("button", { name: "자료 작업 다시 열기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "자료 파일 추가", exact: true }),
  ).toBeVisible();
  expect(creates).toBe(1);
  expect(batches).toBe(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});
