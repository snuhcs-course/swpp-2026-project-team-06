import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SourceBatch, SourceDraft, SourceReview, SourceRun } from "@farmclub/api";
import { test, expect } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginProducer, producerUrl } from "./helpers";

const mockText = "테스트 감귤\n제주산 감귤입니다.\n서늘한 곳에 보관해 주세요.";
// DEV-361 PR C: the 2-tab workspace screen is gone. The selling p-house is opened in the composer ('상품 수정' →
// `/products/p-house/detail`), its AI sheet takes the source, '임시 저장' keeps the page private and '상품에 반영'
// applies it after the confirm sheet. The AI sheet shows the run state ('실패') and, like the 2-tab screen, the per-file
// failure line ('자료를 처리하지 못했어요…', C-25).
const savedNotice = "비공개로 저장했어요. '상품에 반영'을 누르기 전까지 구매자 화면은 그대로예요.";
const formats = ["text", "image", "long-image", "pdf"] as const;

// Same run_once driver as new-product-composer. Guard both settings and persisted
// runs: changing the environment alone cannot turn an already queued paid run mock.
function python(code: string, args: string[] = []) {
  return execFileSync(path.resolve("server/.venv/bin/python"), ["-c", code, ...args], {
    cwd: path.resolve("server"),
    env: {
      ...process.env, APP_ENV: "local", SOURCE_ANALYSIS_PROVIDER: "mock",
      SOURCE_STORAGE: "local", OPENAI_API_KEY: "", OPENROUTER_API_KEY: "", ANTHROPIC_API_KEY: "",
    },
    timeout: 120_000,
    encoding: "utf8",
    stdio: "pipe",
  });
}

// Restore from seed truth on every worker, including after a failed test. A
// beforeAll snapshot would capture polluted data when Playwright restarts a worker.
const restoreSeed = `
from sqlalchemy import select, delete
from sqlalchemy.engine import make_url
from tests import migrations_models
from app.catalog.models import Product
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.seed import seed_product
from app.source_analysis.models import (
 Batch, Asset, Page, Run, Item, Candidate, ReviewedField, Draft,
 ProductWorkspace, PublicPhoto, RequestRecord,
)
from app.source_analysis.storage import Storage

cfg = get_settings()
assert cfg.app_env == 'local' and cfg.source_analysis_provider == 'mock'
assert cfg.source_storage == 'local'
assert make_url(cfg.database_url).host in ('localhost', '127.0.0.1', '::1')
pid = 'p-house'
with get_sessionmaker()() as db, db.begin():
 product = db.get(Product, pid)
 assert product is not None, 'Missing seed product p-house'
 bids = set(db.scalars(select(ProductWorkspace.batch_id).where(
  ProductWorkspace.product_id == pid)))
 bids.update(batch.id for batch in db.scalars(select(Batch))
  if any(target.get('productId') == pid for target in batch.targets))
 assets = list(db.scalars(select(Asset).where(Asset.batch_id.in_(bids))))
 aids = [asset.id for asset in assets]
 pages = list(db.scalars(select(Page).where(Page.asset_id.in_(aids))))
 photos = list(db.scalars(select(PublicPhoto).where(PublicPhoto.product_id == pid)))
 # Product photo references have no private file (storage_key='').
 # Earlier composer specs can leave these references in the shared seed product.
 storage_keys = {asset.storage_key for asset in assets if not asset.product_photo}
 storage_keys.update(key for page in pages
  for key in (page.image_key, page.sanitized_key) if key)
 storage_keys.update(photo.storage_key for photo in photos)
 requests = [row.id for row in db.scalars(select(RequestRecord).where(
  RequestRecord.farm_id == product.farm_id))
  if row.scope.split('/')[0] in bids
  or row.scope in ('page-save:' + pid, 'page-apply:' + pid)
  or row.response.get('productId') == pid
  or row.response.get('id') in bids]
 rids = select(Run.id).where(Run.batch_id.in_(bids))
 # The seed creates no source rows for this product. Include soft-deleted
 # batches/assets and every run/item phase (including refinements).
 for model, condition in (
  (RequestRecord, RequestRecord.id.in_(requests)),
  (ProductWorkspace, ProductWorkspace.product_id == pid),
  (PublicPhoto, PublicPhoto.product_id == pid),
  (Draft, Draft.batch_id.in_(bids)),
  (ReviewedField, ReviewedField.batch_id.in_(bids)),
  (Candidate, Candidate.batch_id.in_(bids)),
  (Item, Item.run_id.in_(rids)),
  (Run, Run.batch_id.in_(bids)),
  (Page, Page.asset_id.in_(aids)),
  (Asset, Asset.batch_id.in_(bids)),
  (Batch, Batch.id.in_(bids)),
 ):
  db.execute(delete(model).where(condition))
 seed_product(db, pid)
# Delete files only after the database transaction commits successfully.
store = Storage()
for key in storage_keys:
 store.delete(key)
`;

