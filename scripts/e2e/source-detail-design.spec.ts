import { test, expect } from "@playwright/test";
import { apiUrl, consumerUrl, monitor } from "./helpers";

// Only this response is a fixture; the real consumer route and shared renderer run.
// All values are explicitly fictional, never model outputs or production defaults.
const fields = [
  "hero",
  "summary",
  "composition",
  "pieceCount",
  "taste",
  "specification",
  "sizePhoto",
  "crossSectionPhoto",
  "qualityEvidence",
  "productionProcess",
  "packagePhoto",
  "delivery",
  "storage",
  "appearanceFaq",
  "support",
  "farmStory",
  "farmPhotos",
  "farmUpdates",
];
for (const width of [360, 390, 430]) {
  test(`AC-SRC-7/9 AC-TPL-4/5/10: source detail design and grounded content at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    const clean = monitor(page);
    const product = await (
      await page.request.get(`${apiUrl}/api/products/p-house`)
    ).json();
    const photo = `${consumerUrl}/photos/tangerine-box.jpg`;
    let modules = fields.map((id) => ({
      id,
      texts: [
        {
          fieldKey: id === "hero" ? "name" : id,
          value: `${id} 가상 검증 원문 <script>실행하지 않음</script>\n두 번째 문장도 보존합니다.`,
        },
      ],
      photos: [
        "hero",
        "crossSectionPhoto",
        "packagePhoto",
        "farmPhotos",
      ].includes(id)
        ? [{ uri: photo, alt: `${id} 가상 예시 사진` }]
        : [],
      illustrationId: id === "sizePhoto" ? "hand-citrus-medium" : null,
    }));
    await page.route(`${apiUrl}/api/products/p-house`, (route) =>
      route.fulfill({
        json: { ...product, moduleDetail: { schemaVersion: 1, modules } },
      }),
    );
    await page.goto(`${consumerUrl}/products/p-house`);
    const detail = page.getByTestId("source-detail");
    await expect(detail).toBeVisible();
    for (const module of modules)
      await expect(
        detail.getByText(module.texts[0].value, { exact: true }),
      ).toBeVisible();
    await expect(detail.locator("script")).toHaveCount(0);
    await expect(
      detail.locator('[data-testid^="source-heading-icon-"]'),
    ).toHaveCount(8);
    await expect(
      detail.getByText("크기 설명용 일러스트 · 실제 규격 아님", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(detail.getByText("18cm", { exact: true })).toBeVisible();
    await expect(
      detail.getByText("자료 입력 전", { exact: false }),
    ).toHaveCount(0);
    // A decoration must not invent three completed stages or their sequence.
    for (const claim of ["수확", "선별", "출하"])
      await expect(detail.getByText(claim, { exact: true })).toHaveCount(0);
    const panels = detail.getByTestId("source-photo-frame");
    await expect(panels).toHaveCount(4);
    await expect(detail.getByTestId("source-photo-panel")).toHaveCount(0);
    await expect(detail.getByTestId("source-size-panel").getByTestId("illustration-backdrop")).toHaveCSS(
      "background-color",
      "rgb(201, 79, 12)",
    );
    const sizePanel = detail.getByTestId("source-size-panel");
    await expect(sizePanel).toHaveCSS("padding-top", "28px");
    const handBox = await sizePanel.getByRole("img", { name: "설명용 감귤 크기 일러스트" }).boundingBox();
    expect(handBox).not.toBeNull();
    expect(handBox!.height).toBeCloseTo(handBox!.width, 0);
    expect(handBox!.height).toBeLessThan(width);
    expect((await sizePanel.boundingBox())!.height).toBeLessThan(width + 100);
    expect((await sizePanel.boundingBox())!.width).toBeCloseTo(width, 0);
    expect((await sizePanel.boundingBox())!.x).toBeCloseTo(0, 0);
    for (const panel of await panels.all()) {
      await expect
        .poll(() =>
          panel
            .locator("img")
            .evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            ),
        )
        .toBeTruthy();
      const geometry = await panel.evaluate((el) => {
        const style = getComputedStyle(el),
          img = el.querySelector("img")!;
        const host = img.parentElement!.getBoundingClientRect();
        return {
          border: style.borderLeftWidth,
          source: style.borderImageSource,
          padding: style.padding,
          background: style.backgroundColor,
          displayedRatio: host.width / host.height,
          originalRatio: img.naturalWidth / img.naturalHeight,
        };
      });
      expect(geometry.border).toBe("14px");
      expect(geometry.source).toContain("photo-frame");
      expect(geometry.padding).toBe("0px");
      expect(geometry.background).toBe("rgba(0, 0, 0, 0)");
      expect(geometry.displayedRatio).toBeCloseTo(geometry.originalRatio, 1);
    }
    await expect
      .poll(() =>
        detail
          .locator("img")
          .evaluateAll((images) =>
            images.every(
              (img) =>
                (img as HTMLImageElement).complete &&
                (img as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBeTruthy();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await detail.screenshot({ path: `.artifacts/source-design-${width}.png` });
    // Sparse input cannot resurrect demo sections or images; long text still wraps.
    modules = [
      {
        id: "storage",
        texts: [{ fieldKey: "storage", value: "긴원문".repeat(180) }],
        photos: [],
        illustrationId: null,
      },
    ];
    await page.reload();
    await expect(
      detail.getByText(modules[0].texts[0].value, { exact: true }),
    ).toBeVisible();
    await expect(
      detail.locator('[data-testid^="source-section-"]'),
    ).toHaveCount(1);
    await expect(detail.getByTestId("source-cover")).toHaveCount(0);
    await expect(detail.getByTestId("source-photo-frame")).toHaveCount(0);
    await expect(detail.getByTestId("source-size-panel")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    modules = [
      {
        id: "taste",
        texts: [{ fieldKey: "taste", value: " \n " }],
        photos: [],
        illustrationId: null,
      },
    ];
    await page.reload();
    await expect(detail).toHaveCount(0);
    clean();
  });
}

test("AC-07-2: generated meter accompanies only real Brix readings", async ({
  page,
}) => {
  const clean = monitor(page);
  const product = await (
    await page.request.get(`${apiUrl}/api/products/p-house`)
  ).json();
  let reading = {
    measuredBrix: 13.5 as number | null,
    measuredBrixAt: "2026-10-16T01:00:00Z" as string | null,
    expectedBrix: 12 as number | null,
  };
  await page.route(`${apiUrl}/api/products/p-house`, (route) =>
    route.fulfill({ json: { ...product, ...reading } }),
  );
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`${consumerUrl}/products/p-house`);
    const card = page.getByTestId("brix-reading");
    await expect(card.getByTestId("illustration-backdrop")).toHaveCSS(
      "background-color", "rgb(201, 79, 12)",
    );
    expect((await card.getByTestId("illustration-backdrop").boundingBox())!.width).toBeCloseTo(width, 0);
    await expect(card).toHaveCSS("padding-top", "28px");
    await expect(card).toHaveCSS("padding-bottom", "28px");
    await expect(
      card.getByText("당도 실측 13.5Brix", { exact: true }),
    ).toBeVisible();
    await expect(card.getByText(/측정$/)).toBeVisible();
    const image = card.getByTestId("brix-meter-illustration");
    await expect(image).toBeVisible();
    const imageBox = await image.boundingBox();
    const readingBox = await card
      .getByText("당도 실측 13.5Brix", { exact: true })
      .boundingBox();
    expect(imageBox).not.toBeNull();
    expect(readingBox).not.toBeNull();
    expect(imageBox!.height).toBeLessThanOrEqual(280);
    expect(imageBox!.width).toBeGreaterThanOrEqual(240);
    expect(Math.abs(imageBox!.x + imageBox!.width / 2 - width / 2)).toBeLessThan(2);
    expect(readingBox!.y).toBeGreaterThanOrEqual(imageBox!.y + imageBox!.height);
    await expect
      .poll(() =>
        image
          .locator("img")
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
      )
      .toBeTruthy();
    await card.scrollIntoViewIfNeeded();
    expect(
      await card.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBeTruthy();
    await page.screenshot({ path: `.artifacts/brix-meter-${width}.png` });
  }
  reading = { measuredBrix: 0, measuredBrixAt: null, expectedBrix: 12 };
  await page.reload();
  await expect(
    page
      .getByTestId("brix-reading")
      .getByText("당도 실측 0Brix", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("측정일 미등록", { exact: true })).toBeVisible();
  await expect(page.getByTestId("brix-meter-illustration")).toBeVisible();
  reading = { measuredBrix: null, measuredBrixAt: null, expectedBrix: 12 };
  await page.reload();
  await expect(
    page
      .getByTestId("brix-reading")
      .getByText("당도 예상 12Brix", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("brix-meter-illustration")).toHaveCount(0);
  await expect(page.getByTestId("brix-reading").getByTestId("illustration-backdrop")).toHaveCount(0);
  await expect(page.getByTestId("brix-reading")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  reading = { measuredBrix: null, measuredBrixAt: null, expectedBrix: null };
  await page.reload();
  await expect(
    page
      .getByTestId("brix-reading")
      .getByText("당도 예상 -Brix", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("brix-meter-illustration")).toHaveCount(0);
  clean();
});
