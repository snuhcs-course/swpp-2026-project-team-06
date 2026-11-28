import { test, expect, type Page } from "./fixtures";
import { apiUrl, loginProducer, producerUrl, monitor } from "./helpers";

// DEV-361 PR C: `/products/source-analysis?batchId=…` always opens the composer; the 2-tab workspace screen was deleted.
// DEV-361 PR C: removed the "workspace" variants of "accepts an older review response", "hides provenance controls while preserving
//   returned evidence", "opens all conflicting text choices before field focus", "buyer preview keeps URL and unsaved edits",
//   "explains why analysis cannot start without sources", "retains server refresh after a network failure" and "retries definite and
//   uncertain failures without consent and guards repeated clicks" (2-tab screen only; covered by the composer variant of the same test).
// DEV-361 PR C: removed "DEV-179 AC-SRC-11: workspace preview omits an excluded hero field while keeping its confirmed sibling"
//   (2-tab screen only; covered by "DEV-179 AC-SRC-11: composer preview preserves excluded summary and retains the enabled taste field").
// DEV-361 PR C: the per-file run notes of the 2-tab run panel (refine codes, extraction errors with the file name, PDF skipped pages,
//   empty chunks, rejected candidates, REFINE_INPUT_LIMIT, failed page numbers) moved to the composer AI sheet's run panel (C-25) and are
//   asserted there. Coverage dropped with the screen (no composer equivalent): the multi-product exclusion queue (the composer opens one
//   product only, C-18).

const uncertainRetryCost = "결과가 불명확한 요청을 재시도하면 비용이 다시 발생할 수 있음을 확인했어요";
const retryCost = "다시 분석하면 비용이 다시 들 수 있어요. 확인했어요.";

function reviewFixture() {
  // DEV-346: a not-yet-selling product; selling products lock the composer's product fields.
  const target = { id: "target", name: "회귀 감귤", productId: "p-hallabong",
    basicInfo: { variety: "온주밀감", size: "중과", expectedBrix: null } };
  const source = { id: "anchor", filename: "원문자료.txt", mime: "text/plain",
    targetIds: [target.id], common: false, originalPhoto: false, revision: 1,
    sanitizationVersion: 1, privacyApproved: true, status: "PREPARED", pageCount: 1, error: null };
  const field = { targetId: target.id, fieldKey: "summary", value: "제주에서 자란 감귤",
    state: "UNREVIEWED", provenance: "REFINED", candidateIds: [], photoAssetIds: [], illustrationId: null };
  return {
    batch: { id: "review-fixes", version: 1, reviewVersion: 1, targets: [target], sources: [source] },
    review: { reviewVersion: 1, targets: [target], candidates: [] as {
      id: string; targetId: string | null; fieldKey: string; value: string;
      candidateIds: string[]; evidence: []; historical: boolean; outdated: boolean;
    }[], fields: [], conflicts: [], sourcePhotoRequests: [],
      editorFields: [{ status: "ready", field },
        { status: "ready", field: { ...field, fieldKey: "taste", value: "달콤한 과즙" } }],
      refinementResults: {} as Record<string, unknown> | undefined },
    run: { id: "run", mode: "mock", model: "mock", status: "SUCCEEDED", completed: 1, total: 1,
      inputs: [{ id: source.id, revision: 1, description: "" }], items: [
      { id: "refine", phase: "REFINE", assetId: source.id, revision: 1, status: "SUCCEEDED",
        error: null as string | null, acceptedCount: 1, rejectedCount: 0,
        emptyReason: null as string | null, candidatesSkipped: 0 },
    ] },
    text: "제주에서 자란 감귤\n달콤한 과즙",
  };
}

// Stubs every batch endpoint the producer screens read, with the shapes of packages/api/src/sourceAnalysis.ts.
async function serveReview(page: Page, fixture: ReturnType<typeof reviewFixture>) {
  await page.route("**/api/source-analysis/batches/review-fixes**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const sub = pathname.split("/batches/review-fixes")[1] ?? "";
    const sourceId = fixture.batch.sources[0].id;
    const json = sub === "/review" ? fixture.review
      : sub === "/runs" ? { items: [fixture.run] }
      : sub === "/drafts" ? { items: [] }
      : sub === `/sources/${sourceId}/text` ? { text: fixture.text, sourceVersion: 1 }
      : sub === `/sources/${sourceId}/pages/1` ? { sourceRevision: 1, sanitizationVersion: 1,
          privacyApproved: true, spans: [], redactedSpans: [], redactions: [], hasImage: false }
      : sub === "" || sub === "/" ? fixture.batch
      : null;
    if (json === null || route.request().method() !== "GET")
      return route.fulfill({ status: 404, json: { detail: `unstubbed ${route.request().method()} ${sub}` } });
    return route.fulfill({ json });
  });
}

