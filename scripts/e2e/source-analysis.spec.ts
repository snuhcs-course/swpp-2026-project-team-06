import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  apiUrl,
  producerUrl,
  loginProducer,
  openFreshComposer,
  monitor,
} from "./helpers";

// DEV-361 PR C: the 2-tab workspace screen is gone; this flow now runs in the composer (`/products/new` → AI sheet →
// inline editor → '임시 저장' → '다음: 판매·가격' applies the page). Parts that only the 2-tab screen had:
// - the product picker / '자료 작업 시작' start screen: no composer equivalent (a batch now belongs to one product).
// - the tab-switch '저장하지 않은 내용을 닫을까요?' sheet: the composer saves on leave instead (covered by
//   "AC-SRC-11: Back saves name and variety without photo and acknowledges only successful storage" in producer-hardening).
// - the section show/hide switches ('상품 소개 표시', '보관 방법 표시'): the composer removes and re-adds a module
//   ('보관 방법 제외' / '보관 방법 추가') instead, exercised below; it shows a section switch only for an already hidden section.
// - applying to the selling p-house and comparing the consumer page with the preview: covered by
//   "DEV-171 DEV-361 AC-SRC-1/2/5/6/7/9/11 text: extracted draft to consumer" in producer-format-flow (a new product here is not public yet).

