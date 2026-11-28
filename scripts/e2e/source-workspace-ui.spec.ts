import { test, expect } from "./fixtures";
import { loginProducer, producerUrl, monitor, openFreshComposer } from "./helpers";

// DEV-361 PR C: the 2-tab workspace screen is gone; `/products/source-analysis?batchId=` always opens the composer.
// The first test now checks the same compact attachment tiles and live analysis states in the composer's AI sheet.
for (const width of [360, 390, 430]) {
  test(`AC-SRC-1/4 DEV-361 ${width}px: compact files and live analysis status`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const clean = monitor(page);
    await loginProducer(page, "강영수");
    // A seeded pre-sale product: the composer opens a batch tied to exactly one product (DEV-361 C-18).
    const target = {
      id: "target-ui",
      name: "한라봉",
      productId: "p-hallabong",
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
              editorFields: [],
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
    // Sources live in the composer's AI sheet (DEV-184); it starts closed.
    await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
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
    // While analysing, the start button says so and cannot be pressed again.
    await expect(
      page.getByRole("button", { name: "AI가 작성 중이에요", exact: true }),
    ).toBeDisabled();
    await expect(page.getByTestId("product-photo-box")).not.toContainText(
      "감귤 사진.jpg",
    );
    await expect(page.getByTestId("source-material-box")).not.toContainText(
      "판매 안내.pdf",
    );
    await expect(
      page.getByRole("button", { name: /개인정보 가림/ }),
    ).toHaveCount(0);
    // The live status sits where the detail page goes, and the page cannot move on meanwhile.
    await page.getByRole("button", { name: "AI 시트 닫기", exact: true }).first().click();
    const banner = page.getByTestId("source-analysis-status");
    await expect(banner).toContainText(
      "AI가 자료를 보고 상세페이지를 쓰고 있어요. 잠시만 기다려 주세요.",
    );
    await expect(
      page.getByRole("button", { name: "다음: 판매·가격", exact: true }),
    ).toBeDisabled();
    status = "PRIVACY_REVIEW";
    // A run held for privacy review is not "writing": the banner goes and the sheet asks to cancel it first.
    await expect(banner).toHaveCount(0);
    await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
    await expect(
      page.getByText("이전 분석을 취소한 뒤 다시 시작해 주세요", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "이전 분석을 취소해 주세요", exact: true }),
    ).toBeDisabled();
    status = "SUCCEEDED";
    await expect(
      page.getByRole("button", { name: "AI로 다시 채우기", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText("AI가 다 채웠어요. 위에서 확인하고 고쳐 주세요.", { exact: true }),
    ).toBeVisible();
    await expect(banner).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    clean();
  });
}

test("AC-SRC-1 DEV-361: New Product opens uploads linked to a new private product", async ({
  page,
}) => {
  await loginProducer(page, "강영수");
  let creates = 0;
  let productId = "";
  await page.route(
    "**/api/source-analysis/product-workspaces",
    async (route) => {
      // Only creations count: the setup page itself reopens the product it was given (productId).
      if (route.request().method() !== "POST" || route.request().postDataJSON()?.productId) return route.continue();
      creates++;
      const response = await route.fetch();
      productId = (await response.json()).productId;
      await route.fulfill({ response });
    },
  );
  await page.goto(`${producerUrl}/products`);
  await page.getByRole("button", { name: "새 상품", exact: true }).click();
  // DEV-452 (PM 11/26): '새 상품' creates one private product and opens its combined setup page.
  await expect(page).toHaveURL(/product-setup\?id=/);
  await expect.poll(() => productId).toBeTruthy();
  expect(new URL(page.url()).searchParams.get("id")).toBe(productId);
  await expect(
    page.getByText("상세를 만들 상품 선택 (최대 10개)", { exact: true }),
  ).toHaveCount(0);
  expect(creates).toBe(1);
  // The one-screen composer (editing a draft) checks the empty product fields before 판매·가격.
  await openFreshComposer(page);
  await expect(page).toHaveURL(/composer=1/);
  await expect(page.getByLabel("상품명", { exact: true })).toHaveValue("");
  await page
    .getByRole("button", { name: "다음: 판매·가격", exact: true })
    .click();
  await expect(page).toHaveURL(/composer=1/);
  // DEV-361 C-23: the empty product fields are checked first (name, then variety), the cover photo after them
  await expect(page.getByTestId("invalid-field-name")).toBeVisible();
  await page.getByLabel("상품명", { exact: true }).fill("사진 없는 새 감귤");
  await page.getByLabel("품종명", { exact: true }).fill("온주밀감");
  await page.getByLabel("품종명", { exact: true }).blur();
  await page
    .getByRole("button", { name: "다음: 판매·가격", exact: true })
    .click();
  // DEV-452 decision 2A: with the required fields filled, '다음' saves and moves on; the representative
  // photo is required at the sale request.
  await expect(page).toHaveURL(/\/products\/[^/]+\/sell/);
  await expect(page.getByTestId("invalid-field-representativePhoto")).toHaveCount(0);
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
      // Only creations count: the setup page itself reopens the product it was given (productId).
      if (route.request().method() !== "POST" || route.request().postDataJSON()?.productId) return route.continue();
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
  // DEV-452: the retried workspace opens the combined setup page of that same product.
  await expect(page).toHaveURL(new RegExp(`product-setup\\?id=${firstProductId}`));
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
      await openFreshComposer(page);
      await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
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
      // DEV-179: the variety input lives in the AI sheet, collapsed once a source exists.
      await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
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
  await openFreshComposer(page);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
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
  // DEV-179: the variety input lives in the AI sheet, collapsed once a source exists.
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  await expect(variety).toHaveValue("직접 입력한 품종");
  await expect(page.getByTestId("source-material-box").getByTestId("attachment-tile")).toHaveCount(1);
  expect(uploads).toBe(1);
});