test("DEV-186 DEV-361 AC-SRC-5/11: composer refine messages have no file failure", async ({ page }) => {
    test.setTimeout(120000);
    const clean = monitor(page);
    await loginProducer(page, "강영수");
    const fixture = reviewFixture();
    await serveReview(page, fixture);
    const url = `${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`;
    const openRunPanel = async () => {
      await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
    };
    await page.goto(url);
    await openRunPanel();
    await expect(page.getByText("AI가 다 채웠어요. 위에서 확인하고 고쳐 주세요. · 테스트 결과", { exact: true })).toBeVisible();
    await expect(page.getByText(/자료를 처리하지 못했어요/)).toHaveCount(0);
    // Even a stale success error from a previous response is not a failed file.
    fixture.run.items[0].error = "REFINED_TEXTS_REJECTED";
    await page.reload();
    await openRunPanel();
    await expect(page.getByText(/AI가 다 채웠어요/)).toBeVisible();
    await expect(page.getByText(/자료를 처리하지 못했어요/)).toHaveCount(0);
    fixture.run.status = "PARTIAL";
    fixture.run.items[0].status = "FAILED";
    await page.reload();
    await openRunPanel();
    await expect(page.getByText("초안을 저장했어요. 원문을 확인하고 고쳐 주세요. · 테스트 결과", { exact: true })).toBeVisible();
    // DEV-452 (5617bc7b): a failed wording pass is optional and does not offer a reading retry.
    await expect(page.getByRole("button", { name: "미완료 부분 다시 처리", exact: true })).toHaveCount(0);
    await expect(page.getByText(/\.(?:pdf|txt): /)).toHaveCount(0);
    // DEV-361 C-25: the AI sheet's run panel shows the per-file notes the 2-tab screen had. Refine messages never
    // blame the source file; extraction errors keep the file name.
    const messages = {
      SOURCE_CHANGED: "자료가 바뀌어 문구 정리를 사용하지 않았어요. 다시 분석해 주세요.",
      PRIVACY_CHANGED: "가림 내용이 바뀌어 문구 정리를 사용하지 않았어요. 확인 후 다시 분석해 주세요.",
      PROMPT_CHANGED: "문구 정리 방식이 바뀌었어요. 다시 분석해 주세요.",
      INVALID_MODEL_OUTPUT: "문구 정리 결과를 읽지 못해 원문 그대로 보여 드려요.",
      INCOMPLETE_OR_REFUSED: "문구 정리를 마치지 못해 원문 그대로 보여 드려요.",
      REQUEST_UNCERTAIN: "문구 정리 요청의 완료 여부를 확인하지 못해 원문 그대로 보여 드려요.",
      PROVIDER_REJECTED: "문구 정리 요청이 거절되어 원문 그대로 보여 드려요.",
      PROVIDER_AUTH: "AI 연결 설정에 문제가 있어 문구 정리 대신 원문 그대로 보여 드려요. 운영팀에 알려 주세요.",
      FIXTURE_REFINE_FAILED: "문구 정리에 실패해서 원문 그대로 보여 드려요.",
    };
    const status = page.getByText("초안을 저장했어요. 원문을 확인하고 고쳐 주세요. · 테스트 결과", { exact: true });
    for (const [code, message] of Object.entries(messages)) {
      fixture.run.items[0].error = code;
      await page.reload();
      await openRunPanel();
      await expect(status).toBeVisible();
      await expect(page.getByText(message, { exact: true })).toBeVisible();
      await expect(page.getByText(`${fixture.batch.sources[0].filename}: ${message}`, { exact: true })).toHaveCount(0);
      await expect(page.getByText(/자료를 처리하지 못했어요/)).toHaveCount(0);
    }
    // Extraction errors retain their source-file attribution.
    fixture.run.items[0].phase = "EXTRACT";
    fixture.run.items[0].error = "UNKNOWN_MOCK_SOURCE";
    await page.reload();
    await openRunPanel();
    await expect(page.getByText("원문자료.txt: 테스트 환경에서 지원하지 않는 자료예요.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "미완료 부분 다시 처리", exact: true })).toBeEnabled();
    fixture.run.items[0].error = "PROVIDER_AUTH";
    await page.reload();
    await openRunPanel();
    await expect(page.getByText("원문자료.txt: AI 연결 설정에 문제가 있어요. 운영팀에 알려 주세요.", { exact: true })).toBeVisible();
    clean();
  });

test("DEV-186 DEV-361 AC-SRC-3/11: candidate buttons hide money and health, retain product and platform text", async ({ page }) => {
  const clean = monitor(page);
  page.on("dialog", (dialog) => dialog.accept());
  await loginProducer(page, "강영수");
  const fixture = reviewFixture();
  fixture.review.candidates = ["32,000원", "면 역 력 증진", "서늘한 곳에 보관", "고객센터 평일 운영"].map((value, i) => ({
    id: `c${i}`, targetId: i % 2 ? null : "target", fieldKey: "summary", value,
    candidateIds: [`c${i}`], evidence: [], historical: false, outdated: false,
  }));
  await serveReview(page, fixture);
  for (const status of ["conflict", "outdated", "unassigned"]) {
    fixture.review.editorFields[0].status = status;
    // The composer shows the page editor in place (no 상세페이지 편집 tab).
    await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`);
    await page.getByLabel("상품 소개 보충 내용", { exact: true }).click();
    await expect(page.getByText("내용 확인 필요 · 사용할 문구를 선택하거나 직접 수정해 주세요.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "32,000원", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "면 역 력 증진", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "서늘한 곳에 보관", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "고객센터 평일 운영", exact: true }).click();
    await expect(page.getByLabel("상품 소개 보충 내용", { exact: true })).toHaveValue("고객센터 평일 운영");
    // Reload resets the dirty editor without going through a navigation guard.
    await page.reload();
  }
  clean();
});

test("DEV-186 AC-SRC-3/11: composer hints apply to story inputs only", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = reviewFixture();
  await serveReview(page, fixture);
  await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`);
  const value = "피로회복 32,000원 고객센터";
  const hints = ["금액은 다음 단계(판매·가격)에서 직접 채워 주세요", "건강 효능 문구는 넣을 수 없어요",
    "팜클럽 공통 정책과 겹치는 문구인지 확인해 주세요"];
  await page.getByText("상품정보", { exact: true }).click();
  for (const label of ["상품명", "과일 품종명", "사이즈", "측정 당도 (°Bx)", "원산지", "보관"]) {
    if (label === "과일 품종명")
      await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
    const input = page.getByLabel(label, { exact: true });
    const original = await input.inputValue();
    for (const text of ["32,000원", "피로회복", "고객센터"]) {
      await input.fill(text);
      await expect(input).toHaveValue(text);
      for (const hint of hints) await expect(page.getByText(hint, { exact: true })).toHaveCount(0);
    }
    await input.fill(original);
    if (label === "과일 품종명")
      await page.getByRole("button", { name: "AI 시트 닫기", exact: true }).last().click();
  }
  await page.getByLabel("상품 소개 보충 내용", { exact: true }).fill(value);
  for (const hint of hints) await expect(page.getByText(hint, { exact: true })).toBeVisible();
  clean();
});

// DEV-361 PR C: the composer opens one product, so the 2-tab screen's multi-product queue is gone (coverage dropped, see top).
// The single-product part — the modal's reason texts, acknowledgement and the chip — is checked in the composer.
test("DEV-186 DEV-361 AC-SRC-1/2/11: product exclusions open one modal with the reasons and stay acknowledged", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  const target = fixture.batch.targets[0];
  fixture.review.refinementResults = { [target.id]: {
    refinementVersion: "version-target",
    excluded: [
      { candidateId: "c-target", value: "반품 배송비 5,000원", reason: "price" },
      { candidateId: "p-target", value: "1-3일 이내 도착", reason: "period" },
      { candidateId: "s-target", value: "고객센터 평일 10시~5시", reason: "platform" },
    ],
  } };
  const storageKey = `farmclub-producer:excluded-seen:u-kang:${fixture.batch.id}:${target.id}`;
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  const modal = page.getByTestId("excluded-modal");
  await expect(modal).toHaveCount(1);
  // One product: no product-name prefix
  await expect(modal).toContainText("이 정보들은 상세 페이지에 못 넣어서 빼 뒀어요 🙂");
  await expect(modal).not.toContainText(`${target.name} · `);
  await expect(modal.getByText("가격·배송비는 다음 단계(판매·가격)에서 직접 정해 주세요.", { exact: true })).toBeVisible();
  await expect(modal.getByText("판매 기간이나 받는 날은 다음 단계(판매·가격)에서 정해요.", { exact: true })).toBeVisible();
  await expect(modal.getByText("교환·환불·문의는 팜클럽이 같은 기준으로 안내해 드려요.", { exact: true })).toBeVisible();
  await expect(modal.getByText("출하 전 취소는 전액 환불, 배송 후 하자는 교환·환불이에요.", { exact: true })).toBeVisible();
  await expect(modal.getByTestId("excluded-item-platform")).toHaveText("고객센터 평일 10시~5시");
  // Presenting the modal does not acknowledge it.
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("version-target");
  // Parent input edits recreate the products array; an unchanged result stays acknowledged.
  const summary = page.getByLabel("상품 소개 보충 내용", { exact: true }).first();
  await summary.fill("화면을 다시 그려도 확인한 제외 결과는 열리지 않아요");
  await expect(summary).toHaveValue("화면을 다시 그려도 확인한 제외 결과는 열리지 않아요");
  await expect(modal).toHaveCount(0);
  const chip = page.getByRole("button", { name: "AI가 뺀 문구 3개", exact: true });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(modal).toHaveCount(1);
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept()); // the unsaved summary edit asks before reload
  await page.reload();
  await expect(page.getByTestId("excluded-chip")).toHaveCount(1);
  await expect(modal).toHaveCount(0);
  clean();
});

