import { test, expect, type Page } from "./fixtures";
import { apiLogin, apiUrl, loginProducer, producerUrl } from "./helpers";
import { execFileSync } from "node:child_process";
import path from "node:path";

// DEV-332. Written from the UAT requirements and existing API fixtures,
// without reading the editor implementation. All failed saves are explicit API faults.
test.use({ viewport: { width: 360, height: 850 } });
test.beforeEach(() => test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true"));
const freshProducts: { productId: string; batchId: string }[] = [];
test.afterEach(async () => {
  for (const product of freshProducts.splice(0))
    await removeFreshProduct(product.productId, product.batchId);
});

async function recoveryFixture(page: Page) {
  await loginProducer(page, "강영수");
  const token = await apiLogin(page.request, "u-kang", "producer");
  const headers = { Authorization: `Bearer ${token}` };
  const opened = await page.request.post(`${apiUrl}/api/source-analysis/product-workspaces`, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() }, data: {},
  });
  expect(opened.ok(), await opened.text()).toBeTruthy();
  const { productId, batchId } = await opened.json();
  freshProducts.push({ productId, batchId });
  const batch = await (await page.request.get(`${apiUrl}/api/source-analysis/batches/${batchId}`, { headers })).json();
  const source = { id: "uat-source", filename: "감귤자료.txt", mime: "text/plain",
    targetIds: [batch.targets[0].id], common: false, originalPhoto: false,
    revision: 1, sanitizationVersion: 1, privacyApproved: true, status: "PREPARED", pageCount: 1, error: null };
  await page.route(`**/api/source-analysis/batches/${batchId}`, (route) =>
    route.fulfill({ json: { ...batch, sources: [source] } }));
  await page.route(`**/batches/${batchId}/runs`, (route) => route.fulfill({ json: { items: [{
    id: "uat-run", mode: "mock", model: "mock", status: "SUCCEEDED", completed: 1, total: 1,
    inputs: [{ id: source.id, revision: 1, description: "" }], items: [{
      id: "uat-refine", phase: "REFINE", assetId: source.id, revision: 1,
      status: "SUCCEEDED", error: null, acceptedCount: 1, rejectedCount: 0,
      emptyReason: null, candidatesSkipped: 0,
    }],
  }] } }));
  let summary = "서버에 있는 감귤 소개";
  let reads = 0;
  let failRefresh = false;
  let rejectSaves = true;
  let gate: Promise<void> | null = null;
  let release!: () => void;
  await page.route(`**/batches/${batchId}/review`, async (route) => {
    reads++;
    if (gate) await gate;
    if (failRefresh) return route.fulfill({ status: 400, json: {
      code: "VALIDATION_ERROR", message: "최신 판매페이지를 불러오지 못했어요.",
    } });
    const field = { targetId: batch.targets[0].id, fieldKey: "summary", value: summary,
      state: "CONFIRMED", provenance: "MANUAL", candidateIds: [], photoAssetIds: [], illustrationId: null };
    return route.fulfill({ json: { reviewVersion: batch.reviewVersion,
      targets: batch.targets, candidates: [], fields: [], conflicts: [], sourcePhotoRequests: [],
      editorFields: [{ status: "ready", field }, { status: "ready", field: {
        ...field, fieldKey: "taste", value: "달콤한 과즙",
      } }], refinementResults: {} } });
  });
  await page.route(`**/batches/${batchId}/editor`, (route) => rejectSaves
    ? route.fulfill({ status: 409, json: {
      code: "VERSION_MISMATCH", message: "다른 곳에서 판매페이지가 바뀌었어요.",
      details: { reason: "VERSION_MISMATCH" },
    } })
    : route.fulfill({ json: { drafts: [] } }));
  await page.goto(`${producerUrl}/products/${productId}/detail`);
  await expect(page).toHaveURL(new RegExp(`source-analysis\\?[^#]*batchId=${batchId}.*composer=1`));
  const story = page.getByLabel("상품 소개 보충 내용", { exact: true });
  await expect(story).toHaveValue(summary);
  return {
    productId, batchId, headers, story,
    latest(value: string) { summary = value; },
    fail(value: boolean) { failRefresh = value; },
    acceptSaves() { rejectSaves = false; },
    reads: () => reads,
    hold() { gate = new Promise<void>((resolve) => { release = resolve; }); },
    release() { gate = null; release(); },
  };
}

async function removeFreshProduct(productId: string, batchId: string) {
  // These fixtures have no orders or uploaded assets. Remove only their generated IDs.
  execFileSync(path.resolve("server/.venv/bin/python"), ["-c", `
from tests import migrations_models
from app.catalog.models import Product
from app.source_analysis.models import Batch, ProductWorkspace
from app.core.db import get_sessionmaker
import sys
with get_sessionmaker()() as db:
 for cls, ident in ((ProductWorkspace, sys.argv[1]), (Batch, sys.argv[2]), (Product, sys.argv[1])):
  row = db.get(cls, ident)
  if row is not None:
   db.delete(row)
   db.flush()
 db.commit()
`, productId, batchId], { cwd: path.resolve("server"), env: process.env, stdio: "pipe" });
}