// DEV-361: the composer moves an existing page into its draft (DEV-346), and producer-confirmed values win over AI
// results. Each format starts from p-house without a page (no description, photos or detail) so the composer opens
// it empty and the analysis fills it, as the 2-tab screen's fresh batch did.
const clearPage = `
from tests import migrations_models
from app.catalog.models import Product
from app.core.db import get_sessionmaker
with get_sessionmaker()() as db, db.begin():
 product = db.get(Product, 'p-house')
 product.description = ''
 product.photos = []
 product.detail_content = None
 product.module_detail = None
 product.version += 1
`;

test.beforeEach(() => {
  if (process.env.SOURCE_ANALYSIS_ENABLED !== "true") return;
  expect(process.env.SOURCE_ANALYSIS_PROVIDER).toBe("mock");
  python(restoreSeed);
  python(clearPage);
});

// Playwright runs afterAll even on a failed test, before restarting its worker. Restores the seed page too.
test.afterAll(() => {
  if (process.env.SOURCE_ANALYSIS_ENABLED === "true") python(restoreSeed);
});

function work() {
  python(`
from sqlalchemy import select
from sqlalchemy.engine import make_url
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.source_analysis.models import Run
from app.source_analysis.worker import run_once
cfg = get_settings()
assert cfg.app_env == 'local' and cfg.source_analysis_provider == 'mock'
assert make_url(cfg.database_url).host in ('localhost', '127.0.0.1', '::1')
with get_sessionmaker()() as db:
 assert db.scalar(select(Run.id).where(Run.mode != 'mock')) is None, 'Non-mock runs in isolated DB'
for _ in range(100):
 if not run_once(): break
else:
 raise AssertionError('Worker queue did not drain')
`);
}

