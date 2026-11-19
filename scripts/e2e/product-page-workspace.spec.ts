import { test, expect } from "./fixtures";
import { apiUrl, producerUrl, loginProducer, monitor } from "./helpers";

// DEV-346: 판매페이지 수정은 composer로 연다(scripts/e2e/page-editor-unified.spec.ts).
// DEV-361 PR C: 예전 편집기(ProductPageEditor)는 지웠다. composer로 옮기지 못한 페이지(요약 한 칸 3000자를 넘는 블록
// 페이지, 서버가 composer: false)는 같은 composer를 상품만으로 열고(C-1), 예전 편집기 수정본이 composer 작업과 겹치면
// (LEGACY_REVISION) '상품 수정'이 고르게 한다(C-17). 시드 p-house를 바꾸므로 파일 끝에 되돌린다.
// DEV-361 PR C: removed "AC-SRC-11 {360,390,430}px: heading visibility preserves excluded items through save and apply"
// (the old editor's always-visible section eye switch, its dimmed heading and '수정본 저장'; the composer canvas shows
// that switch only for an already hidden section, so there is no composer equivalent. Section exclude/add membership is
// covered by "AC-SRC-11: introduction can be removed and two empty additions retain independent membership" in
// producer-hardening.spec.ts, and excluded items in the preview by "DEV-179 AC-SRC-11: composer preview preserves excluded
// summary and retains the enabled taste field" in source-review-regressions.spec.ts).
// DEV-361 PR C: removed "AC-SRC-11: first editor upload preserves both representative and module placement" (a bug of
// the old editor's page snapshot, where one canvas upload set both the cover and the module photo; the composer keeps the
// cover in the batch and has no such combined upload. Cover selection in the composer is covered by "AC-SRC-11: text edits
// stay inside cards and representative selection survives reload and deletion" in source-editor.spec.ts).
const LONG = `${"가".repeat(2000)}`;
// 첫 테스트가 '상품에 반영'으로 바꾼 상품명을 되돌릴 시드 이름
let seedName = "";
async function unfitPage(script: string, extra = "") {
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
import sys
LONG = sys.argv[1]
EXTRA = sys.argv[2]
with get_sessionmaker()() as db:
${script}
 db.commit()
`,
      LONG,
      extra,
    ],
    { cwd: path.resolve("server"), env: process.env },
  );
}

// 상품 초안은 workspace 행에 있으므로 행을 지우면 남은 초안도 지워진다
const resetHouse = ` p = db.get(Product, 'p-house')
 p.module_detail = None
 p.detail_content = None
 if EXTRA: p.name = EXTRA
 p.version += 1
 row = db.get(ProductWorkspace, 'p-house')
 if row: db.delete(row)`;

test.afterAll(async () => {
  if (process.env.SOURCE_ANALYSIS_ENABLED !== "true") return;
  await unfitPage(resetHouse, seedName);
});

test("AC-SRC-9 DEV-361 C-1 C-7 C-8: a page the composer cannot take opens the product only and keeps edits private until explicit apply", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  test.setTimeout(90000);
  await unfitPage(` p = db.get(Product, 'p-house')
 p.module_detail = None
 p.detail_content = {'blocks': [{'id': f'long{i}', 'type': 'text', 'title': '', 'body': LONG} for i in (1, 2)]}
 p.version += 1
 row = db.get(ProductWorkspace, 'p-house')
 if row: db.delete(row)`);
  const clean = monitor(page);
  const publicName = async () =>
    (await (await page.request.get(`${apiUrl}/api/products/p-house`)).json()).name as string;
  const original = await publicName();
  seedName ||= original;
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products?filter=selling`);
  // The default group is selling; use the product-specific action, never generic upload entry.
  const card = page
    .getByRole("button", { name: /하우스 감귤 5kg.*상품 수정/ })
    .locator("..");
  await card.getByRole("button", { name: "상품 수정", exact: true }).click();
  await expect(page).toHaveURL(/\/products\/p-house\/detail$/);
  // composer로 옮기지 못한 페이지라 batch composer가 아니라 상품만 여는 composer다(DEV-361 C-1).
  const basic = page.getByTestId("product-basic-info");
  await expect(basic).toBeVisible();
  await expect(page).not.toHaveURL(/composer=1/);
  await expect(page.getByRole("button", { name: "AI 시트 열기" })).toHaveCount(0);
  // The long block page is shown as it is (read-only); '상세 고치기' is where it is edited.
  await expect(page.getByTestId("product-detail-page")).toContainText("가".repeat(40));
  await expect(page.getByRole("button", { name: "상세 고치기", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "상품에 반영", exact: true })).toBeVisible(); // no unapplied count
  // This server keeps a private product draft, so edits stay private until '상품에 반영' (C-7).
  const name = `${original} 산지직송`;
  await basic.getByLabel("상품명", { exact: true }).fill(name);
  await expect(page.getByRole("button", { name: "상품에 반영 (1)", exact: true })).toBeVisible();
  await expect(basic.getByLabel("상품명 수정됨", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(
    page.getByText("비공개로 저장했어요. '상품에 반영'을 누르기 전까지 구매자 화면은 그대로예요.", { exact: true }),
  ).toBeVisible();
  expect(await publicName()).toBe(original);
  await page.reload();
  await expect(basic.getByLabel("상품명", { exact: true })).toHaveValue(name);
  await expect(page.getByRole("button", { name: "상품에 반영 (1)", exact: true })).toBeVisible();
  // Buyer preview (the composer's header '미리보기') shows the edit and comes back with it.
  await page.getByRole("button", { name: "구매자 화면 보기", exact: true }).click();
  await expect(page.getByRole("button", { name: "편집하기", exact: true })).toBeVisible();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("가".repeat(40)).first()).toBeVisible();
  await page.getByRole("button", { name: "편집하기", exact: true }).click();
  await expect(basic.getByLabel("상품명", { exact: true })).toHaveValue(name);
  // The confirm sheet lists what buyers will see; '더 고치기' changes nothing.
  await page.getByRole("button", { name: "상품에 반영 (1)", exact: true }).click();
  const sheet = page.getByTestId("apply-confirm");
  await expect(sheet.getByText("판매 중인 상품이에요. 바뀌는 내용을 확인해 주세요.", { exact: true })).toBeVisible();
  await expect(sheet.getByTestId("change-group-now").getByLabel(`상품명, ${original}에서 ${name}으로`)).toBeVisible();
  await sheet.getByRole("button", { name: "더 고치기", exact: true }).click();
  expect(await publicName()).toBe(original);
  await page.getByRole("button", { name: "상품에 반영 (1)", exact: true }).click();
  await page.getByTestId("apply-confirm").getByRole("button", { name: "반영하기", exact: true }).click();
  await expect(page.getByText("상품에 반영했어요", { exact: true })).toBeVisible();
  // Stays on 상품 수정 after applying (C-8)
  await expect(page).toHaveURL(/\/products\/p-house\/detail$/);
  await expect(page.getByRole("button", { name: "상품에 반영", exact: true })).toBeVisible(); // no unapplied count
  expect(await publicName()).toBe(name);
  clean();
});