// A legacy block story is read-only in the product-only composer and edited via '상세 고치기'.
// Keep this fixture independent of earlier tests that publish section/module stories to p-house.
test("DEV-186 DEV-361 AC-SRC-11: existing product canvas has no next-step story hints", async ({ page }) => {
  // The product-only composer asks for the product draft; a server without one answers 400/404 (direct apply, C-2).
  const clean = monitor(page, [/status of 40[04]/]);
  await loginProducer(page, "강영수");
  // No composer flag keeps the legacy/direct-product entry under test.
  const snapshot = { representativeUri: null, kind: "blocks", hiddenSectionIds: [],
    content: { blocks: [] }, modules: [] };
  await page.route("**/api/source-analysis/product-workspaces", (route) => route.fulfill({
    json: { productId: "p-house", batchId: "detail-batch", targetId: "detail-target",
      version: 1, baseProductVersion: 1, hasUnpublishedChanges: false,
      snapshot, publishedSnapshot: snapshot },
  }));
  await page.route("**/api/products/mine/p-house", async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.fulfill({ response, json: { ...await response.json(), moduleDetail: null, detailContent: null } });
  });
  await page.route("**/api/source-analysis/product-workspaces/p-house/product-draft", (route) => route.fulfill({
    status: 404, json: { code: "NOT_FOUND", message: "테스트: 상품 초안 API 없음", details: {} },
  }));
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await expect(page.getByTestId("product-basic-info")).toBeVisible();
  await expect(page).not.toHaveURL(/composer=1/);
  await expect(page.getByRole("button", { name: "AI 시트 열기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "상세 고치기", exact: true })).toBeVisible();
  await expect(page.getByTestId("product-detail-page")).toBeVisible();
  // No editable story canvas, so no story hints
  await expect(page.getByLabel("상품 소개 보충 내용", { exact: true })).toHaveCount(0);
  await expect(page.getByText("금액은 다음 단계(판매·가격)에서 직접 채워 주세요", { exact: true })).toHaveCount(0);
  await expect(page.getByText("건강 효능 문구는 넣을 수 없어요", { exact: true })).toHaveCount(0);
  await expect(page.getByText("팜클럽 공통 정책과 겹치는 문구인지 확인해 주세요", { exact: true })).toHaveCount(0);
  clean();
});

test("DEV-186 DEV-361 AC-SRC-5/11: composer accepts an older review response", async ({ page }) => {
    const clean = monitor(page);
    await loginProducer(page, "강영수");
    const fixture = reviewFixture();
    fixture.review.refinementResults = undefined;
    await serveReview(page, fixture);
    await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`);
    const summary = page.getByLabel("상품 소개 보충 내용", { exact: true });
    await expect(summary).toHaveValue("제주에서 자란 감귤");
    await summary.fill("직접 고친 설명");
    await expect(summary).toHaveValue("직접 고친 설명");
    await expect(page.getByTestId("excluded-chip")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // FillInput retains the page layout: the product heading input has no extra wrapper.
    const title = page.getByLabel("상품명", { exact: true });
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS("background-color", "rgb(255, 247, 235)");
    clean();
  });

// DEV-287: the composer shows a concise status instead of internal file/chunk diagnostics. The 2-tab screen's per-file notes
// (skipped PDF pages, empty chunks, rejected candidates, input limit, failed pages) were deleted with it (DEV-361 PR C).
// DEV-361 C-25: the composer's AI sheet run panel shows the same per-file notes the 2-tab screen did.
test(`DEV-182 DEV-361 AC-SRC-8: composer shows PDF skipped pages`, async ({ page }) => {
  await loginProducer(page, "강영수");
  const fixture = reviewFixture();
  fixture.batch.sources[0].filename = "합성25쪽.pdf";
  fixture.batch.sources[0].mime = "application/pdf";
  fixture.batch.sources[0].pageCount = 20;
  fixture.run.items[0] = { ...fixture.run.items[0], id: "prepare", phase: "PREPARE",
    ...{ pagesAnalysed: 20, pagesSkipped: 5 } };
  await serveReview(page, fixture);
  await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  await expect(page.getByText("합성25쪽.pdf: 앞 20쪽만 분석했어요. 나머지 5쪽은 필요하면 나눠서 올려 주세요.", { exact: true })).toBeVisible();
  await expect(page.getByText(/자료를 처리하지 못했어요/)).toHaveCount(0);
});

test(`DEV-182 DEV-361 AC-SRC-5/8: composer empty chunks do not imply an empty file`, async ({ page }) => {
  await loginProducer(page, "강영수");
  const fixture = reviewFixture();
  fixture.batch.sources[0].filename = "긴합성자료.txt";
  fixture.text = "감귤 구성과 보관 방법\n" + "구분선과 여백\n".repeat(800);
  const base = { ...fixture.run.items[0], phase: "EXTRACT" };
  // run_view suppresses the middle chunk's private NO_CANDIDATES reason when
  // other chunks contain facts. The API regression covers that aggregation.
  fixture.run.items = [
    { ...base, id: "chunk-1", acceptedCount: 1 },
    { ...base, id: "chunk-2", acceptedCount: 0 },
    { ...base, id: "chunk-3", acceptedCount: 1 },
    fixture.run.items[0],
  ];
  await serveReview(page, fixture);
  const url = `${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`;
  await page.goto(url);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  await expect(page.getByText(/추출할 내용을 찾지 못했어요/)).toHaveCount(0);
  // Keep the zero-candidate REFINE item, as returned by the real pipeline.
  const extracts = fixture.run.items.slice(0, 3);
  const refine = { ...fixture.run.items[3], acceptedCount: 0, emptyReason: null };
  for (const [reason, message] of [
    ["NO_CANDIDATES", "추출할 내용을 찾지 못했어요. 원문을 확인해 주세요."],
    ["NO_SAFE_TEXT", "분석할 텍스트가 없어요. 자료 내용을 확인해 주세요."],
  ]) {
    fixture.run.items = [
      ...extracts.map((item, index) => ({
        ...item, acceptedCount: 0, emptyReason: index === 0 ? reason : null,
      })),
      refine,
    ];
    await page.reload();
    await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
    await expect(page.getByText(`긴합성자료.txt: ${message}`, { exact: true })).toHaveCount(1);
    await expect(page.getByText(/추출할 내용을 찾지 못했어요|분석할 텍스트가 없어요/)).toHaveCount(1);
    await expect(page.getByText(message, { exact: true })).toHaveCount(0);
    await expect(page.getByText(/이 상품에 연결된 내용을 찾지 못했어요|상세에 넣을 수 있는 문구가 남지 않았어요/)).toHaveCount(0);
  }
});

test(`DEV-182 DEV-361 AC-SRC-5/8: composer rejected and oversized notices`, async ({ page }) => {
  await loginProducer(page, "강영수");
  const fixture = reviewFixture();
  fixture.run.status = "PARTIAL";
  fixture.run.items[0] = { ...fixture.run.items[0], phase: "EXTRACT", status: "PARTIAL",
    error: "CANDIDATES_REJECTED", acceptedCount: 2, rejectedCount: 1 };
  await serveReview(page, fixture);
  const url = `${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`;
  const open = async () => {
    await page.goto(url);
    await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  };
  await open();
  await expect(page.getByText("원문자료.txt: 근거를 확인하지 못한 후보 1개는 제외했어요. 원문을 확인해 주세요.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "미완료 부분 다시 처리", exact: true })).toBeEnabled();
  await expect(page.getByText("원문자료.txt: 근거를 확인하지 못한 후보 1개는 제외했어요. 원문을 확인해 주세요.", { exact: true })).toHaveCount(1);
  await expect(page.getByText(/근거를 확인하지 못한/)).toHaveCount(1);
  await expect(page.getByText("원문자료.txt: 근거를 확인하지 못한 내용은 제외했어요. 원문을 확인해 주세요.", { exact: true })).toHaveCount(0);
  fixture.run.items[0] = { ...fixture.run.items[0], status: "FAILED", acceptedCount: 0,
    emptyReason: "ALL_CANDIDATES_REJECTED" };
  await open();
  await expect(page.getByText("원문자료.txt: 근거를 확인하지 못한 내용은 제외했어요. 원문을 확인해 주세요.", { exact: true })).toBeVisible();
  await expect(page.getByText("원문자료.txt: 근거를 확인하지 못한 내용은 제외했어요. 원문을 확인해 주세요.", { exact: true })).toHaveCount(1);
  await expect(page.getByText(/근거를 확인하지 못한 후보/)).toHaveCount(0);
  await expect(page.getByText(/근거를 확인하지 못한/)).toHaveCount(1);
  await expect(page.getByText(/추출한 내용의 근거를 확인하지 못했어요/)).toHaveCount(0);
  fixture.run.items[0] = { ...fixture.run.items[0], phase: "REFINE", status: "SUCCEEDED",
    error: null, rejectedCount: 0, emptyReason: "REFINE_INPUT_LIMIT", candidatesSkipped: 1 };
  await open();
  await expect(page.getByText("내용이 많아 문구를 정리하지 못했어요. 자료를 나눠서 올려 주세요.", { exact: true })).toBeVisible();
  await expect(page.getByText(/상세에 넣을 수 있는 문구가 남지 않았어요/)).toHaveCount(0);
});

test(`DEV-190 DEV-361 AC-SRC-5/8: composer shows each partial page and chunk note once per file`, async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = reviewFixture();
  // Only the filename matters for the note; keep the stubbed text source so no page images load.
  fixture.batch.sources[0].filename = "합성부분자료.pdf";
  fixture.run.status = "PARTIAL";
  const extract = { ...fixture.run.items[0], id: "ocr", phase: "EXTRACT", status: "PARTIAL",
    error: "REQUEST_UNCERTAIN", acceptedCount: 2, emptyReason: "NO_CANDIDATES",
    ...{ pagesEmpty: 1, pagesFailed: 2, chunksFailed: 0 } };
  fixture.run.items = [extract, fixture.run.items[0]];
  await serveReview(page, fixture);
  const url = `${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`;
  const open = async () => {
    await page.goto(url);
    await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  };
  const retry = page.getByRole("button", { name: "미완료 부분 다시 처리", exact: true });
  const consent = (uncertain = false) => page.getByRole("checkbox", {
    name: uncertain ? uncertainRetryCost : retryCost, exact: true,
  });
  await open();
  await expect(consent(true)).toHaveCount(0);
  const note = page.getByText("합성부분자료.pdf: 2쪽을 읽지 못했어요. 다시 분석해 보세요.", { exact: true });
  await expect(note).toBeVisible();
  await expect(note).toHaveCount(1);
  await expect(page.getByText(/분석 요청의 완료 여부를 확인하지 못했어요|추출할 내용을 찾지 못했어요|자료를 처리하지 못했어요/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "미완료 부분 다시 처리", exact: true })).toBeEnabled();
  // Known per-page errors show the same single note; skipped empty pages are quiet.
  fixture.run.items[0] = { ...extract, error: "OCR_PAGES_FAILED" };
  await open();
  await expect(note).toHaveCount(1);
  await expect(consent()).toHaveCount(0);
  await expect(retry).toBeEnabled();
  await expect(retry).toBeEnabled();
  // A failed extraction chunk does not label a successfully transcribed page as unread.
  const chunkNote = page.getByText("합성부분자료.pdf: 일부 내용을 읽지 못했어요. 다시 분석해 보세요.", { exact: true });
  for (const error of ["EXTRACT_CHUNKS_FAILED", "REQUEST_UNCERTAIN"]) {
    fixture.run.items[0] = { ...extract, error, ...{ pagesFailed: 0, chunksFailed: 1 } };
    await open();
    await expect(chunkNote).toBeVisible();
    await expect(chunkNote).toHaveCount(1);
    await expect(note).toHaveCount(0);
    await expect(page.getByText(/쪽을 읽지 못했어요|분석 요청의 완료 여부를 확인하지 못했어요|추출할 내용을 찾지 못했어요|자료를 처리하지 못했어요/)).toHaveCount(0);
    await expect(consent(error === "REQUEST_UNCERTAIN")).toHaveCount(0);
    await expect(retry).toBeEnabled();
    if (error !== "REQUEST_UNCERTAIN") {
          await expect(retry).toBeEnabled();
    }
  }
  // Mixed failures show both notes exactly once, with the actual OCR page count.
  fixture.run.items[0] = { ...extract, error: "OCR_PAGES_FAILED", ...{ chunksFailed: 1 } };
  await open();
  await expect(note).toBeVisible();
  await expect(note).toHaveCount(1);
  await expect(chunkNote).toBeVisible();
  await expect(chunkNote).toHaveCount(1);
  await expect(page.getByText(/분석 요청의 완료 여부를 확인하지 못했어요|추출할 내용을 찾지 못했어요|자료를 처리하지 못했어요/)).toHaveCount(0);
  await expect(consent()).toHaveCount(0);
  await expect(retry).toBeEnabled();
  await expect(retry).toBeEnabled();
  fixture.run.status = "SUCCEEDED";
  fixture.run.items[0] = { ...extract, status: "SUCCEEDED", error: null,
    emptyReason: null, ...{ pagesFailed: 0, chunksFailed: 0 } };
  await open();
  await expect(page.getByText(/쪽을 읽지 못했어요|일부 내용을 읽지 못했어요|자료를 처리하지 못했어요|분석할 텍스트가 없어요/)).toHaveCount(0);
  clean();
});

// DEV-179: contract tests written from the acceptance behavior, without reading
// the composer/workspace implementation. Source-analysis traffic is stubbed.
function contractFixture() {
  const fixture = reviewFixture();
  return {
    ...fixture,
    review: {
      ...fixture.review,
      editorFields: fixture.review.editorFields.map((entry) => ({ ...entry,
        field: { ...entry.field, candidateIds: [] as string[] } })),
      candidates: [] as {
        id: string; targetId: string | null; fieldKey: string; value: string;
        candidateIds: string[]; historical: boolean; outdated: boolean;
        evidence: { sourceId: string; sourceRevision: number; sanitizationVersion: number;
          page: number; spanIds: string[]; quote: string }[];
      }[],
    },
    run: {
      ...fixture.run,
      items: fixture.run.items.map((item) => ({ ...item, pagesAnalysed: 0,
        pagesEmpty: 0, pagesFailed: 0, chunksFailed: 0, ocrFailedPageNumbers: [] as number[], chunkFailedPageNumbers: [] as number[] })),
    },
  };
}

type ContractFixture = ReturnType<typeof contractFixture>;

async function serveContractReview(page: Page, fixture: ContractFixture) {
  await page.route("**/api/source-analysis/batches/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const prefix = `/api/source-analysis/batches/${fixture.batch.id}`;
    if (!pathname.startsWith(prefix))
      return route.fulfill({ status: 404, json: { detail: "Unexpected fixture batch" } });
    const sub = pathname.slice(prefix.length);
    if (sub === "/basic-info" && route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      for (const update of body.targets ?? []) {
        const target = fixture.batch.targets.find((t) => t.id === update.targetId);
        if (target) target.basicInfo = { ...target.basicInfo, ...update.basicInfo };
      }
      fixture.batch.version++;
      return route.fulfill({ json: fixture.batch });
    }
    if (route.request().method() !== "GET")
      return route.fulfill({ status: 404, json: { detail: `Unstubbed ${sub}` } });
    // Attachment tiles load the first page of a PDF source as a thumbnail.
    if (/\/pages\/\d+\/image$/.test(sub))
      return route.fulfill({ contentType: "image/png", body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64") });
    const json = sub === "/review" ? fixture.review
      : sub === "/runs" ? { items: [fixture.run] }
      : sub === "/drafts" ? { items: [] }
      : sub.endsWith("/text") ? { text: fixture.text, sourceVersion: 1 }
      : /\/pages\/\d+$/.test(sub) ? { sourceRevision: 1, sanitizationVersion: 1,
        privacyApproved: true, spans: [], redactedSpans: [], redactions: [], hasImage: false }
      : sub === "" || sub === "/" ? fixture.batch : null;
    return route.fulfill({ status: json === null ? 404 : 200,
      json: json ?? { detail: `Unstubbed ${sub}` } });
  });
}

/** DEV-361 PR C: the composer is the only batch screen (the 2-tab workspace and its 상세페이지 편집 tab were deleted). */
async function openContractReview(page: Page, fixture: ContractFixture) {
  await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`);
}

function addContractExclusion(fixture: ContractFixture, refinementVersion = "refinement-1") {
  const target = fixture.batch.targets[0];
  fixture.review.refinementResults = { [target.id]: {
    refinementVersion,
    excluded: [{ candidateId: "excluded-price", value: "반품 배송비 5,000원", reason: "price" }],
  } };
}

test("DEV-179 AC-SRC-3/11: composer hides provenance controls while preserving returned evidence", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  const evidence = { sourceId: "anchor", sourceRevision: 1, sanitizationVersion: 1,
    page: 1, spanIds: ["s0"], quote: "제주에서 자란 감귤" };
  fixture.review.candidates = [{ id: "summary-evidence", targetId: "target", fieldKey: "summary",
    value: "제주에서 자란 감귤", candidateIds: ["summary-evidence"], evidence: [evidence],
    historical: false, outdated: false }];
  fixture.review.editorFields[0].field.candidateIds = ["summary-evidence"];
  await serveContractReview(page, fixture);
  const returned = page.waitForResponse((response) => response.url().endsWith("/review"));
  await openContractReview(page, fixture);
  const payload = await (await returned).json();
  expect(payload.candidates[0].evidence).toEqual([evidence]);
  await expect(page.getByLabel("상품 소개 보충 내용", { exact: true })).toHaveValue("제주에서 자란 감귤");
  await expect(page.getByRole("button", { name: "원문 보기", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("ai-filled-badge")).toHaveCount(0);
  clean();
});

test("DEV-179 AC-SRC-3/11: composer opens all conflicting text choices before field focus", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  const fields = [
    { key: "qualityEvidence", label: "품질 확인 내용", candidate: "당도 14 °Bx" },
    { key: "composition", label: "상품 구성 내용", candidate: "감귤 12개 구성" },
    { key: "specification", label: "규격 내용", candidate: "중과 지름 6cm" },
  ];
  const base = fixture.review.editorFields[0].field;
  fixture.review.editorFields = fields.map((field) => ({ status: "conflict",
    field: { ...base, fieldKey: field.key, value: "확인 전 문구", candidateIds: [`candidate-${field.key}`] } }));
  fixture.review.candidates = fields.map((field) => ({ id: `candidate-${field.key}`,
    targetId: "target", fieldKey: field.key, value: field.candidate,
    candidateIds: [`candidate-${field.key}`], evidence: [], historical: false, outdated: false }));
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  // Check all three before any input click: focus must not be the trigger.
  await expect(page.getByRole("button", { name: "확인 전 문구", exact: true })).toHaveCount(3);
  for (const field of fields)
    await expect(page.getByRole("button", { name: field.candidate, exact: true })).toBeVisible();
  for (const field of fields) {
    await page.getByRole("button", { name: field.candidate, exact: true }).click();
    await expect(page.getByLabel(field.label, { exact: true })).toHaveValue(field.candidate);
  }
  clean();
});

test("DEV-179 DEV-361 AC-SRC-11: composer buyer preview keeps URL and unsaved edits", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  await serveContractReview(page, fixture);
  // A new product has no sale settings yet (no sale stages).
  await page.route("**/api/products/mine/p-hallabong", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    return route.fulfill({ response, json: { ...(await response.json()), stages: [] } });
  });
  await openContractReview(page, fixture);
  const summary = page.getByLabel("상품 소개 보충 내용", { exact: true });
  const unsaved = "구매자가 보게 될 직접 수정한 제주 감귤 설명";
  await summary.fill(unsaved);
  const url = page.url();
  await page.getByRole("button", { name: /^(구매자 화면 미리보기|구매자 화면 보기)$/ }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("button", { name: /^(편집으로 돌아가기|편집하기)$/ })).toBeVisible();
  await expect(page.getByText(unsaved, { exact: true })).toBeVisible();
  await expect(summary).toHaveCount(0);
  await expect(page.getByRole("button", { name: "원문 보기", exact: true })).toHaveCount(0);
  // The composer's save and next buttons are producer tools, hidden in the buyer preview
  await expect(page.getByRole("button", { name: "임시 저장", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다음: 판매·가격", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("excluded-chip")).toBeHidden();
  // A new product has no sale settings yet: no "0박스 남음 · 마감" or default shipping row.
  await expect(page.getByText(/박스 남음/)).toHaveCount(0);
  await expect(page.getByText(/도서산간 추가/)).toHaveCount(0);
  await page.getByRole("button", { name: /^(편집으로 돌아가기|편집하기)$/ }).click();
  await expect(page).toHaveURL(url);
  await expect(summary).toHaveValue(unsaved);
  clean();
});

test("DEV-179 DEV-361 AC-SRC-11: composer buyer preview keeps sale rows once sale settings exist", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  // A product with sale settings (seeded selling p-house).
  for (const t of [...fixture.batch.targets, ...fixture.review.targets]) t.productId = "p-house";
  await serveContractReview(page, fixture);
  // DEV-361 C-7: a buyer-visible product also reads its private product draft. Answer "no draft" so the result does not
  // depend on whether another spec left a product workspace for p-house (without one the server answers 400).
  await page.route("**/api/source-analysis/product-workspaces/p-house/product-draft", (route) =>
    route.request().method() !== "GET" ? route.fallback() : route.fulfill({ json: {
      productId: "p-house", version: 1, productStatus: "PUBLISHED", draft: null,
      changes: { now: [], newOrders: [], consent: [] }, reservedCount: 0, conflicts: [] } }));
  await openContractReview(page, fixture);
  await page.getByRole("button", { name: /^(구매자 화면 미리보기|구매자 화면 보기)$/ }).click();
  // DEV-293: 판매 설정이 있으면 받는 시기 줄과 옵션 줄(남은 박스·가격)이 보인다. 물량이 0인 옵션은 가격 자리에 품절 이유
  await expect(page.getByTestId("product-option-row").first()).toBeVisible();
  await expect(page.getByText(/도착 (예정|예상)|받는 시기 확정 전/).first()).toBeVisible();
  clean();
});

test("DEV-179 DEV-361 AC-SRC-4/5: composer reports source and PDF page progress without ETA", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  fixture.batch.sources[0] = { ...fixture.batch.sources[0], filename: "판매 안내.pdf",
    mime: "application/pdf", pageCount: 20 };
  fixture.batch.sources.push({ ...fixture.batch.sources[0], id: "text-source",
    filename: "보관 안내.txt", mime: "text/plain", pageCount: 1 });
  fixture.run.status = "ANALYZING";
  fixture.run.completed = 1;
  fixture.run.total = 2;
  const base = fixture.run.items[0];
  fixture.run.items = [
    { ...base, id: "pdf-progress", assetId: "anchor", phase: "EXTRACT", status: "RUNNING", pagesAnalysed: 12 },
    { ...base, id: "text-progress", assetId: "text-source", phase: "EXTRACT", status: "SUCCEEDED", pagesAnalysed: 1 },
  ];
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  await expect(page.getByTestId("source-run-progress")).toHaveCount(1);
  const detail = page.getByTestId("product-detail-page");
  await expect(detail.getByLabel("불러오는 중", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "AI 시트 닫기", exact: true }).last().click();
  await expect(detail.getByTestId("source-run-progress")).toBeVisible();
  await expect(page.getByTestId("source-run-progress")).toHaveCount(1);
  await expect(detail.getByLabel("불러오는 중", { exact: true })).toHaveCount(0);
  // The page cannot be edited until the analysis ends (the 2-tab screen disabled its 상세페이지 편집 tab):
  // the composer shows the analysis status where the page editor would be.
  await expect(detail.getByTestId("source-analysis-status")).toBeVisible();
  await expect(page.getByLabel("상품 소개 보충 내용", { exact: true })).toHaveCount(0);
  await expect(page.locator("body")).toContainText(/자료\s*1\s*\/\s*2/);
  await expect(page.locator("body")).toContainText(/PDF.*12\s*\/\s*20쪽/);
  await expect(page.locator("body")).toContainText(/자료 1 · PDF/);
  await expect(page.locator("body")).toContainText(/자료 2 · 내용 분석 완료/);
  await expect(page.locator("body")).toContainText(/다른 화면에 다녀와도/);
  // ETA wording must sit in one phrase: `.*` matched a container that merely held
  // "당도 예상" and an unrelated later "분석" label in sibling elements.
  await expect(page.getByText(/예상\s*(?:소요\s*)?시간|예상\s*\d+\s*(?:시간|분|초)|\d+\s*(?:시간|분|초)\s*(?:남|후|뒤)|남은 시간|ETA/i)).toHaveCount(0);
  clean();
});

test("DEV-179 DEV-361 AC-SRC-5/8: composer shows actual failed pages and retries without a cost acknowledgement", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  fixture.batch.sources[0].filename = "부분 실패.pdf";
  fixture.batch.sources[0].pageCount = 8;
  fixture.run.status = "PARTIAL";
  fixture.run.items[0] = { ...fixture.run.items[0], phase: "EXTRACT", status: "PARTIAL",
    error: "OCR_PAGES_FAILED", pagesFailed: 2, chunksFailed: 1, ocrFailedPageNumbers: [2, 5], chunkFailedPageNumbers: [7] };
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  await expect(page.getByText("초안을 저장했어요. 원문을 확인하고 고쳐 주세요. · 테스트 결과", { exact: true })).toBeVisible();
  // DEV-361 C-25: the actual failed page numbers per file, as on the old 2-tab screen
  await expect(page.getByText("부분 실패.pdf: 2쪽을 읽지 못했어요. 확인할 쪽: 2, 5쪽. 다시 분석해 보세요.", { exact: true })).toBeVisible();
  await expect(page.getByText("부분 실패.pdf: 일부 내용을 읽지 못했어요. 확인할 쪽: 7쪽. 다시 분석해 보세요.", { exact: true })).toBeVisible();
  const retry = page.getByRole("button", { name: "미완료 부분 다시 처리", exact: true });
  const consent = page.getByRole("checkbox", {
    name: retryCost, exact: true,
  });
  await expect(consent).toHaveCount(0);
  await expect(retry).toBeEnabled();
  clean();
});

test("DEV-179 AC-SRC-1/5: composer variety lives above the AI sheet footer and does not require a photo", async ({ page }) => {
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  fixture.batch.targets[0].basicInfo.variety = "";
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  const variety = page.getByLabel("과일 품종명", { exact: true });
  await expect(variety).toBeHidden();
  await expect(page.getByTestId("product-photo-box").getByTestId("attachment-tile")).toHaveCount(0);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  await expect(variety).toBeVisible();
  const start = page.getByRole("button", { name: /^AI로 (?:다시 )?채우기$/ });
  await expect(start).toBeEnabled();
  const varietyBounds = await variety.boundingBox();
  const startBounds = await start.boundingBox();
  expect(varietyBounds!.y + varietyBounds!.height).toBeLessThanOrEqual(startBounds!.y);
  await start.click();
  const missing = page.getByTestId("peek-sheet").getByText("과일 품종명을 입력해 주세요.", { exact: true });
  await expect(missing).toBeVisible();
  await expect(page.getByRole("button", { name: "서버 상태 다시 확인", exact: true })).toHaveCount(0);
  const errorBounds = await missing.boundingBox();
  const buttonBounds = await start.boundingBox();
  // The validation and action must share a viewport so the remedy is visible.
  expect(errorBounds!.y + errorBounds!.height).toBeGreaterThan(0);
  expect(buttonBounds!.y + buttonBounds!.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
  await variety.fill("온주밀감");
  await variety.blur();
  await expect(start).toBeEnabled();
  await page.getByRole("button", { name: "AI 시트 닫기", exact: true }).last().click();
  await expect(variety).toBeHidden();
});

test("DEV-179 AC-SRC-4/5: composer clears start failure immediately on retry and closes sheet after success", async ({ page }) => {
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  await serveContractReview(page, fixture);
  let attempts = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let retryStarted!: () => void;
  const retryInFlight = new Promise<void>((resolve) => { retryStarted = resolve; });
  await page.route("**/api/source-analysis/batches/*/runs", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503,
      json: { code: "UNAVAILABLE", message: "분석 시작 연결 실패 검증" } });
    retryStarted();
    await gate;
    fixture.run.status = "QUEUED";
    return route.fulfill({ status: 202, json: fixture.run });
  });
  await openContractReview(page, fixture);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  const start = page.getByRole("button", { name: /^AI로 (?:다시 )?채우기$/ });
  await start.click();
  const error = page.getByText("분석 시작 연결 실패 검증", { exact: true });
  await expect(error).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 시트 닫기", exact: true }).last()).toBeVisible();
  await start.click();
  await retryInFlight;
  // Hold the successful response: clearing the old error cannot depend on it.
  await expect(error).toHaveCount(0);
  release();
  await expect(page.getByRole("button", { name: "AI 시트 열기", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 시트 닫기", exact: true })).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("DEV-179 DEV-361 AC-SRC-11: exclusions are acknowledged by producer, batch, target and refinement version across tabs", async ({ page, context }) => {
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  addContractExclusion(fixture);
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  const modal = page.getByTestId("excluded-modal");
  await expect(modal).toBeVisible();
  // Merely presenting the modal does not acknowledge its content.
  await page.reload();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  await page.reload();
  await expect(page.getByTestId("excluded-chip")).toBeVisible();
  await expect(modal).toHaveCount(0);
  const second = await context.newPage();
  await serveContractReview(second, fixture);
  await openContractReview(second, fixture);
  await expect(second.getByTestId("excluded-chip")).toBeVisible();
  await expect(second.getByTestId("excluded-modal")).toHaveCount(0);
  await second.getByTestId("excluded-chip").click();
  await expect(second.getByTestId("excluded-modal")).toBeVisible();
  await second.getByTestId("excluded-modal").getByRole("button", { name: "확인", exact: true }).click();
  for (const change of ["version", "target", "batch"] as const) {
    if (change === "version") addContractExclusion(fixture, "refinement-2");
    if (change === "target") {
      fixture.batch.targets[0].id = "another-target";
      for (const entry of fixture.review.editorFields) entry.field.targetId = "another-target";
      addContractExclusion(fixture, "refinement-2");
    }
    if (change === "batch") fixture.batch.id = "another-review-batch";
    await openContractReview(page, fixture);
    await expect(modal, `${change} must be an unseen result`).toBeVisible();
    await modal.getByRole("button", { name: "확인", exact: true }).click();
  }
  // The seed has only one approved producer (강영수); "강미숙" never existed and /login
  // redirects a signed-in producer home. Present the same session as another producer id.
  await page.route("**/api/auth/me", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    return route.fulfill({ response, json: { ...(await response.json()), userId: "u-other-producer" } });
  });
  await openContractReview(page, fixture);
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
});

test("DEV-179 DEV-361 AC-SRC-11: unavailable localStorage retains exclusion acknowledgement during the app lifetime", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  addContractExclusion(fixture);
  await serveContractReview(page, fixture);
  // The composer mounts the exclusions as soon as the review arrives (the 2-tab screen waited for its 상세페이지 편집 tab):
  // hold the first review until storage is blocked, so the acknowledgement cannot reach localStorage.
  let reviewRequested!: () => void;
  const requested = new Promise<void>((resolve) => { reviewRequested = resolve; });
  let releaseReview!: () => void;
  const held = new Promise<void>((resolve) => { releaseReview = resolve; });
  await page.route(`**/api/source-analysis/batches/${fixture.batch.id}/review`, async (route) => {
    reviewRequested();
    await held;
    return route.fallback();
  });
  await openContractReview(page, fixture);
  await requested; // the signed-in app is in memory and already loading the batch
  // Block storage after login, preserving the authenticated app already in memory. The API client reads the sign-in
  // token from storage on every request and the composer (unlike the 2-tab screen) calls the real product API after the
  // review arrives, so only that token key stays readable; every other read and write throws.
  await page.evaluate(() => {
    const storage = window.localStorage;
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    const token = "farmclub-producer:token";
    Storage.prototype.getItem = function (key: string) {
      if (this === storage && key !== token) throw new DOMException("Storage unavailable", "SecurityError");
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === storage && key !== token) throw new DOMException("Storage unavailable", "SecurityError");
      setItem.call(this, key, value);
    };
  });
  releaseReview();
  const modal = page.getByTestId("excluded-modal");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  const summary = page.getByLabel("상품 소개 보충 내용", { exact: true });
  await summary.fill("저장소가 막혀도 확인한 안내는 반복하지 않아요");
  await page.getByRole("button", { name: /^(구매자 화면 미리보기|구매자 화면 보기)$/ }).click();
  await page.getByRole("button", { name: /^(편집으로 돌아가기|편집하기)$/ }).click();
  await expect(summary).toHaveValue("저장소가 막혀도 확인한 안내는 반복하지 않아요");
  await expect(modal).toHaveCount(0);
  await page.getByTestId("excluded-chip").click();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  await expect(modal).toHaveCount(0);
  // The acknowledgement lived in memory only (nothing was written to the blocked storage)
  expect(await page.evaluate(() => Object.keys(window.localStorage).some((k) => k.includes("excluded-seen")))).toBe(false);
  clean();
});

test("DEV-179 DEV-361 AC-SRC-11: dismissing exclusions with the backdrop does not acknowledge them", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  addContractExclusion(fixture);
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  const modal = page.getByTestId("excluded-modal");
  await expect(modal).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click({ position: { x: 5, y: 5 } });
  await expect(modal).toHaveCount(0);
  await page.reload();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  await page.reload();
  await expect(page.getByTestId("excluded-chip")).toBeVisible();
  await expect(modal).toHaveCount(0);
  clean();
});

