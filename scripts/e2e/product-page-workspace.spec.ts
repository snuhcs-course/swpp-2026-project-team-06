import { test, expect } from "@playwright/test";
import { producerUrl, loginProducer, monitor } from "./helpers";

test("AC-SRC-9: selling product edits remain private until explicit apply", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products?filter=selling`);
  // The default group is selling; use the product-specific action, never generic upload entry.
  const card = page
    .getByRole("button", { name: /하우스 감귤 5kg.*편집/ })
    .locator("..");
  await card
    .getByRole("button", { name: "판매페이지 수정", exact: true })
    .click();
  await expect(page).toHaveURL(/\/products\/p-house\/detail$/);
  await expect(
    page.getByText("현재 상품에 반영된 내용을 수정해요.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "설명 추가", exact: true }).click();
  const content = `판매페이지 수정 검증 ${Date.now()}`;
  await page.getByLabel("내용 1", { exact: true }).fill(content);
  await page.getByRole("button", { name: "수정본 저장", exact: true }).click();
  await expect(
    page.getByText("수정본을 저장했어요. 아직 상품에는 반영되지 않았어요.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("내용 1", { exact: true })).toHaveValue(content);
  await page.getByRole("button", { name: "미리보기", exact: true }).click();
  await expect(page.getByTestId("product-page-preview")).toContainText(content);
  await page.getByRole("button", { name: "상품에 반영", exact: true }).click();
  await expect(
    page.getByText("반영하면 구매자가 보는 판매페이지가 바로 바뀌어요.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "확인 · 상품에 반영", exact: true })
    .click();
  await expect(
    page.getByText("상품에 반영했어요.", { exact: true }),
  ).toBeVisible();
  clean();
});

for (const width of [360, 390, 430]) {
  test(`AC-SRC-11 ${width}px: heading visibility preserves excluded items through save and apply`, async ({
    page,
  }) => {
    test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
    const { execFileSync } = await import("node:child_process");
    const path = await import("node:path");
    execFileSync(
      path.resolve("server/.venv/bin/python"),
      [
        "-c",
        `
from tests import migrations_models
from app.core.db import get_sessionmaker
from app.catalog.models import Product
from app.source_analysis.models import ProductWorkspace
with get_sessionmaker()() as db:
 p = db.get(Product, 'p-house')
 p.module_detail = {'schemaVersion':1, 'modules':[{'id':k,'texts':[{'fieldKey':k,'value':v}],'photos':[]} for k,v in [('taste','달고 상큼해요'),('specification','중과'),('storage','서늘하게 보관')]]}
 p.version += 1
 row = db.get(ProductWorkspace, 'p-house')
 if row: db.delete(row)
 db.commit()
`,
      ],
      { cwd: path.resolve("server"), env: process.env },
    );
    await page.setViewportSize({ width, height: 900 });
    const clean = monitor(page);
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/products/p-house/detail`);
    const section = page.getByTestId("source-section-taste");
    const eye = section.getByRole("switch", {
      name: "맛과 크기 표시",
      exact: true,
    });
    const heading = section.getByRole("heading", {
      name: "맛과 크기",
      exact: true,
    });
    await expect(eye).toBeChecked();
    const eyeBox = await eye.boundingBox(),
      titleBox = await heading.boundingBox();
    expect(eyeBox!.x).toBeGreaterThanOrEqual(titleBox!.x + titleBox!.width);
    await expect(
      page.getByRole("button", { name: "+ 항목 추가", exact: true }),
    ).toHaveCount(0);
    expect(
      Math.abs(
        eyeBox!.y + eyeBox!.height / 2 - titleBox!.y - titleBox!.height / 2,
      ),
    ).toBeLessThan(2);
    await section
      .getByRole("button", { name: "규격 제외", exact: true })
      .click();
    await expect(page.getByTestId("canvas-content-specification")).toHaveCSS(
      "opacity",
      "0.45",
    );
    await eye.uncheck();
    await expect(heading).toHaveCSS("opacity", "0.35");
    await expect(page.getByLabel("맛과 향 내용", { exact: true })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "수정본 저장", exact: true })
      .click();
    await expect(
      page.getByText("수정본을 저장했어요. 아직 상품에는 반영되지 않았어요.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(eye).not.toBeChecked();
    await eye.check();
    await expect(heading).toHaveCSS("opacity", "1");
    await expect(page.getByLabel("맛과 향 내용", { exact: true })).toHaveValue(
      "달고 상큼해요",
    );
    await expect(page.getByTestId("canvas-content-specification")).toHaveCSS(
      "opacity",
      "0.45",
    );
    await page.getByLabel("규격 내용", { exact: true }).click();
    await expect(page.getByTestId("canvas-content-specification")).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(page.getByLabel("규격 내용", { exact: true })).toHaveValue(
      "중과",
    );
    await page.getByLabel("규격 내용", { exact: true }).fill("");
    expect(
      await page
        .getByLabel("규격 내용", { exact: true })
        .evaluate((el) => getComputedStyle(el, "::placeholder").color),
    ).toBe("rgb(181, 181, 181)");
    await page.getByLabel("맛과 향 내용", { exact: true }).fill("   ");
    await expect(heading).toHaveCSS("opacity", "0.35");
    await expect(eye).toBeChecked();
    await expect(page.getByLabel("규격 내용", { exact: true })).toHaveAttribute(
      "placeholder",
      "내용을 입력해주세요",
    );
    await expect(
      section.getByRole("button", { name: "규격 제외", exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("맛과 향 내용", { exact: true })
      .fill("달고 상큼해요");
    await expect(heading).toHaveCSS("opacity", "1");
    await page.getByLabel("규격 내용", { exact: true }).fill("중과");
    const removeBox = await section
      .getByRole("button", { name: "규격 제외", exact: true })
      .boundingBox();
    const subheadingBox = await section
      .getByRole("heading", { name: "규격", exact: true })
      .boundingBox();
    expect(Math.abs(removeBox!.y - subheadingBox!.y)).toBeLessThan(2);
    await section.screenshot({
      path: `.artifacts/section-editor-${width}.png`,
    });
    await eye.uncheck();
    await page
      .getByRole("button", { name: "수정본 저장", exact: true })
      .click();
    await expect(
      page.getByText("수정본을 저장했어요. 아직 상품에는 반영되지 않았어요.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "미리보기", exact: true }).click();
    await expect(page.getByTestId("product-page-preview")).not.toContainText(
      "맛과 크기",
    );
    await page
      .getByRole("button", { name: "상품에 반영", exact: true })
      .click();
    await page
      .getByRole("button", { name: "확인 · 상품에 반영", exact: true })
      .click();
    await expect(
      page.getByText("상품에 반영했어요.", { exact: true }),
    ).toBeVisible();
    const { apiUrl } = await import("./helpers");
    const product = await (
      await page.request.get(`${apiUrl}/api/products/p-house`)
    ).json();
    expect(
      product.moduleDetail.modules.map((m: { id: string }) => m.id),
    ).toEqual(["storage"]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    clean();
  });
}