const sourceEnabled = process.env.SOURCE_ANALYSIS_ENABLED === "true";
function work(partial = false) {
  const cwd = path.resolve("server");
  execFileSync(
    path.join(cwd, ".venv/bin/python"),
    [
      "-c",
      (partial
        ? "from app.source_analysis import worker\n" +
          "original = worker.extract\n" +
          "def reply(*args, **kwargs):\n" +
          " result = original(*args, **kwargs)\n" +
          " bad = result.extraction.candidates[0].model_copy(deep=True)\n" +
          " bad.evidence[0].quote = 'invalid test quote'\n" +
          " result.extraction.candidates.append(bad)\n" +
          " return result\nworker.extract = reply\n"
        : "") +
        "from app.source_analysis.worker import run_once\nfor _ in range(100):\n if not run_once(): break",
    ],
    { cwd, env: process.env, timeout: 120000, stdio: "pipe" },
  );
}
for (const width of [360, 390, 430]) {
  test(`AC-SRC-1/2/7/8 DEV-361 ${width}px: upload, review, resume and apply`, async ({
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
    // DEV-452: '새 상품' opens the combined setup page; this flow is the composer of a draft.
    await openFreshComposer(page);
    await expect(page).toHaveURL(/composer=1/);
    const openSheet = () =>
      page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
    const closeSheet = () =>
      page.getByRole("button", { name: "AI 시트 닫기", exact: true }).first().click();
    await openSheet();
    await expect(page.getByText("분석 자료", { exact: true })).toBeVisible();
    await page.getByLabel("과일 품종명", { exact: true }).fill("온주밀감");
    await page.getByLabel("과일 품종명", { exact: true }).blur();
    await page
      .getByRole("button", { name: "텍스트 추가", exact: true })
      .click();
    await expect(
      page.getByTestId("source-material-box").getByLabel("첨부 내용"),
    ).toBeFocused();
    await page
      .getByLabel("첨부 내용")
      .fill("테스트 감귤\n제주산 감귤입니다.\n서늘한 곳에 보관해 주세요.");
    await page.getByLabel("첨부 내용").blur();
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
    await page.getByLabel("첨부 내용").blur();
    if (width === 360) {
      await page
        .getByRole("button", { name: "텍스트 추가", exact: true })
        .click();
      await page.getByLabel("첨부 내용").fill("삭제할 임시 자료");
      await page.getByLabel("첨부 내용").blur();
      await expect(page.getByLabel("첨부 내용")).toHaveCount(0);
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
      .getByRole("button", { name: "AI로 채우기", exact: true })
      .click();
    // While analysing the editor is replaced by the live status and the page cannot move on.
    await expect(page.getByTestId("source-analysis-status")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "다음: 판매·가격", exact: true }),
    ).toBeDisabled();
    work(width === 360);
    await expect(page.getByTestId("source-analysis-status")).toHaveCount(0, {
      timeout: 15000,
    });
    if (width === 360) {
      await openSheet();
      // 5617bc7b (DEV-452): the partial run is saved as a draft; the unfinished part can be redone.
      await expect(page.getByText("초안을 저장했어요. 원문을 확인하고 고쳐 주세요.")).toBeVisible();
      await expect(page.getByRole("button", { name: "미완료 부분 다시 처리", exact: true })).toBeVisible();
      await closeSheet();
    }
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
    // The composer shows a section switch only for a hidden section.
    await expect(
      page.getByRole("switch", { name: "상품 소개 표시", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("상품 소개 보충 내용", { exact: true }),
    ).toHaveValue("제주산 감귤입니다.");
    await expect(
      page.getByRole("button", {
        name: /^(한눈에 보기|보관 방법) (접기|펼치기)$/,
      }),
    ).toHaveCount(0);
    // Removing a module keeps its text: it is saved, survives reload and comes back when re-added.
    const storage = page.getByLabel("보관 방법 내용", { exact: true });
    await expect(storage).toHaveValue("서늘한 곳에 보관해 주세요.");
    await storage.focus();
    await page.getByRole("button", { name: "보관 방법 제외", exact: true }).click();
    await expect(storage).toHaveCount(0);
    const save = page.getByRole("button", { name: "임시 저장", exact: true });
    const saved = page.getByText(
      "비공개로 저장했어요. 상품에는 아직 적용되지 않았어요.",
      { exact: true },
    );
    await save.click();
    await expect(saved).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("product-detail-page")).toBeVisible();
    await expect(storage).toHaveCount(0);
    await page.getByRole("button", { name: "보관 방법 추가", exact: true }).click();
    await expect(storage).toHaveValue("서늘한 곳에 보관해 주세요.");
    await save.click();
    await expect(saved).toBeVisible();
    await page.reload();
    await expect(storage).toHaveValue("서늘한 곳에 보관해 주세요.");
    if (width === 360) {
      await openSheet();
      // DEV-287: retry is available without a cost-confirmation step.
      await expect(page.getByRole("checkbox", { name: /비용이 다시/ })).toHaveCount(0);
      await page.getByRole("button", { name: "미완료 부분 다시 처리", exact: true }).click();
      work();
      await expect(page.getByText("AI가 다 채웠어요. 위에서 확인하고 고쳐 주세요.")).toBeVisible({ timeout: 15000 });
      await closeSheet();
      await expect(page.getByLabel("상품 소개 보충 내용", { exact: true })).toHaveValue("제주산 감귤입니다.");
      await expect(storage).toHaveValue("서늘한 곳에 보관해 주세요.");
      await save.click();
      await expect(saved).toBeVisible();
    }
    await page
      .getByRole("button", { name: "구매자 화면 보기", exact: true })
      .click();
    // The page preview only (the AI sheet's hidden source tile quotes the same text)
    const preview = page.getByTestId("buyer-preview");
    await expect(preview.getByText("제주산 감귤입니다.", { exact: true })).toBeVisible();
    await expect(
      page
        .getByTestId("source-module-packagePhoto")
        .last()
        .getByTestId("source-photo-frame")
        .locator("img"),
    ).toBeVisible();
    await expect(
      page.getByTestId("source-heading-icon-storage").last(),
    ).toBeVisible();
    await page.getByRole("button", { name: "편집하기", exact: true }).click();
    // DEV-452 decision 2A: '다음' saves the page privately and moves on; the page is applied with the
    // sale request, not here.
    let applies = 0;
    page.on("request", (r) => { if (r.method() === "POST" && /\/drafts\/[^/]+\/apply$/.test(new URL(r.url()).pathname)) applies++; });
    const batchId = new URL(page.url()).searchParams.get("batchId")!;
    await page
      .getByRole("button", { name: "다음: 판매·가격", exact: true })
      .click();
    await expect(page).toHaveURL(/\/products\/[^/]+\/sell/);
    expect(applies).toBe(0);
    const productId = page.url().match(/products\/([^/?]+)\/sell/)![1];
    const token = await page.evaluate(
      () => Object.entries(localStorage).find(([k]) => /token/i.test(k))?.[1],
    );
    const product = await (
      await page.request.get(`${apiUrl}/api/products/mine/${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    expect(product.status).toBe("DRAFT");
    // The private draft keeps the edited page (storage re-added above).
    const drafts = await (
      await page.request.get(`${apiUrl}/api/source-analysis/batches/${batchId}/drafts`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    expect(JSON.stringify(drafts.items)).toContain("서늘한 곳에 보관해 주세요.");
    // A new product is visible to buyers only after approval.
    expect((await page.request.get(`${apiUrl}/api/products/${productId}`)).status()).toBe(404);
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
