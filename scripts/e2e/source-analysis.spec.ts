import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { apiUrl, producerUrl, loginProducer, monitor } from "./helpers";

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
    await expect(page.getByText("자료 추가", { exact: true })).toBeVisible();
    await page
      .getByLabel("판매 문구 붙여넣기")
      .fill("테스트 감귤\n제주산 감귤입니다.\n서늘한 곳에 보관해 주세요.");
    await page.getByRole("button", { name: "문구 추가", exact: true }).click();
    await expect(page.getByText("source.txt", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "자료 준비·분석 시작", exact: true })
      .click();
    await expect(page.getByText(/대기 ·/)).toBeVisible();
    work();
    await page
      .getByRole("button", { name: "분석 결과 불러오기", exact: true })
      .click();
    for (const section of ["한눈에 보기", "보관 방법"]) {
      await page
        .getByRole("button", { name: `${section} 근거·내용 편집`, exact: true })
        .click();
      await page
        .getByRole("button", { name: "이 근거 사용", exact: true })
        .click();
      await page.getByRole("button", { name: "편집 닫기", exact: true }).click();
      await expect(page.getByText("저장하지 않은 내용을 닫을까요?")).toBeVisible();
      await page.getByRole("button", { name: "계속 편집", exact: true }).click();
      await page
        .getByRole("button", { name: "확정 저장", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "확정 저장", exact: true }),
      ).toHaveCount(0);
    }
    await page.getByRole("button", { name: "상세 편집", exact: true }).click();
    await page.getByRole("button", { name: /비공개 초안 저장$/ }).click();
    await expect(
      page.getByText(
        "비공개 초안을 저장했어요. 상품에는 아직 적용되지 않았어요.",
      ),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "상세 편집", exact: true }).click();
    await page
      .getByRole("button", { name: "구매자 화면 미리보기", exact: true })
      .click();
    await expect(page.getByText("제주산 감귤입니다.").last()).toBeVisible();
    await page
      .getByRole("button", { name: "상품 상세에 적용 검토", exact: true })
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
    clean();
  });
}
