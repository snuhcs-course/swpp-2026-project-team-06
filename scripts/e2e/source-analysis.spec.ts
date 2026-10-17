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
    await expect(
      page.getByRole("button", { name: "텍스트 내용 수정", exact: true }),
    ).toBeVisible();
    const excerpt = page
      .getByTestId("source-material-box")
      .getByText(/^\[/)
      .first();
    expect(
      await excerpt.evaluate((el) =>
        parseFloat(getComputedStyle(el).paddingTop),
      ),
    ).toBeLessThan(20);
    await expect(page.getByTestId("source-material-box")).not.toContainText(
      "source.txt",
    );
    await page
      .getByRole("button", { name: "텍스트 내용 수정", exact: true })
      .click();
    await expect(page.getByLabel("첨부 내용")).toHaveValue(
      "테스트 감귤\n제주산 감귤입니다.\n서늘한 곳에 보관해 주세요.",
    );
    await page.getByRole("button", { name: "취소", exact: true }).click();
    if (width === 360) {
      await page
        .getByRole("button", { name: "텍스트 추가", exact: true })
        .click();
      await page.getByLabel("첨부 내용").fill("삭제할 임시 자료");
      await page
        .getByRole("button", { name: "내용 저장", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "자료 삭제", exact: true }),
      ).toHaveCount(2);
      await page
        .getByRole("button", { name: "자료 삭제", exact: true })
        .last()
        .click();
      await expect(
        page.getByRole("button", { name: "자료 삭제", exact: true }),
      ).toHaveCount(1);
      await expect(page.getByLabel("첨부 내용")).toHaveCount(0);
    }
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "상품사진 추가", exact: true })
      .click();
    await (
      await chooser
    ).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
    await page
      .getByLabel("사진 한 줄 설명", { exact: true })
      .fill("배송 박스 포장");
    await expect(page.getByTestId("product-photo-box")).not.toContainText(
      "tangerine-box.jpg",
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
      page
        .getByTestId("source-module-packagePhoto")
        .getByTestId("source-photo-frame")
        .locator("img"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /사진 추가 제안/ }),
    ).toHaveCount(0);
    const nameInput = page.getByLabel("상품 이름 내용", { exact: true });
    await expect(nameInput).toHaveCSS("text-align", "center");
    await expect(page.getByLabel("상품 소개 내용", { exact: true })).toHaveCSS(
      "text-align",
      "center",
    );
    const nameBox = await nameInput.boundingBox();
    const coverBox = await page.getByTestId("source-cover").boundingBox();
    expect(
      Math.abs(
        nameBox!.x + nameBox!.width / 2 - coverBox!.x - coverBox!.width / 2,
      ),
    ).toBeLessThan(2);
    await expect(
      page.getByRole("button", { name: "근거 검토", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("switch", { name: "상품 소개 표시", exact: true }),
    ).toBeChecked();
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
    await expect(
      page.getByText("저장하지 않은 내용을 닫을까요?", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("한눈에 보기 내용", { exact: true })
      .fill("제주산 감귤입니다.");
    await expect(
      page.getByRole("button", {
        name: /^(한눈에 보기|보관 방법) (접기|펼치기)$/,
      }),
    ).toHaveCount(0);
    if (width === 360) {
      const visibility = page.getByRole("switch", {
        name: "상품 소개 표시",
        exact: true,
      });
      await visibility.focus();
      await visibility.press("Space");
      await expect(visibility).not.toBeChecked();
      await expect(
        page.getByLabel("한눈에 보기 내용", { exact: true }),
      ).toHaveCount(0);
      await visibility.press("Enter");
      await expect(visibility).toBeChecked();
    }
    await page
      .getByRole("switch", { name: "보관 방법 표시", exact: true })
      .uncheck();
    await expect(
      page
        .getByTestId("source-section-storage")
        .getByRole("heading", { name: "보관 방법" }),
    ).toHaveCSS("opacity", "0.35");
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
    await expect(
      page.getByRole("switch", { name: "보관 방법 표시", exact: true }),
    ).toBeChecked();
    await page
      .getByRole("button", { name: "구매자 화면 미리보기", exact: true })
      .first()
      .click();
    await expect(page.getByText("제주산 감귤입니다.").last()).toBeVisible();
    await expect(
      page
        .getByTestId("source-module-packagePhoto")
        .last()
        .getByTestId("source-photo-frame")
        .locator("img"),
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
