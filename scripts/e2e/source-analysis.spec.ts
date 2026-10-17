import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  apiUrl,
  producerUrl,
  consumerUrl,
  loginProducer,
  monitor,
} from "./helpers";

const sourceEnabled = process.env.SOURCE_ANALYSIS_ENABLED === "true";
function work() {
  const cwd = path.resolve("server");
  execFileSync(
    path.join(cwd, ".venv/bin/python"),
    [
      "-c",
      "from app.source_analysis.worker import run_once;\nfor _ in range(100):\n if not run_once(): break",
    ],
    { cwd, env: process.env, timeout: 120000, stdio: "pipe" },
  );
}
for (const width of [360, 390, 430]) {
  test(`AC-SRC-1/2/7/8 ${width}px: upload, review, resume and apply`, async ({
    page,
  }) => {
    test.skip(
      !sourceEnabled,
      "Requires explicitly enabled local source API and worker database",
    );
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 850 });
    const clean = monitor(page);
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/products/source-analysis`);
    await page
      .getByRole("checkbox")
      .filter({ hasText: "하우스" })
      .first()
      .click();
    await page
      .getByRole("button", { name: "자료 작업 시작", exact: true })
      .click();
    await expect(page.getByText("분석 자료", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "텍스트 추가", exact: true })
      .click();
    await page
      .getByLabel("첨부 내용")
      .fill("테스트 감귤\n제주산 감귤입니다.\n서늘한 곳에 보관해 주세요.");
    await page.getByRole("button", { name: "내용 저장", exact: true }).click();
    await expect(page.getByText("source.txt", { exact: true })).toBeVisible();
    await expect(page.getByTestId("source-material-box")).toContainText(
      "source.txt",
    );
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "상품사진 추가", exact: true })
      .click();
    await (
      await chooser
    ).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
    await page
      .getByRole("button", { name: "어떤 사진인가요? 설명 추가", exact: true })
      .click();
    await page.getByLabel("첨부 내용").fill("배송 박스 포장");
    await page.getByRole("button", { name: "내용 저장", exact: true }).click();
    await expect(page.getByTestId("product-photo-box")).toContainText(
      "배송 박스 포장",
    );
    await page
      .getByRole("button", { name: "자료 준비·분석 시작", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "상세페이지 편집", exact: true }),
    ).toBeDisabled();
    work();
    await page
      .getByRole("button", { name: "상세페이지 편집", exact: true })
      .click();
    await expect(
      page.getByTestId("source-module-packagePhoto").getByRole("img"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "근거 검토", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("switch", { name: "한눈에 보기 표시", exact: true }),
    ).toBeChecked();
    await page
      .getByRole("button", { name: "한눈에 보기 편집", exact: true })
      .click();
    await expect(
      page.getByLabel("한눈에 보기 내용", { exact: true }),
    ).toHaveValue("제주산 감귤입니다.");
    await page
      .getByLabel("한눈에 보기 내용", { exact: true })
      .fill("제주산 감귤입니다. 수정 중");
    await page.getByRole("button", { name: "자료", exact: true }).click();
    await expect(
      page.getByText("저장하지 않은 내용을 닫을까요?"),
    ).toBeVisible();
    await page.getByRole("button", { name: "계속 편집", exact: true }).click();
    await page
      .getByLabel("한눈에 보기 내용", { exact: true })
      .fill("제주산 감귤입니다.");
    await page
      .getByRole("switch", { name: "보관 방법 표시", exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "비공개 저장", exact: true })
      .click();
    await expect(
      page.getByLabel("보관 방법 내용", { exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await page
      .getByRole("button", { name: "상세페이지 편집", exact: true })
      .click();
    await expect(
      page.getByRole("switch", { name: "보관 방법 표시", exact: true }),
    ).not.toBeChecked();
    await page
      .getByRole("button", { name: "보관 방법 편집", exact: true })
      .click();
    await page
      .getByRole("switch", { name: "보관 방법 표시", exact: true })
      .check();
    await expect(
      page.getByLabel("보관 방법 내용", { exact: true }),
    ).toHaveValue("서늘한 곳에 보관해 주세요.");
    await page
      .getByRole("button", { name: "비공개 저장", exact: true })
      .click();
    await expect(
      page.getByText(
        "비공개 초안을 저장했어요. 상품에는 아직 적용되지 않았어요.",
      ),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "상세페이지 편집", exact: true })
      .click();
    await page
      .getByRole("button", { name: "구매자 화면 미리보기", exact: true })
      .first()
      .click();
    await expect(page.getByText("제주산 감귤입니다.").last()).toBeVisible();
    await expect(
      page.getByTestId("source-module-packagePhoto").last().getByRole("img"),
    ).toBeVisible();
    const previewText = await page
      .getByTestId("source-detail")
      .last()
      .innerText();
    await expect(
      page.getByTestId("source-heading-icon-storage").last(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "상품 상세에 적용 검토", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "확인 · 상품 상세 적용", exact: true })
      .click();
    await expect(page.getByText("상품 상세에 적용했어요.")).toBeVisible();
    const product = await (
      await page.request.get(`${apiUrl}/api/products/p-house`)
    ).json();
    expect(
      product.moduleDetail.modules.find(
        (m: { id: string }) => m.id === "storage",
      ).texts[0].value,
    ).toBe("서늘한 곳에 보관해 주세요.");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `.artifacts/source-${width}.png`,
      fullPage: true,
    });
    await page.goto(`${consumerUrl}/products/p-house`);
    await expect(page.getByTestId("source-detail")).toHaveText(previewText, {
      useInnerText: true,
    });
    await expect(
      page.getByTestId("source-heading-icon-storage").last(),
    ).toBeVisible();
    clean();
  });
}