test("DEV-179 DEV-361 AC-SRC-11: empty composer buyer preview omits detail placeholders and producer tools", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  fixture.review.editorFields = [];
  fixture.run.items = [];
  fixture.run.completed = 0;
  fixture.run.total = 0;
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  await page.getByRole("button", { name: /^(구매자 화면 미리보기|구매자 화면 보기)$/ }).click();
  await expect(page.getByRole("button", { name: /^(편집으로 돌아가기|편집하기)$/ })).toBeVisible();
  await expect(page.getByText(/사진\s*[·/]\s*자료 넣기/)).toHaveCount(0);
  await expect(page.getByRole("button", {
    name: /임시 저장|다음: 판매·가격|사진·자료 펼치기|자료 파일 추가|텍스트 추가|사진 추가|AI로 (?:다시 )?채우기/,
  })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByTestId("excluded-chip")).toHaveCount(0);
  clean();
});

test("DEV-179 AC-SRC-11: composer preview preserves excluded summary and retains the enabled taste field", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  fixture.review.editorFields[0].field.state = "EXCLUDED";
  fixture.review.editorFields[0].field.value = "편집기에만 남길 제외한 한눈에 보기";
  fixture.review.editorFields[1].field.state = "CONFIRMED";
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  await page.getByRole("button", { name: "상품 소개 추가", exact: true }).click();
  const summary = page.getByLabel("상품 소개 보충 내용", { exact: true });
  await expect(summary).toHaveValue("편집기에만 남길 제외한 한눈에 보기");
  await page.getByRole("button", { name: /^(구매자 화면 미리보기|구매자 화면 보기)$/ }).click();
  await expect(page.getByText("편집기에만 남길 제외한 한눈에 보기", { exact: true })).toHaveCount(0);
  await expect(page.getByText("달콤한 과즙", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^(편집으로 돌아가기|편집하기)$/ }).click();
  await expect(summary).toHaveValue("편집기에만 남길 제외한 한눈에 보기");
  await page.getByRole("button", { name: /^(구매자 화면 미리보기|구매자 화면 보기)$/ }).click();
  await expect(page.getByText("편집기에만 남길 제외한 한눈에 보기", { exact: true })).toHaveCount(0);
  await expect(page.getByText("달콤한 과즙", { exact: true })).toBeVisible();
  clean();
});