for (const format of formats) {
  test(`DEV-171 DEV-361 AC-SRC-1/2/5/6/7/9/11 ${format}: ${format === "text" ? "extracted" : "manual recovery"} draft to consumer`, async ({ page, browser }, testInfo) => {
    test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true", "Requires enabled local source API and isolated worker DB");
    test.setTimeout(240_000);
    expect(process.env.SOURCE_ANALYSIS_PROVIDER, "Explicitly select mock for the API and worker").toBe("mock");
    for (const url of [apiUrl, producerUrl, consumerUrl])
      expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(url).hostname);
    const artifacts = process.env.FARMCLUB_INTEGRATION_ARTIFACTS ?? testInfo.outputPath("steps");
    mkdirSync(artifacts, { recursive: true });
    const build = path.join(artifacts, `t12-${format}-build.json`);
    writeFileSync(build, JSON.stringify({
      gitSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      dirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0,
      startedAt: new Date().toISOString(), apiUrl, producerUrl, consumerUrl,
      provider: "mock", viewport: { width: 390, height: 850 },
      browser: browser.version(), test: testInfo.title,
    }, null, 2));
    await testInfo.attach(`${format}-build`, { path: build, contentType: "application/json" });
    const shot = async (step: string) => {
      const file = path.join(artifacts, `t12-${format}-${step}.png`);
      await page.screenshot({ path: file, fullPage: true });
      await testInfo.attach(`${format}-${step}`, { path: file, contentType: "image/png" });
    };
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 850 });
    await loginProducer(page, "강영수");
    const token = await apiLogin(page.request, "u-kang", "producer");
    const headers = { Authorization: `Bearer ${token}` };
    const get = async <T,>(url: string): Promise<T> => {
      const response = await page.request.get(`${apiUrl}${url}`, { headers });
      expect(response.status(), url).toBe(200);
      return response.json();
    };
    const publicProduct = async () => {
      const response = await page.request.get(`${apiUrl}/api/products/p-house`);
      expect(response.status()).toBe(200);
      return response.json();
    };
    const before = await publicProduct();
    // '상품 수정' opens the product's own batch in the composer (DEV-346, DEV-361 C-1)
    await page.goto(`${producerUrl}/products/p-house/detail`);
    await expect(page).toHaveURL(/composer=1/);
    const batchId = new URL(page.url()).searchParams.get("batchId")!;
    const base = `/api/source-analysis/batches/${batchId}`;
    const batch = () => get<SourceBatch>(base);
    const review = () => get<SourceReview>(`${base}/review`);
    const runs = () => get<{ items: SourceRun[] }>(`${base}/runs`);
    const openButton = page.getByRole("button", { name: "AI 시트 열기", exact: true });
    const closeSheet = () => page.getByRole("button", { name: "AI 시트 닫기", exact: true }).first().click();
    const start = page.getByRole("button", { name: /^AI로 (?:다시 )?채우기$/ });
    const status = page.getByTestId("source-analysis-status");
    await openButton.click();
    // The analysis input mirrors the selling product's variety (DEV-346 refresh_basic_info)
    await expect(page.getByLabel("과일 품종명", { exact: true })).toHaveValue(before.variety);

    let original: Buffer;
    if (format === "text") {
      original = Buffer.from(mockText);
      await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
      await page.getByLabel("첨부 내용").fill(mockText);
      await page.getByLabel("첨부 내용").blur();
      await expect(page.getByRole("button", { name: "텍스트 내용 수정", exact: true })).toBeVisible();
    } else {
      // Reuse synthetic.material's PIL image/PDF generator; no extractor patch,
      // invented checksums, network OCR, or production fixture is involved.
      const file = testInfo.outputPath(`fixture-${format}.${format === "pdf" ? "pdf" : "png"}`);
      python(`
import io, sys
from pathlib import Path
from PIL import Image
from app.ai.source_analysis import MOCK_TEXT
from app.source_analysis.synthetic import material
kind, output = sys.argv[1:]
data, _, _ = material({'kind': 'pdf' if kind == 'pdf' else 'image', 'text': MOCK_TEXT})
if kind == 'long-image':
 image = Image.new('RGB', (900, 6000), 'white')
 with Image.open(io.BytesIO(data)) as tile: image.paste(tile, (0, 0))
 out = io.BytesIO()
 image.save(out, 'PNG')
 data = out.getvalue()
Path(output).write_bytes(data)
`, [format, file]);
      original = readFileSync(file);
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "자료 파일 추가", exact: true }).click();
      await (await chooser).setFiles(file);
      await expect(page.getByTestId("source-material-box").getByTestId("attachment-tile")).toHaveCount(1);
    }
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "상품사진 추가", exact: true }).click();
    await (await chooser).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
    await expect(start).toBeEnabled();
    const uploaded = await batch();
    const source = uploaded.sources.find((s) => !s.originalPhoto)!;
    expect(uploaded.targets[0].productId).toBe("p-house");
    expect(source.mime).toBe(format === "text" ? "text/plain" : format === "pdf" ? "application/pdf" : "image/png");
    const content = await page.request.get(`${apiUrl}${base}/sources/${source.id}/content`, { headers });
    expect(content.status()).toBe(200);
    expect(content.headers()["cache-control"]).toBe("no-store");
    expect(await content.body()).toEqual(original);
    await shot("upload");

    const analyze = async () => {
      // 'AI로 채우기' lives in the AI sheet, which closes once an analysis starts
      if (await openButton.isVisible()) await openButton.click();
      const started = page.waitForResponse((r) => r.url().endsWith(`${base}/runs`) && r.request().method() === "POST");
      await start.click();
      expect((await started).status()).toBe(202);
      work();
      await expect.poll(async () => (await runs()).items[0].status, { timeout: 20_000 })
        .toBe(format === "text" ? "SUCCEEDED" : "FAILED");
      await expect(status).toHaveCount(0, { timeout: 20_000 });
      await expect(page.getByTestId("product-detail-page")).toBeVisible();
    };
    await analyze();
    if (format !== "text") {
      const failed = (await runs()).items[0];
      expect(failed.mode).toBe("mock");
      // mock 스택의 시각 자료 실패는 OCR 미설정(로컬·CI 기본) 또는 OCR 뒤 mock 추출 거절 두 가지뿐이다.
      expect(
        failed.items.some(
          (i) => i.status === "FAILED" && ["OCR_NOT_CONFIGURED", "UNSUPPORTED_MOCK_SOURCE"].includes(i.error ?? ""),
        ),
      ).toBe(true);
      await openButton.click();
      await expect(page.getByText("실패 · 테스트 결과", { exact: true })).toBeVisible();
      // DEV-361 C-25: the AI sheet's run panel names the failed file as the 2-tab screen did
      await expect(page.getByText("자료를 처리하지 못했어요. 내용을 확인한 후 다시 시도해 주세요.", { exact: false }).first()).toBeVisible();
      // DEV-287: retry directly, keep the local click gate, and drain the real mock retry.
      const retry = page.getByRole("button", { name: "재시도", exact: true });
      await expect(page.getByRole("checkbox", { name: /비용이 다시/ })).toHaveCount(0);
      await expect(retry).toBeEnabled();
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      const retried = page.waitForResponse((r) => r.url().endsWith(`${base}/runs/${failed.id}/retry`)
        && r.request().method() === "POST");
      await retry.click();
      expect((await retried).status()).toBe(202);
      await expect(status).toBeVisible();
      await expect(retry).toHaveCount(0);
      work();
      await expect.poll(async () => (await runs()).items[0].status, { timeout: 20_000 }).toBe("FAILED");
      // Poll the completed run while still inside the three-second local gate.
      await page.clock.fastForward(2500);
      await expect(status).toHaveCount(0);
      await expect(retry).toBeDisabled();
      await page.clock.fastForward(501);
      await expect(retry).toBeEnabled();
      await page.clock.resume();
      await shot("analysis-failure");
      await closeSheet();
      testInfo.annotations.push({ type: "gap", description: "Visual extraction success/evidence NOT RUN: mock accepts only text fixture checksums. Remaining steps exercise manual recovery after real analysis failure." });
    }
    const summary = page.getByLabel("상품 소개 보충 내용", { exact: true });
    const storageText = page.getByLabel("보관 방법 내용", { exact: true });
    // An empty introduction is added from the composer's '내용 추가' chips
    if (format !== "text") await page.getByRole("button", { name: "상품 소개 추가", exact: true }).click();
    await expect(summary).toHaveValue(format === "text" ? "제주산 감귤입니다." : "");
    expect((await publicProduct()).moduleDetail).toEqual(before.moduleDetail);
    await shot("private-draft");
    if (format === "text") {
      await summary.click();
      await expect(page.getByRole("button", { name: "원문 보기", exact: true })).toHaveCount(0);
      const candidate = (await review()).candidates.find((c) => c.fieldKey === "summary")!;
      expect(candidate.evidence[0]).toMatchObject({ sourceId: source.id, page: 1, quote: "제주산 감귤입니다." });
      await shot("evidence");
    } else {
      expect((await review()).candidates).toHaveLength(0);
      await shot("evidence-unavailable");
    }

    const manual = `T12 ${format} 생산자가 확인한 소개`;
    const storage = `T12 ${format} 서늘한 곳에 보관해 주세요.`;
    await summary.fill(manual);
    if (format !== "text") await page.getByRole("button", { name: "보관 방법 추가", exact: true }).click();
    await storageText.fill(storage);
    await shot("edit");
    // The composer removes a module instead of hiding its section; its text stays in the draft.
    await storageText.focus();
    await page.getByRole("button", { name: "보관 방법 제외", exact: true }).click();
    await expect(storageText).toHaveCount(0);
    await shot("hide");
    const save = page.getByRole("button", { name: "임시 저장", exact: true });
    const keys: string[] = [];
    await page.route(`**${base}/editor`, async (route) => {
      keys.push(route.request().headers()["idempotency-key"]);
      if (keys.length === 1)
        return route.fulfill({ status: 503, json: { code: "UNAVAILABLE", message: "T12 저장 연결 실패" } });
      await route.continue();
    });
    await save.click();
    await expect(page.getByText("T12 저장 연결 실패", { exact: true })).toBeVisible();
    await expect(summary).toHaveValue(manual);
    await expect(storageText).toHaveCount(0);
    await shot("failure");
    await save.click();
    await expect(page.getByText(savedNotice, { exact: true })).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    await shot("recovery");
    await page.reload();
    await expect(summary).toHaveValue(manual);
    await expect(storageText).toHaveCount(0);
    await page.getByRole("button", { name: "보관 방법 추가", exact: true }).click();
    await expect(storageText).toHaveValue(storage);
    await shot("restore");
    await save.click();
    await expect(page.getByText(savedNotice, { exact: true })).toBeVisible();
    await shot("save");
    await page.reload();
    await expect(summary).toHaveValue(manual);
    await expect(storageText).toHaveValue(storage);
    await shot("reopen");
    await analyze();
    await expect(summary).toHaveValue(manual);
    await expect(storageText).toHaveValue(storage);
    await shot("reanalysis");
    await save.click();
    await expect(page.getByText(savedNotice, { exact: true })).toBeVisible();

    const publicContext = await browser.newContext();
    try {
      const buyer = await publicContext.newPage();
      await buyer.goto(`${consumerUrl}/products/p-house`);
      await expect(buyer.getByText(before.name, { exact: true }).first()).toBeVisible();
      const unchanged = async () => {
        expect((await publicProduct()).moduleDetail).toEqual(before.moduleDetail);
        await expect(buyer.getByText(manual, { exact: true })).toHaveCount(0);
        await expect(buyer.getByText(storage, { exact: true })).toHaveCount(0);
      };
      await unchanged();
      await buyer.screenshot({ path: path.join(artifacts, `t12-${format}-before-apply.png`), fullPage: true });
      await page.getByRole("button", { name: "구매자 화면 보기", exact: true }).click();
      const preview = page.getByTestId("source-detail").last();
      await expect(preview.getByText(manual, { exact: true })).toBeVisible();
      const previewText = await preview.innerText();
      const drafts = await get<{ items: SourceDraft[] }>(`${base}/drafts`);
      const approved = drafts.items[0].snapshot.previewModules;
      expect(approved.find((m) => m.id === "summary")!.texts[0].value).toBe(manual);
      await page.getByRole("button", { name: "편집하기", exact: true }).click();
      await expect(summary).toHaveValue(manual);
      // A selling product applies through the confirm sheet (DEV-361 C-8)
      await page.getByRole("button", { name: /^상품에 반영/ }).click();
      const confirm = page.getByTestId("apply-confirm");
      await expect(confirm.getByRole("button", { name: "반영하기", exact: true })).toBeVisible();
      await expect(confirm.getByTestId("change-group-now")).toContainText("판매페이지 상세");
      await unchanged();
      await shot("apply-confirmation");
      await confirm.getByRole("button", { name: "반영하기", exact: true }).click();
      await expect(page.getByText("상품에 반영했어요", { exact: true })).toBeVisible();
      await expect(page).toHaveURL(/composer=1/);
      await shot("apply");
      const applied = await publicProduct();
      expect(applied.moduleDetail.modules.map((m: { id: string; texts: unknown }) => ({ id: m.id, texts: m.texts })))
        .toEqual(approved.map((m) => ({ id: m.id, texts: m.texts })));
      expect(JSON.stringify(applied)).not.toMatch(/source-analysis|storageKey|storage_key|private-sources/);
      await buyer.reload();
      await expect(buyer.getByTestId("source-detail")).toHaveText(previewText, { useInnerText: true });
      await expect(buyer.getByTestId("source-module-summary").getByText(manual, { exact: true })).toBeVisible();
      await expect(buyer.getByTestId("source-module-storage").getByText(storage, { exact: true })).toBeVisible();
      await expect(buyer.getByTestId("excluded-chip")).toHaveCount(0);
      await expect(buyer.getByTestId("excluded-modal")).toHaveCount(0);
      await buyer.screenshot({ path: path.join(artifacts, `t12-${format}-consumer.png`), fullPage: true });
      // Public-media's GET/content-type pattern, extended to every actual private
      // source endpoint and both image variants, with a cookie-free client.
      for (const asset of (await batch()).sources) {
        for (const suffix of ["/content", "/text", "/pages/1", "/pages/1/image", "/pages/1/image?sanitized=false"]) {
          const response = await publicContext.request.get(`${apiUrl}${base}/sources/${asset.id}${suffix}`);
          expect([401, 403, 404], `${asset.id}${suffix}`).toContain(response.status());
        }
      }
      const consumerToken = await apiLogin(publicContext.request, "u-minji", "consumer");
      const wrongRole = await publicContext.request.get(`${apiUrl}${base}/sources/${source.id}/content`, { headers: { Authorization: `Bearer ${consumerToken}` } });
      expect([403, 404]).toContain(wrongRole.status());
      const publicPhotos = [{ uri: applied.photo }, ...applied.moduleDetail.modules.flatMap((m: { photos: { uri: string }[] }) => m.photos)];
      expect(publicPhotos.length).toBeGreaterThan(0);
      for (const photo of publicPhotos) {
        expect(photo.uri).toMatch(/^\/api\/source-media\//);
        const response = await publicContext.request.get(`${apiUrl}${photo.uri}`);
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toMatch(/^image\//);
      }
      await shot("privacy");
      const record = path.join(artifacts, `t12-${format}-run.json`);
      writeFileSync(record, JSON.stringify({ format, batchId, sourceId: source.id, mode: (await runs()).items[0].mode, automatedExtraction: format === "text", previewText, appliedTexts: applied.moduleDetail.modules.map((m: { id: string; texts: unknown }) => ({ id: m.id, texts: m.texts })) }, null, 2));
      await testInfo.attach(`${format}-run`, { path: record, contentType: "application/json" });
    } finally {
      await publicContext.close();
    }
    expect(errors).toEqual([]);
  });
}