async function failPageSave(page: Page, story: ReturnType<Page["getByLabel"]>, text: string) {
  await story.fill(text);
  const failed = page.waitForResponse((response) => response.url().endsWith("/editor") && response.status() === 409);
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await failed;
  await expect(story).toHaveValue(text);
  await expect(page.getByRole("button", { name: "판매페이지 다시 불러오기", exact: true })).toBeVisible();
}

test("DEV-332: cancel preserves page text; confirmed refresh fetches before discarding and preserves product fields", async ({ page }) => {
  test.setTimeout(90000);
  const fixture = await recoveryFixture(page);
  try {
    const name = page.getByLabel("상품명", { exact: true });
    const origin = page.getByLabel("원산지", { exact: true });
    await name.fill("복구 뒤에도 남을 상품명");
    await origin.fill("제주 서귀포");
    await page.getByText("상품정보", { exact: true }).click();
    const storage = page.getByLabel("보관", { exact: true });
    await storage.fill("서늘한 곳에 보관");
    await failPageSave(page, fixture.story, "실패해도 남아야 하는 내가 쓴 소개");
    const reopen = page.getByRole("button", { name: "판매페이지 다시 불러오기", exact: true });
    await reopen.scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".artifacts/uat-followup-review/recovery.png" });
    await reopen.click();
    const confirm = page.getByRole("button", { name: "판매페이지 수정 버리고 불러오기", exact: true });
    await expect(confirm).toBeVisible();
    if (process.env.FARMCLUB_CAPTURE_REFINEMENT) {
      await expect(confirm).toBeInViewport();
      await page.screenshot({ path: `.artifacts/uat-refinement/confirmation-${process.env.FARMCLUB_CAPTURE_REFINEMENT}.png`, animations: "disabled" });
    }
    // The confirmation explains both the discard boundary and the preserved fields.
    const dialog = page.getByRole("dialog");
    for (const pattern of [/글|문구|텍스트|내용/, /사진/, /모듈|항목|내용 선택|구성/, /상품명/, /원산지/, /보관/, /옵션/])
      await expect(dialog.getByText(pattern).last()).toBeVisible();
    await page.getByRole("button", { name: "수정 계속하기", exact: true }).click();
    await expect(fixture.story).toHaveValue("실패해도 남아야 하는 내가 쓴 소개");
    fixture.latest("다른 기기에서 저장한 최신 소개");
    fixture.hold();
    await reopen.click();
    const previousReads = fixture.reads();
    await confirm.click();
    await expect.poll(fixture.reads).toBeGreaterThan(previousReads);
    await expect(fixture.story).toHaveValue("실패해도 남아야 하는 내가 쓴 소개");
    fixture.release();
    await expect(fixture.story).toHaveValue("다른 기기에서 저장한 최신 소개");
    await expect(reopen).toHaveCount(0);
    await expect(name).toHaveValue("복구 뒤에도 남을 상품명");
    await expect(origin).toHaveValue("제주 서귀포");
    await expect(storage).toHaveValue("서늘한 곳에 보관");
    fixture.acceptSaves(); // the concurrent writer has finished; subsequent saves can succeed
    await page.getByRole("button", { name: "임시 저장", exact: true }).click();
    await expect(page.getByText(/비공개로 저장했어요/)).toBeVisible();
    const saved = await (await page.request.get(`${apiUrl}/api/products/mine/${fixture.productId}`, { headers: fixture.headers })).json();
    expect(saved.name).toBe("복구 뒤에도 남을 상품명");
    expect(saved.info.origin).toBe("제주 서귀포");
    expect(saved.info.storage).toBe("서늘한 곳에 보관");
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("DEV-332: a failed refresh keeps local page edits and can be retried", async ({ page }) => {
  const fixture = await recoveryFixture(page);
  try {
    await failPageSave(page, fixture.story, "재조회가 실패해도 지우면 안 되는 글");
    fixture.fail(true);
    await page.getByRole("button", { name: "판매페이지 다시 불러오기", exact: true }).click();
    const failed = page.waitForResponse((response) => response.url().endsWith("/review") && response.status() === 400);
    await page.getByRole("button", { name: "판매페이지 수정 버리고 불러오기", exact: true }).click();
    await failed;
    await expect(fixture.story).toHaveValue("재조회가 실패해도 지우면 안 되는 글");
    fixture.fail(false);
    fixture.latest("재시도에서 받은 최신 소개");
    await page.getByRole("button", { name: "판매페이지 다시 불러오기", exact: true }).click();
    await page.getByRole("button", { name: "판매페이지 수정 버리고 불러오기", exact: true }).click();
    await expect(fixture.story).toHaveValue("재시도에서 받은 최신 소개");
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});
