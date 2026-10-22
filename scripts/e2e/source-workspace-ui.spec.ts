import { test, expect } from "./fixtures";
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
    const card = page
      .getByTestId("product-photo-box")
      .getByTestId("attachment-tile")
      .first();
    const preview = card.getByTestId("attachment-preview");
    const removal = card.getByRole("button", {
      name: "상품사진 삭제",
      exact: true,
    });
    await expect(preview.getByRole("img")).toBeVisible();
    const bounds = await card.boundingBox();
    const contentBounds = await preview.boundingBox();
    const removeBounds = await removal.boundingBox();
    expect(Math.abs(contentBounds!.y - bounds!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(contentBounds!.width - bounds!.width)).toBeLessThanOrEqual(
      2,
    );
    expect(removeBounds!.y - bounds!.y).toBeLessThan(5);
    expect(removeBounds!.x + removeBounds!.width).toBeLessThanOrEqual(
      bounds!.x + bounds!.width,
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

for (const width of [360, 390, 430]) {
  for (const kind of ["file", "text"] as const) {
    test(`AC-SRC-1/5/11 ${width}px: ${kind} upload waits for manual basic-info saving`, async ({ page }) => {
      test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true", "Requires enabled local source API");
      await page.setViewportSize({ width, height: 850 });
      const clean = monitor(page);
      await loginProducer(page, "강영수");
      await page.goto(`${producerUrl}/products/new`);
      const variety = page.getByLabel("과일 품종명", { exact: true });
      await expect(variety).toBeVisible();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let started!: () => void;
      const saving = new Promise<void>((resolve) => { started = resolve; });
      const order: string[] = [];
      await page.route("**/api/source-analysis/batches/*/basic-info", async (route) => {
        if (route.request().method() !== "PUT") return route.continue();
        started();
        await gate;
        const response = await route.fetch();
        expect(response.ok()).toBeTruthy();
        order.push("basic-info saved");
        await route.fulfill({ response });
      });
      await page.route("**/api/source-analysis/batches/*/sources", async (route) => {
        if (route.request().method() === "POST") order.push("source uploaded");
        await route.continue();
      });
      await variety.fill("손입력 온주밀감");
      await variety.blur();
      await saving;
      if (kind === "file") {
        const chooser = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "자료 파일 추가", exact: true }).click();
        await (await chooser).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
      } else {
        await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
        await page.getByLabel("첨부 내용", { exact: true }).fill("생산자가 직접 쓴 보관 안내");
        await page.getByLabel("첨부 내용", { exact: true }).blur();
      }
      // Keep the actual save in flight while the immediate attachment is queued.
      await page.waitForTimeout(400);
      expect(order).toEqual([]);
      release();
      await expect.poll(() => order).toEqual(["basic-info saved", "source uploaded"]);
      await expect(page.getByText("업로드 실패", { exact: true })).toHaveCount(0);
      await page.reload();
      await expect(variety).toHaveValue("손입력 온주밀감");
      await expect(page.getByTestId("source-material-box").getByTestId("attachment-tile")).toHaveCount(1);
      if (kind === "text") await expect(page.getByTestId("source-material-box")).toContainText("생산자가 직접 쓴 보관 안내");
      expect(order.filter((v) => v === "source uploaded")).toHaveLength(1);
      clean();
    });
  }
}

test("AC-SRC-5/11: failed basic-info save retains manual input and file for one explicit retry", async ({ page }) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true", "Requires enabled local source API");
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/new`);
  const variety = page.getByLabel("과일 품종명", { exact: true });
  await expect(variety).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const saving = new Promise<void>((resolve) => { started = resolve; });
  let saves = 0, uploads = 0;
  await page.route("**/api/source-analysis/batches/*/basic-info", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    if (++saves === 1) {
      started(); await gate;
      return route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "일시 저장 실패" } } });
    }
    await route.continue();
  });
  await page.route("**/api/source-analysis/batches/*/sources", async (route) => {
    if (route.request().method() === "POST") uploads++;
    await route.continue();
  });
  await variety.fill("직접 입력한 품종"); await variety.blur(); await saving;
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "자료 파일 추가", exact: true }).click();
  await (await chooser).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
  release();
  await expect(page.getByRole("button", { name: "다시 업로드", exact: true })).toBeVisible();
  await expect(variety).toHaveValue("직접 입력한 품종");
  expect(uploads).toBe(0);
  await page.getByRole("button", { name: "다시 업로드", exact: true }).click();
  await expect(page.getByRole("button", { name: "다시 업로드", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(variety).toHaveValue("직접 입력한 품종");
  await expect(page.getByTestId("source-material-box").getByTestId("attachment-tile")).toHaveCount(1);
  expect(uploads).toBe(1);
});