test("DEV-179 DEV-361 AC-SRC-1/5: composer explains why analysis cannot start without sources", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  fixture.batch.sources = [];
  fixture.run.inputs = [];
  fixture.run.items = [];
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  const start = page.getByRole("button", { name: /^AI로 (?:다시 )?채우기$/ });
  await expect(start).toBeVisible();
  await expect(start).toBeDisabled();
  await expect(page.getByText("자료를 먼저 넣어 주세요.", { exact: true })).toBeVisible();
  clean();
});

test("DEV-179 DEV-361 AC-SRC-11: acknowledging a newer exclusion result replaces the target storage value", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  const targetId = fixture.batch.targets[0].id;
  const storageKey = `farmclub-producer:excluded-seen:u-kang:${fixture.batch.id}:${targetId}`;
  addContractExclusion(fixture, "refinement-1");
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  const modal = page.getByTestId("excluded-modal");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("refinement-1");
  addContractExclusion(fixture, "refinement-2");
  await openContractReview(page, fixture);
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  const entries = await page.evaluate(() => Object.keys(localStorage)
    .filter((entry) => entry.startsWith("farmclub-producer:excluded-seen:"))
    .map((entry) => [entry, localStorage.getItem(entry)]));
  expect(entries).toEqual([[storageKey, "refinement-2"]]);
  await page.reload();
  await expect(modal).toHaveCount(0);
  await page.getByTestId("excluded-chip").click();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  clean();
});