test("AC-SRC-9 DEV-361 C-17: an unapplied old-editor revision offers discarding it or opening the product only", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  await unfitPage(resetHouse, seedName);
  const clean = monitor(page);
  // The server answers LEGACY_REVISION only when an old-editor revision and composer work overlap (server tests cover
  // that state); here every composer open that does not discard is answered that way, from the real response.
  const opens: Record<string, unknown>[] = [];
  let blockedVersion = 0;
  await page.route("**/api/source-analysis/product-workspaces", async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    opens.push(body);
    const response = await route.fetch();
    if (body.composer && !body.discardChanges && response.ok()) {
      const json = await response.json();
      blockedVersion = json.version;
      return route.fulfill({ response, json: { ...json, composer: false, composerBlocked: "LEGACY_REVISION" } });
    }
    return route.fulfill({ response });
  });
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await expect(page.getByText("예전 판매페이지 화면에 반영하지 않은 수정이 있어요.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "그 수정 버리고 열기", exact: true })).toBeVisible();
  // '상품만 열기': the product-only composer, the page left as it is
  await page.getByRole("button", { name: "상품만 열기", exact: true }).click();
  await expect(page.getByTestId("product-basic-info")).toBeVisible();
  await expect(page).not.toHaveURL(/composer=1/);
  await expect(page.getByRole("button", { name: "AI 시트 열기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "상세 고치기", exact: true })).toBeVisible();
  expect(opens.filter((o) => o.discardChanges)).toHaveLength(0);
  // '그 수정 버리고 열기': opens again discarding that revision at the version it was shown with, then the composer
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await page.getByRole("button", { name: "그 수정 버리고 열기", exact: true }).click();
  await expect(page).toHaveURL(/composer=1/);
  await expect(page.getByTestId("product-basic-info")).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 시트 열기", exact: true })).toBeVisible();
  const discards = opens.filter((o) => o.discardChanges);
  expect(discards).toHaveLength(1);
  expect(discards[0]).toMatchObject({ productId: "p-house", discardChanges: true, version: blockedVersion, composer: true });
  clean();
});
