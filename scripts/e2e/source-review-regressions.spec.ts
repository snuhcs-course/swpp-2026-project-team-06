import { test, expect, type Page } from "./fixtures";
import { loginProducer, producerUrl, monitor } from "./helpers";

function reviewFixture() {
  const target = { id: "target", name: "회귀 감귤", productId: "p-house",
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

for (const composer of [false, true]) {
  test(`DEV-186 AC-SRC-5/11: ${composer ? "composer" : "workspace"} refine messages have no file failure`, async ({ page }) => {
    test.setTimeout(120000);
    const clean = monitor(page);
    await loginProducer(page, "강영수");
    const fixture = reviewFixture();
    await serveReview(page, fixture);
    const url = `${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}${composer ? "&composer=1" : ""}`;
    const openRunPanel = async () => {
      if (composer) await page.getByRole("button", { name: "사진·자료 펼치기", exact: true }).click();
    };
    await page.goto(url);
    await openRunPanel();
    await expect(page.getByText(composer ? "AI가 다 채웠어요. 위에서 확인하고 고쳐 주세요. · 테스트 결과"
      : "분석이 완료됐어요 · 테스트 결과", { exact: true })).toBeVisible();
    await expect(page.getByText(/자료를 처리하지 못했어요/)).toHaveCount(0);
    // Even a stale success error from a previous response is not a failed file.
    fixture.run.items[0].error = "REFINED_TEXTS_REJECTED";
    await page.reload();
    await openRunPanel();
    await expect(page.getByText(/AI가 다 채웠어요|분석이 완료됐어요/)).toBeVisible();
    await expect(page.getByText(/자료를 처리하지 못했어요/)).toHaveCount(0);
    fixture.run.status = "PARTIAL";
    fixture.run.items[0].status = "FAILED";
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
    for (const [code, message] of Object.entries(messages)) {
      fixture.run.items[0].error = code;
      await page.reload();
      await openRunPanel();
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
    fixture.run.items[0].error = "PROVIDER_AUTH";
    await page.reload();
    await openRunPanel();
    await expect(page.getByText("원문자료.txt: AI 연결 설정에 문제가 있어요. 운영팀에 알려 주세요.", { exact: true })).toBeVisible();
    clean();
  });
}

test("DEV-186 AC-SRC-3/11: candidate buttons hide money and health, retain product and platform text", async ({ page }) => {
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
    await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}`);
    await page.getByRole("button", { name: "상세페이지 편집", exact: true }).click();
    await page.getByLabel("한눈에 보기 내용", { exact: true }).click();
    await expect(page.getByText("내용 확인 필요 · 사용할 문구를 선택하거나 직접 수정해 주세요.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "32,000원", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "면 역 력 증진", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "서늘한 곳에 보관", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "고객센터 평일 운영", exact: true }).click();
    await expect(page.getByLabel("한눈에 보기 내용", { exact: true })).toHaveValue("고객센터 평일 운영");
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
  for (const label of ["상품명", "과일 품종명", "사이즈", "예상 당도 (°Bx)", "원산지", "보관"]) {
    const input = page.getByLabel(label, { exact: true });
    const original = await input.inputValue();
    for (const text of ["32,000원", "피로회복", "고객센터"]) {
      await input.fill(text);
      await expect(input).toHaveValue(text);
      for (const hint of hints) await expect(page.getByText(hint, { exact: true })).toHaveCount(0);
    }
    await input.fill(original);
  }
  await page.getByLabel("한눈에 보기 내용", { exact: true }).fill(value);
  for (const hint of hints) await expect(page.getByText(hint, { exact: true })).toBeVisible();
  clean();
});

test("DEV-186 AC-SRC-1/2/11: multi-product exclusions queue one named modal", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const targets = [
    { id: "first", name: "첫 상품 감귤" },
    { id: "second", name: "둘째 상품 천혜향" },
  ];
  const batch = { id: "review-queue", version: 1, reviewVersion: 1, targets, sources: [] };
  const review = {
    reviewVersion: 1, targets, candidates: [], fields: [], conflicts: [], sourcePhotoRequests: [],
    editorFields: targets.map((t) => ({
      status: "ready",
      field: { targetId: t.id, fieldKey: "summary", value: "제주에서 자란 감귤",
        state: "UNREVIEWED", provenance: "PRODUCER", candidateIds: [], photoAssetIds: [], illustrationId: null },
    })),
    refinementResults: Object.fromEntries(targets.map((t) => [t.id, {
      refinementVersion: `version-${t.id}`,
      excluded: [
        { candidateId: `c-${t.id}`, value: "반품 배송비 5,000원", reason: "price" },
        { candidateId: `p-${t.id}`, value: "1-3일 이내 도착", reason: "period" },
        { candidateId: `s-${t.id}`, value: "고객센터 평일 10시~5시", reason: "platform" },
      ],
    }])),
  };
  await page.route("**/api/source-analysis/batches/review-queue**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const json = pathname.endsWith("/review") ? review
      : pathname.endsWith("/runs") ? { items: [{ id: "run", status: "SUCCEEDED", items: [] }] }
      : pathname.endsWith("/drafts") ? { items: [] } : batch;
    return route.fulfill({ json });
  });
  await page.goto(`${producerUrl}/products/source-analysis?batchId=${batch.id}`);
  await page.getByRole("button", { name: "상세페이지 편집", exact: true }).click();
  const modal = page.getByTestId("excluded-modal");
  await expect(modal).toHaveCount(1);
  await expect(modal).toContainText("첫 상품 감귤 · 이 정보들은 상세 페이지에 못 넣어서 빼 뒀어요 🙂");
  await expect(modal.getByText("가격·배송비는 다음 단계(판매·가격)에서 직접 정해 주세요.", { exact: true })).toBeVisible();
  await expect(modal.getByText("판매 기간이나 받는 날은 다음 단계(판매·가격)에서 정해요.", { exact: true })).toBeVisible();
  await expect(modal.getByText("교환·환불·문의는 팜클럽이 같은 기준으로 안내해 드려요.", { exact: true })).toBeVisible();
  await expect(modal.getByText("출하 전 취소는 전액 환불, 배송 후 하자는 교환·환불이에요.", { exact: true })).toBeVisible();
  await expect(modal.getByTestId("excluded-item-platform")).toHaveText("고객센터 평일 10시~5시");
  // Waiting in the queue must not mark the second product as already shown.
  expect(await page.evaluate(() => sessionStorage.getItem(
    "farmclub-producer:excluded-seen:review-queue:version-second"))).toBeNull();
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  await expect(modal).toHaveCount(1);
  await expect(modal).toContainText("둘째 상품 천혜향 · 이 정보들은 상세 페이지에 못 넣어서 빼 뒀어요 🙂");
  await modal.getByRole("button", { name: "확인", exact: true }).click();
  await expect(modal).toHaveCount(0);
  // Parent input edits recreate the products array; an unchanged result stays acknowledged.
  const summary = page.getByLabel("한눈에 보기 내용", { exact: true }).first();
  await summary.fill("화면을 다시 그려도 확인한 제외 결과는 열리지 않아요");
  await expect(summary).toHaveValue("화면을 다시 그려도 확인한 제외 결과는 열리지 않아요");
  await expect(modal).toHaveCount(0);
  for (const t of targets) {
    const chip = page.getByRole("button", { name: `${t.name} · AI가 뺀 문구 3개`, exact: true });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(modal).toHaveCount(1);
    await expect(modal).toContainText(`${t.name} · 이 정보들은 상세 페이지에 못 넣어서 빼 뒀어요 🙂`);
    await modal.getByRole("button", { name: "확인", exact: true }).click();
  }
  await page.reload();
  await page.getByRole("button", { name: "상세페이지 편집", exact: true }).click();
  await expect(page.getByTestId("excluded-chip")).toHaveCount(2);
  await expect(modal).toHaveCount(0);
  clean();
});

test("DEV-186 AC-SRC-11: existing product canvas has no next-step story hints", async ({ page }) => {
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const snapshot = { representativeUri: null, kind: "modules", hiddenSectionIds: [],
    content: { blocks: [] }, modules: [{ id: "summary", enabled: true,
      texts: [{ fieldKey: "summary", value: "기존 상품 설명" }], photos: [] }] };
  await page.route("**/api/source-analysis/product-workspaces", (route) => route.fulfill({
    json: { productId: "p-house", batchId: "detail-batch", targetId: "detail-target",
      version: 1, baseProductVersion: 1, hasUnpublishedChanges: false,
      snapshot, publishedSnapshot: snapshot },
  }));
  await page.goto(`${producerUrl}/products/p-house/detail`);
  const summary = page.getByLabel("한눈에 보기 내용", { exact: true });
  await expect(summary).toHaveValue("기존 상품 설명");
  await summary.fill("피로회복 32,000원 고객센터");
  await expect(summary).toHaveValue("피로회복 32,000원 고객센터");
  await expect(page.getByText("금액은 다음 단계(판매·가격)에서 직접 채워 주세요", { exact: true })).toHaveCount(0);
  await expect(page.getByText("건강 효능 문구는 넣을 수 없어요", { exact: true })).toHaveCount(0);
  await expect(page.getByText("팜클럽 공통 정책과 겹치는 문구인지 확인해 주세요", { exact: true })).toHaveCount(0);
  clean();
});

for (const composer of [false, true]) {
  test(`DEV-186 AC-SRC-5/11: ${composer ? "composer" : "workspace"} accepts an older review response`, async ({ page }) => {
    const clean = monitor(page);
    await loginProducer(page, "강영수");
    const fixture = reviewFixture();
    fixture.review.refinementResults = undefined;
    await serveReview(page, fixture);
    await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}${composer ? "&composer=1" : ""}`);
    // 기존 작업 화면은 편집 탭을 열어야 상세 편집기가 보인다.
    if (!composer) await page.getByRole("button", { name: "상세페이지 편집", exact: true }).click();
    const summary = page.getByLabel("한눈에 보기 내용", { exact: true });
    await expect(summary).toHaveValue("제주에서 자란 감귤");
    await summary.fill("직접 고친 설명");
    await expect(summary).toHaveValue("직접 고친 설명");
    await expect(page.getByTestId("excluded-chip")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (composer) {
      // FillInput retains the page layout: the product heading input has no extra wrapper.
      const title = page.getByLabel("상품명", { exact: true });
      await expect(title).toBeVisible();
      await expect(title.locator("..")).toHaveCSS("gap", "4px");
    }
    clean();
  });
}

for (const composer of [false, true]) {
  test(`DEV-182 AC-SRC-8: ${composer ? "composer" : "workspace"} shows PDF skipped pages`, async ({ page }) => {
    await loginProducer(page, "강영수");
    const fixture = reviewFixture();
    fixture.batch.sources[0].filename = "합성25쪽.pdf";
    fixture.batch.sources[0].mime = "application/pdf";
    fixture.batch.sources[0].pageCount = 20;
    fixture.run.items[0] = { ...fixture.run.items[0], id: "prepare", phase: "PREPARE",
      ...{ pagesAnalysed: 20, pagesSkipped: 5 } };
    await serveReview(page, fixture);
    await page.goto(`${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}${composer ? "&composer=1" : ""}`);
    if (composer) await page.getByRole("button", { name: "사진·자료 펼치기", exact: true }).click();
    await expect(page.getByText("합성25쪽.pdf: 앞 20쪽만 분석했어요. 나머지 5쪽은 필요하면 나눠서 올려 주세요.", { exact: true })).toBeVisible();
    await expect(page.getByText(/자료를 처리하지 못했어요/)).toHaveCount(0);
  });

  test(`DEV-182 AC-SRC-5/8: ${composer ? "composer" : "workspace"} empty chunks do not imply an empty file`, async ({ page }) => {
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
    const url = `${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}${composer ? "&composer=1" : ""}`;
    await page.goto(url);
    if (composer) await page.getByRole("button", { name: "사진·자료 펼치기", exact: true }).click();
    await expect(page.getByText(/추출할 내용을 찾지 못했어요/)).toHaveCount(0);
    // When every chunk is empty, the API publishes one file-level reason.
    fixture.run.items = fixture.run.items.slice(0, 3).map((item, index) => ({
      ...item, acceptedCount: 0, emptyReason: index === 0 ? "NO_CANDIDATES" : null,
    }));
    await page.reload();
    if (composer) await page.getByRole("button", { name: "사진·자료 펼치기", exact: true }).click();
    await expect(page.getByText("긴합성자료.txt: 추출할 내용을 찾지 못했어요. 원문을 확인해 주세요.", { exact: true })).toHaveCount(1);
  });

  test(`DEV-182 AC-SRC-5/8: ${composer ? "composer" : "workspace"} rejected and oversized notices`, async ({ page }) => {
    await loginProducer(page, "강영수");
    const fixture = reviewFixture();
    fixture.run.status = "PARTIAL";
    fixture.run.items[0] = { ...fixture.run.items[0], phase: "EXTRACT", status: "PARTIAL",
      error: "CANDIDATES_REJECTED", acceptedCount: 2, rejectedCount: 1 };
    await serveReview(page, fixture);
    const url = `${producerUrl}/products/source-analysis?batchId=${fixture.batch.id}${composer ? "&composer=1" : ""}`;
    const open = async () => {
      await page.goto(url);
      if (composer) await page.getByRole("button", { name: "사진·자료 펼치기", exact: true }).click();
    };
    await open();
    await expect(page.getByText("원문자료.txt: 근거를 확인하지 못한 후보 1개는 제외했어요.", { exact: true })).toBeVisible();
    fixture.run.items[0] = { ...fixture.run.items[0], status: "FAILED", acceptedCount: 0,
      emptyReason: "ALL_CANDIDATES_REJECTED" };
    await open();
    await expect(page.getByText("원문자료.txt: 근거를 확인하지 못한 내용은 제외했어요. 원문을 확인해 주세요.", { exact: true })).toHaveCount(1);
    await expect(page.getByText(/추출한 내용의 근거를 확인하지 못했어요/)).toHaveCount(0);
    fixture.run.items[0] = { ...fixture.run.items[0], phase: "REFINE", status: "SUCCEEDED",
      error: null, rejectedCount: 0, emptyReason: "REFINE_INPUT_LIMIT", candidatesSkipped: 1 };
    await open();
    await expect(page.getByText("내용이 많아 문구를 정리하지 못했어요. 자료를 나눠서 올려 주세요.", { exact: true })).toBeVisible();
    await expect(page.getByText(/상세에 넣을 수 있는 문구가 남지 않았어요/)).toHaveCount(0);
  });
}