test("DEV-179 DEV-361 AC-SRC-11: legacy session acknowledgement migrates once and new results still open", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  addContractExclusion(fixture, "refinement-1");
  const legacyKey = `farmclub-producer:excluded-seen:${fixture.batch.id}:refinement-1`;
  const storageKey = `farmclub-producer:excluded-seen:u-kang:${fixture.batch.id}:${fixture.batch.targets[0].id}`;
  await page.evaluate((key) => sessionStorage.setItem(key, "1"), legacyKey);
  await serveContractReview(page, fixture);
  await openContractReview(page, fixture);
  const modal = page.getByTestId("excluded-modal");
  await expect(page.getByTestId("excluded-chip")).toBeVisible();
  await expect(modal).toHaveCount(0);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), legacyKey)).toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("refinement-1");
  await page.reload();
  await expect(page.getByTestId("excluded-chip")).toBeVisible();
  await expect(modal).toHaveCount(0);
  addContractExclusion(fixture, "refinement-2");
  await openContractReview(page, fixture);
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  await page.getByTestId("excluded-chip").click();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  clean();
});

/**
 * DEV-361: the composer's '임시 저장'/'다음' also save the product fields of a pre-sale product (PATCH /api/products).
 * The stubbed batch's basic info differs from the seeded p-hallabong, so answer that PATCH with the unchanged product
 * instead of rewriting the seed other specs read. Returns the PATCH bodies.
 */
async function keepSeedProduct(page: Page) {
  const patches: unknown[] = [];
  await page.route("**/api/products/p-hallabong", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches.push(route.request().postDataJSON());
    const mine = await page.request.get(`${apiUrl}/api/products/mine/p-hallabong`, {
      headers: { Authorization: route.request().headers()["authorization"] ?? "" } });
    return route.fulfill({ json: await mine.json() });
  });
  return patches;
}

/** A saved page draft that is current for the contract fixture's review and batch versions. */
function savedPageDraft(fixture: ContractFixture, id: string, moduleId: string, value: string) {
  return {
    id, targetId: "target", version: 1,
    snapshot: { reviewVersion: fixture.review.reviewVersion, batchVersion: fixture.batch.version,
      mode: "mock", warnings: [], modules: [{ id: moduleId, enabled: true }],
      previewModules: [{ id: moduleId, texts: [{ fieldKey: moduleId, value }],
        photoAssetIds: [], illustrationId: null }] },
  };
}

test("DEV-179 DEV-361 AC-SRC-3/11: confirming the current factual wording preserves its provenance", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  const original = { ...fixture.review.editorFields[0].field, fieldKey: "composition",
    value: "확인 전 문구", provenance: "REFINED", candidateIds: ["fact-0"] };
  fixture.review.editorFields = [{ status: "conflict", field: original }];
  fixture.review.candidates = ["감귤 3kg 구성", "감귤 5kg 구성"].map((value, i) => ({
    id: `fact-${i}`, targetId: "target", fieldKey: "composition", value,
    candidateIds: [`fact-${i}`], evidence: [], historical: false, outdated: false,
  }));
  await serveContractReview(page, fixture);
  await keepSeedProduct(page);
  const submissions: { fields: { fieldKey: string; value: string; state: string;
    provenance: string; candidateIds: string[] }[] }[] = [];
  const draft = savedPageDraft(fixture, "confirmed-draft", "composition", original.value);
  await page.route(`**/api/source-analysis/batches/${fixture.batch.id}/editor`, async (route) => {
    submissions.push(route.request().postDataJSON());
    return route.fulfill({ json: { drafts: [draft] } });
  });
  // Once saved, the batch lists that draft as current (so '임시 저장' does not save the page a second time).
  await page.route(`**/api/source-analysis/batches/${fixture.batch.id}/drafts`, (route) =>
    route.fulfill({ json: { items: submissions.length ? [draft] : [] } }));
  await openContractReview(page, fixture);
  const currentChoice = page.getByRole("button", { name: "확인 전 문구", exact: true });
  await expect(currentChoice).toBeVisible();
  await expect(page.getByRole("button", { name: "감귤 3kg 구성", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "감귤 5kg 구성", exact: true })).toBeVisible();
  await currentChoice.click();
  await expect(page.getByLabel("상품 구성 내용", { exact: true })).toHaveValue(original.value);
  // The composer's private save (the 2-tab screen's 비공개 저장)
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.getByText("비공개로 저장했어요. 상품에는 아직 적용되지 않았어요.", { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(1);
  const submitted = submissions[0].fields.find((field) => field.fieldKey === "composition");
  expect(submitted).toMatchObject({ value: original.value, state: "CONFIRMED",
    provenance: original.provenance, candidateIds: original.candidateIds });
  clean();
});

/**
 * DEV-361 PR C: a pre-sale page is applied by the composer's '다음: 판매·가격' (the 2-tab screen's 비공개 저장 → 공개 전 검토 →
 * 상품 상세에 적용 검토 → 확인 is gone). Give the fixture a prepared product photo and a current saved page draft so the
 * press reaches the page apply, which the tests stub to fail.
 */
async function serveApplyReady(page: Page, fixture: ContractFixture) {
  fixture.batch.sources.push({ ...fixture.batch.sources[0], id: "cover", filename: "cover.jpg", mime: "image/jpeg",
    targetIds: [], common: true, originalPhoto: true });
  const draft = savedPageDraft(fixture, "photo-required-draft", "summary", "제주에서 자란 감귤");
  await serveContractReview(page, fixture);
  await keepSeedProduct(page);
  await page.route(`**/api/source-analysis/batches/${fixture.batch.id}/drafts`, (route) =>
    route.fulfill({ json: { items: [draft] } }));
  return draft;
}

// DEV-179 demo follow-up: public apply reasons must remain at the action.
test("DEV-452 AC-SRC-9/11: composer next saves privately and moves on without applying the page", async ({ page }) => {
  // Decision 2A (user, 11/27): '다음: 판매·가격' only saves; the page is applied with the sale request.
  // Replaces the DEV-179 check that '다음' applied the page and showed the apply error beside it.
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  const draft = await serveApplyReady(page, fixture);
  let applied = 0;
  await page.route(`**/api/source-analysis/batches/${fixture.batch.id}/drafts/${draft.id}/apply`, (route) => {
    applied++;
    return route.fulfill({ status: 400, json: { code: "VALIDATION_ERROR", message: "x", details: {} } });
  });
  await openContractReview(page, fixture);
  await page.getByRole("button", { name: "다음: 판매·가격", exact: true }).click();
  await expect(page).toHaveURL(/\/sell/);
  expect(applied).toBe(0);
  await expect(page.getByRole("alert").filter({ hasText: "대표 상품사진" })).toHaveCount(0);
  clean();
});

test("DEV-179 DEV-361 AC-SRC-5/11: composer retains server refresh after a network failure", async ({ page }) => {
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  await serveContractReview(page, fixture);
  let fail = true;
  await page.route(`**/api/source-analysis/batches/${fixture.batch.id}/runs`, (route) => {
    if (!fail) return route.fallback();
    fail = false;
    return route.abort("failed");
  });
  await openContractReview(page, fixture);
  const refresh = page.getByRole("button", { name: "다시 확인", exact: true });
  await expect(refresh).toBeVisible();
  await refresh.click();
  await expect(refresh).toHaveCount(0);
  await expect(page.getByLabel("상품 소개 보충 내용", { exact: true })).toHaveValue("제주에서 자란 감귤");
});

test("DEV-179 DEV-361 AC-SRC-5/8: composer retries definite and uncertain failures without consent and guards repeated clicks", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const fixture = contractFixture();
  fixture.run.status = "PARTIAL";
  const item = { ...fixture.run.items[0], phase: "EXTRACT", status: "PARTIAL" };
  await serveContractReview(page, fixture);
  let retries = 0;
  await page.route(`**/api/source-analysis/batches/${fixture.batch.id}/runs/*/retry`, (route) => {
    retries++;
    expect(route.request().postDataJSON().acknowledgeUncertain).toBe(true);
    fixture.run.id = `retry-${retries}`;
    return route.fulfill({ status: 202, json: fixture.run });
  });
  for (const error of ["OCR_PAGES_FAILED", "EXTRACT_CHUNKS_FAILED", "REQUEST_UNCERTAIN", "mixed"]) {
    fixture.run.items = [{ ...item, error: error === "mixed" ? "OCR_PAGES_FAILED" : error }];
    if (error === "mixed") fixture.run.items.push({ ...item, id: "uncertain-chunk", error: "REQUEST_UNCERTAIN" });
    await openContractReview(page, fixture);
    await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
    const uncertain = error === "REQUEST_UNCERTAIN" || error === "mixed";
    const consent = page.getByRole("checkbox", { name: uncertain ? uncertainRetryCost : retryCost, exact: true });
    await expect(page.getByRole("checkbox", { name: uncertain ? retryCost : uncertainRetryCost, exact: true })).toHaveCount(0);
    const retry = page.getByRole("button", { name: "미완료 부분 다시 처리", exact: true });
    await expect(consent).toHaveCount(0);
    await expect(retry).toBeEnabled();
      await expect(retry).toBeEnabled();
      await expect(retry).toBeEnabled();
      await retry.click();
    await expect(consent).toHaveCount(0);
    await expect(retry).toBeDisabled();
  }
  expect(retries).toBe(4);
  clean();
});

test("DEV-329: with unsaved page edits the size and Brix fields stay typeable and try to save the page first", async ({ page }) => {
  const clean = monitor(page, [/404/]);
  await loginProducer(page, "강영수");
  const fixture = reviewFixture();
  await serveReview(page, fixture);
  await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`);
  await page.getByText("상품정보", { exact: true }).click();
  // 판매페이지 내용을 고쳐 저장 안 한 수정을 만든다
  await page.getByLabel("상품 소개 보충 내용", { exact: true }).fill("새로 쓴 소개");
  const brix = page.getByLabel("측정 당도 (°Bx)", { exact: true });
  const size = page.getByLabel("사이즈", { exact: true });
  // 예전에는 읽기 전용이라 휴대폰에서 키보드가 뜨지 않았다
  await expect(brix).toBeEditable();
  await expect(size).toBeEditable();
  const saveTried = page.waitForRequest((r) => r.method() !== "GET" && r.url().includes("/batches/review-fixes"));
  await brix.click();
  await saveTried;
  await brix.fill("12.5");
  await expect(brix).toHaveValue("12.5");
  // 이 픽스처는 저장을 받지 않으므로(404) 칸 아래에 짧은 안내만 뜬다
  await expect(page.getByText("판매페이지를 저장하지 못했어요. ‘임시 저장’을 눌러 주세요", { exact: true })).toBeVisible();
  // 새 상품 작성 화면의 그 줄 이름표는 '사이즈'(소비자 화면은 '중량·수량')
  await expect(page.getByText("중량·수량", { exact: true })).toHaveCount(0);
  // 구매자 미리보기는 소비자 화면 그대로
  await page.getByRole("button", { name: /^(구매자 화면 미리보기|구매자 화면 보기)$/ }).click();
  await expect(page.getByText("중량·수량", { exact: true })).toBeVisible();
  await expect(page.getByText("사이즈", { exact: true })).toHaveCount(0);
  clean();
});

test("DEV-329: a slow page save does not lock the Brix field the producer just tapped", async ({ page }) => {
  const clean = monitor(page, [/404/]);
  await loginProducer(page, "강영수");
  const fixture = reviewFixture();
  await serveReview(page, fixture);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/batches/review-fixes/editor*", async (route) => {
    await gate;
    return route.fulfill({ status: 404, json: { detail: "slow save" } });
  });
  await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`);
  await page.getByText("상품정보", { exact: true }).click();
  await page.getByLabel("상품 소개 보충 내용", { exact: true }).fill("새로 쓴 소개");
  const brix = page.getByLabel("측정 당도 (°Bx)", { exact: true });
  await brix.click();
  // 판매페이지 임시 저장이 끝나기 전에도 칸이 읽기 전용이 되지 않아 키보드가 내려가지 않는다
  await brix.pressSequentially("13");
  await expect(brix).toBeEditable();
  await expect(brix).toHaveValue("13");
  release();
  await expect(page.getByText("판매페이지를 저장하지 못했어요. ‘임시 저장’을 눌러 주세요", { exact: true })).toBeVisible();
  await expect(brix).toHaveValue("13");
  clean();
});

test("DEV-329: after a failed page save, temporary save stores the page edit before the basic info", async ({ page }) => {
  const clean = monitor(page, [/404/]);
  await loginProducer(page, "강영수");
  const fixture = reviewFixture();
  await serveReview(page, fixture);
  let accept = false;
  const puts: string[] = [];
  await page.route("**/batches/review-fixes/**", (route) => {
    const request = route.request();
    if (request.method() !== "PUT") return route.fallback();
    const sub = new URL(request.url()).pathname.split("/batches/review-fixes")[1] ?? "";
    if (!accept) return route.fulfill({ status: 404, json: { detail: "save down" } });
    puts.push(sub);
    if (sub === "/editor") return route.fulfill({ json: { drafts: [] } });
    if (sub === "/basic-info") return route.fulfill({ json: { ...fixture.batch, version: 2, reviewVersion: 2 } });
    return route.fallback();
  });
  await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`);
  await page.getByText("상품정보", { exact: true }).click();
  await page.getByLabel("상품 소개 보충 내용", { exact: true }).fill("새로 쓴 소개");
  const brix = page.getByLabel("측정 당도 (°Bx)", { exact: true });
  await brix.click();
  await expect(page.getByText("판매페이지를 저장하지 못했어요. ‘임시 저장’을 눌러 주세요", { exact: true })).toBeVisible();
  await brix.fill("12.5");
  await brix.blur();
  // 저장이 다시 되는 상태에서 '임시 저장': 기본 정보 저장이 배치 버전을 올리기 전에 판매페이지를 먼저 저장해야 한다
  accept = true;
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect.poll(() => puts.includes("/basic-info")).toBe(true);
  expect(puts.indexOf("/editor")).toBeGreaterThan(-1);
  expect(puts.indexOf("/editor")).toBeLessThan(puts.indexOf("/basic-info"));
  // 저장에 성공하면 안내가 사라지고, 판매페이지를 다시 고쳐도 예전 실패 안내가 되살아나지 않는다
  const failed = page.getByText("판매페이지를 저장하지 못했어요. ‘임시 저장’을 눌러 주세요", { exact: true });
  await expect(failed).toHaveCount(0);
  await page.getByLabel("상품 소개 보충 내용", { exact: true }).fill("한 번 더 고친 소개");
  await expect(failed).toHaveCount(0);
  clean();
});

test("DEV-329: a page edit made while a Brix save raises the version still saves on the new version", async ({ page }) => {
  const clean = monitor(page, [/404/]);
  await loginProducer(page, "강영수");
  const fixture = reviewFixture();
  // 서버처럼 기본 정보에서 만든 칸(측정 당도 근거)이 있다. 기본 정보를 저장하면 이 칸이 새 값으로 바뀐다
  const base = fixture.review.editorFields[0].field;
  fixture.review.editorFields.push({ status: "ready", field: { ...base, fieldKey: "qualityEvidence", value: "측정 당도: 11 °Bx" } });
  await serveReview(page, fixture);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const editorBodies: { reviewVersion: number; fields: { fieldKey: string; value: string }[] }[] = [];
  await page.route("**/batches/review-fixes/**", async (route) => {
    const request = route.request();
    if (request.method() !== "PUT") return route.fallback();
    const sub = new URL(request.url()).pathname.split("/batches/review-fixes")[1] ?? "";
    if (sub === "/basic-info") {
      await gate;
      // 서버처럼 기본 정보 저장이 review 버전을 올린다(판매페이지 편집 값은 그대로)
      fixture.batch.version = 2;
      fixture.batch.reviewVersion = 2;
      fixture.review.reviewVersion = 2;
      fixture.review.editorFields = fixture.review.editorFields.map((e) =>
        e.field.fieldKey === "qualityEvidence" ? { ...e, field: { ...e.field, value: "측정 당도: 12.5 °Bx" } } : e);
      return route.fulfill({ json: fixture.batch });
    }
    if (sub === "/editor") {
      editorBodies.push(request.postDataJSON());
      return route.fulfill({ json: { drafts: [] } });
    }
    return route.fallback();
  });
  await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}&composer=1`);
  await page.getByText("상품정보", { exact: true }).click();
  const brix = page.getByLabel("측정 당도 (°Bx)", { exact: true });
  const story = page.getByLabel("상품 소개 보충 내용", { exact: true });
  await brix.fill("12.5");
  // 당도를 치고 바로 판매페이지 글 칸으로: 기본 정보 저장 중에도 그 칸은 잠기지 않는다(키보드가 내려가지 않게)
  await story.click();
  await expect(story).toBeEditable();
  await story.fill("저장 중에 고친 소개");
  release();
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  // 생산자가 고친 칸은 서버에서 바뀌지 않았으므로 새 버전(2)으로 옮겨 저장한다.
  // 고치지 않은 칸(측정 당도 근거)은 새 서버 값을, 고친 칸은 생산자 값을 보낸다
  await expect.poll(() => editorBodies.length).toBeGreaterThan(0);
  const body = editorBodies[0];
  expect(body.reviewVersion).toBe(2);
  expect(body.fields.find((f) => f.fieldKey === "qualityEvidence")?.value).toBe("측정 당도: 12.5 °Bx");
  expect(body.fields.some((f) => f.value.includes("저장 중에 고친 소개"))).toBe(true);
  clean();
});
