import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { apiUrl, loginProducer, monitor, openFreshComposer, producerUrl } from "./helpers";

// DEV-346: 새 상품과 판매페이지 수정은 같은 화면(composer). 모든 상태, composer 밖에서 만든 상품도(지금 페이지를 옮겨 연다).
// DEV-361 PR C: 이 화면이 상품 수정 한 화면이다. 구매자에게 보이는 상품도 모든 칸을 고치고(잠금 없음) '상품에 반영' 한 번에 반영한다.
const sourceEnabled = process.env.SOURCE_ANALYSIS_ENABLED === "true";
const shots = process.env.FARMCLUB_INTEGRATION_ARTIFACTS;
function work() {
  const cwd = path.resolve("server");
  execFileSync(
    path.join(cwd, ".venv/bin/python"),
    ["-c", "from app.source_analysis.worker import run_once\nfor _ in range(100):\n if not run_once(): break"],
    { cwd, env: process.env, timeout: 120000, stdio: "pipe" },
  );
}
/**
 * composer 밖에서 만든 예전 페이지로 되돌린다(다른 spec이 바꿨을 수 있음): 상세 없음 → 설명이 이야기, 편집 기록 없음.
 * `modules`를 주면 그 모듈 페이지(기존 편집기로 만든 것처럼), `variety`를 주면 품종도, `brix`([예상, 측정])를 주면 당도도 그 값으로.
 * `name`을 주면 상품명도(DEV-361: '상품에 반영'으로 바꾼 이름을 시드 값으로 되돌림). 남은 상품 초안도 workspace와 함께 지운다.
 */
function legacyPage(pid: string, modules: unknown = null, variety = "", brix: [number, number] | null = null, name = "") {
  const cwd = path.resolve("server");
  execFileSync(
    path.join(cwd, ".venv/bin/python"),
    [
      "-c",
      `
import sys
from tests import migrations_models
from app.core.db import get_sessionmaker
from app.catalog.models import Product
from app.source_analysis.models import ProductWorkspace
with get_sessionmaker()() as db:
 import json
 p = db.get(Product, sys.argv[1])
 modules = json.loads(sys.argv[2])
 p.module_detail = {"schemaVersion": 1, "modules": modules} if modules else None
 p.detail_content = None
 if sys.argv[3]: p.variety = sys.argv[3]
 brix = json.loads(sys.argv[4])
 if brix: p.expected_brix, p.measured_brix = brix
 if sys.argv[5]: p.name = sys.argv[5]
 p.version += 1
 row = db.get(ProductWorkspace, sys.argv[1])
 if row: db.delete(row)
 db.commit()
`,
      pid,
      JSON.stringify(modules),
      variety,
      JSON.stringify(brix),
      name,
    ],
    { cwd, env: process.env, stdio: "pipe" },
  );
}
// 시드 p-house(반영함)·p-cheonhye(작업 생성)를 시드 상태로 되돌린다.
test.afterAll(() => {
  if (!sourceEnabled) return;
  legacyPage("p-house", null, "궁천조생", [12, 11.8], "하우스 감귤 5kg / 10kg");
  legacyPage("p-cheonhye");
  legacyPage("p-cheonggyeon", null, "", cheonggyeonBrix);
  legacyPage("p-josaeng");
});
// 승인 대기 청견의 시드 당도([예상, 측정]). 반영 테스트가 바꾼 값을 되돌린다
let cheonggyeonBrix: [number, number] | null = null;
const publicStory = async (page: import("@playwright/test").Page, id: string) => {
  const res = await page.request.get(`${apiUrl}/api/products/${id}`);
  expect(res.ok()).toBeTruthy();
  const p = await res.json();
  return JSON.stringify({ photo: p.photo, moduleDetail: p.moduleDetail, detailContent: p.detailContent, description: p.description });
};

test("DEV-346 FEAT-04 AC-SRC-11: a draft reopened from the product list shows its saved page in the composer", async ({ page }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API and worker database");
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  // DEV-452: '새 상품' opens the combined setup page; the composer under test edits a fresh draft.
  await openFreshComposer(page);
  await expect(page).toHaveURL(/composer=1/);
  const batchId = new URL(page.url()).searchParams.get("batchId");
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "상품사진 추가", exact: true }).click();
  await (await chooser).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  await page.getByLabel("첨부 내용").fill("테스트 감귤\n제주산 감귤입니다.\n서늘한 곳에 보관해 주세요.");
  await page.getByLabel("첨부 내용").blur();
  await expect(page.getByRole("button", { name: "텍스트 내용 수정", exact: true })).toBeVisible();
  await page.getByLabel("과일 품종명", { exact: true }).fill("온주밀감");
  await page.getByLabel("과일 품종명", { exact: true }).blur();
  await page.getByRole("button", { name: "AI로 채우기", exact: true }).click();
  await expect(page.getByTestId("source-analysis-status")).toBeVisible();
  work();
  await expect(page.getByTestId("source-analysis-status")).toHaveCount(0, { timeout: 15000 });
  const name = `이어서 고칠 감귤 ${Date.now()}`;
  await page.getByLabel("상품명", { exact: true }).fill(name);
  const summary = page.getByLabel("상품 소개 보충 내용", { exact: true });
  await summary.fill("농부가 직접 쓴 소개");
  await summary.blur();
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.getByText(/비공개로 저장했어요/)).toBeVisible();

  // Before DEV-346 this opened the old editor with an empty page.
  await page.goto(`${producerUrl}/products?filter=draft`);
  const card = page.getByRole("button", { name: `${name} 상품 수정` }).locator("..");
  await card.getByRole("button", { name: "상품 수정", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`composer=1`));
  expect(new URL(page.url()).searchParams.get("batchId")).toBe(batchId);
  await expect(page.getByLabel("상품명", { exact: true })).toHaveValue(name);
  await expect(page.getByLabel("상품 소개 보충 내용", { exact: true })).toHaveValue("농부가 직접 쓴 소개");
  await expect(page.getByRole("button", { name: "다음: 판매·가격", exact: true })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/dev346-draft-reopen.png` });
  // DEV-184 guard: reopening via '상품 수정' and pressing '다음' must not apply (and copy the
  // uploaded photo) again. DEV-452 decision 2A: '다음' never applies; the sale request does.
  const applies: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/drafts\/[^/]+\/apply$/.test(r.url())) applies.push(r.url());
  });
  await page.getByRole("button", { name: "다음: 판매·가격", exact: true }).click();
  await expect(page).toHaveURL(/\/sell/);
  const productId = page.url().match(/products\/([^/]+)\/sell/)![1];
  const token = await page.evaluate(() => Object.entries(localStorage).find(([k]) => /token/i.test(k))?.[1]);
  const photos = async () =>
    (await (await page.request.get(`${apiUrl}/api/products/mine/${productId}`, { headers: { Authorization: `Bearer ${token}` } })).json()).photos;
  const applied = await photos();
  expect(applies).toHaveLength(0);
  await page.goto(`${producerUrl}/products?filter=draft`);
  await page.getByRole("button", { name: `${name} 상품 수정` }).locator("..").getByRole("button", { name: "상품 수정", exact: true }).click();
  await expect(page).toHaveURL(/composer=1/);
  await page.getByRole("button", { name: "다음: 판매·가격", exact: true }).click();
  await expect(page).toHaveURL(/\/sell/);
  expect(applies).toHaveLength(0);
  expect(await photos()).toEqual(applied);
  clean();
});

test("DEV-346 DEV-361 FEAT-04 AC-SRC-9: a seeded selling product opens in the composer with its page, buyers see no change until apply", async ({ page }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  legacyPage("p-house");
  const clean = monitor(page);
  const before = await publicStory(page, "p-house");
  const description = JSON.parse(before).description as string;
  await loginProducer(page, "강영수");
  // The old SCR-25 address now opens the composer (DEV-361 C-13)
  await page.goto(`${producerUrl}/products/p-house/edit`);
  await expect(page).toHaveURL(/composer=1/);
  // The legacy page (description story, first photo) was moved into the composer as it is.
  const summary = page.getByLabel("상품 소개 보충 내용", { exact: true });
  await expect(summary).toHaveValue(description);
  // Buyer-visible product fields are edited here too (DEV-361 C-5)
  await expect(page.getByRole("button", { name: "대표 사진 바꾸기", exact: true })).toBeVisible();
  await expect(page.getByTestId("product-basic-info").getByLabel("상품명", { exact: true })).toBeEditable();
  if (shots) await page.screenshot({ path: `${shots}/dev361-published-composer.png` });
  // A 13-digit timestamp reads as a private number (account/phone) and is refused at apply, so the
  // marker is letters (DEV-452: editing a product runs the publication privacy check).
  const edited = `${description} 수정 ${Date.now().toString(36)}`;
  await summary.fill(edited);
  await summary.blur();
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.getByText("비공개로 저장했어요. '상품에 반영'을 누르기 전까지 구매자 화면은 그대로예요.", { exact: true })).toBeVisible();
  expect(await publicStory(page, "p-house")).toBe(before);
  await page.getByRole("button", { name: /^상품에 반영/ }).click();
  const sheet = page.getByTestId("apply-confirm");
  await expect(sheet.getByText("상품에 반영할까요?", { exact: true })).toBeVisible();
  await expect(sheet.getByText("판매 중인 상품이에요. 바뀌는 내용을 확인해 주세요.", { exact: true })).toBeVisible();
  await expect(sheet.getByTestId("change-group-now")).toContainText("판매페이지 상세");
  await sheet.getByRole("button", { name: "더 고치기", exact: true }).click();
  expect(await publicStory(page, "p-house")).toBe(before);
  await page.getByRole("button", { name: /^상품에 반영/ }).click();
  await page.getByTestId("apply-confirm").getByRole("button", { name: "반영하기", exact: true }).click();
  await expect(page.getByText("상품에 반영했어요", { exact: true })).toBeVisible();
  // Stays on the composer after applying (DEV-361 C-8)
  await expect(page).toHaveURL(/composer=1/);
  const after = JSON.parse(await publicStory(page, "p-house"));
  expect(after.photo).toBe(JSON.parse(before).photo); // the same photo, not a copy
  expect(JSON.stringify(after.moduleDetail)).toContain(edited);
  clean();
});

test("DEV-346 FEAT-04: a rejected seeded product opens in the composer with its photo", async ({ page }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  await page.setViewportSize({ width: 390, height: 844 });
  legacyPage("p-cheonhye");
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-cheonhye/detail`);
  await expect(page).toHaveURL(/composer=1/);
  await expect(page.getByRole("button", { name: "대표 사진 바꾸기", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "대표사진" }).first()).toBeVisible();
  // Not selling yet: no confirmation step, the usual next step.
  await expect(page.getByRole("button", { name: "다음: 판매·가격", exact: true })).toBeVisible();
  // SCR-25 below in the stack also has a 상품명 field: scope to the composer page.
  await expect(page.getByTestId("product-basic-info").getByLabel("상품명", { exact: true })).toBeEditable();
  clean();
});

test("DEV-346 DEV-361: a server without the composer option opens the product in the composer without AI", async ({ page }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  await page.setViewportSize({ width: 390, height: 844 });
  const clean = monitor(page, [/status of 400/]);
  // Simulate a server deployed before DEV-346: OpenWorkspace forbids unknown fields.
  await page.route("**/api/source-analysis/product-workspaces", async (route) => {
    const body = route.request().postDataJSON() ?? {};
    if ("composer" in body)
      return route.fulfill({
        status: 400,
        json: { code: "VALIDATION_ERROR", message: "입력한 내용을 확인해 주세요.", details: { fields: { composer: "Extra inputs are not permitted" } } },
      });
    return route.continue();
  });
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-redhyang/detail`);
  // The legacy editor is gone (DEV-361 C-1): the same composer opens with the product only.
  await expect(page.getByTestId("product-basic-info")).toBeVisible();
  await expect(page).not.toHaveURL(/composer=1/);
  await expect(page.getByRole("button", { name: "AI 시트 열기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "상세 고치기", exact: true })).toBeVisible();
  await expect(page.getByText("상품을 열지 못했어요. 다시 시도해 주세요.", { exact: true })).toHaveCount(0);
  clean();
});

test("DEV-346 DEV-361 AC-SRC-9: an untouched migrated module page applies with the same title and text", async ({ page }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  await page.setViewportSize({ width: 390, height: 844 });
  // A page made in the legacy editor: its own hero title differs from the product name.
  legacyPage("p-house", [
    { id: "hero", texts: [{ fieldKey: "name", value: "하우스 감귤" }], photos: [], illustrationId: null },
    { id: "taste", texts: [{ fieldKey: "taste", value: "새콤달콤해요" }], photos: [{ uri: "/photos/tangerine-box.jpg", alt: "상자" }], illustrationId: null },
  ]);
  const clean = monitor(page);
  const modules = async () =>
    JSON.parse(await publicStory(page, "p-house")).moduleDetail.modules.map(
      (m: { id: string; texts: unknown; photos: unknown }) => [m.id, m.texts, m.photos],
    );
  const before = await modules();
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await expect(page).toHaveURL(/composer=1/);
  await page.getByRole("button", { name: /^상품에 반영/ }).click();
  await page.getByTestId("apply-confirm").getByRole("button", { name: "반영하기", exact: true }).click();
  await expect(page.getByText("상품에 반영했어요", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/composer=1/);
  expect(await modules()).toEqual(before);
  clean();
});

test("DEV-361 FEAT-04 C-5 C-7 C-8: a selling product's fields are editable, marked and private until 상품에 반영", async ({ page }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  legacyPage("p-house", null, "궁천조생", [12, 11.8]);
  const clean = monitor(page);
  const publicName = async () => (await (await page.request.get(`${apiUrl}/api/products/p-house`)).json()).name as string;
  const original = await publicName();
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await expect(page).toHaveURL(/composer=1/);
  const basic = page.getByTestId("product-basic-info");
  // The composer shows the product's own values (measured Brix first), editable.
  await expect(basic.getByLabel("품종명", { exact: true })).toHaveValue("궁천조생");
  await expect(basic.getByLabel("측정 당도 (°Bx)", { exact: true })).toHaveValue("11.8");
  await page.getByText("상품정보", { exact: true }).click(); // origin/storage/size live in the info table
  for (const label of ["상품명", "원산지", "품종명", "측정 당도 (°Bx)", "보관", "사이즈"])
    await expect(basic.getByLabel(label, { exact: true })).toBeEditable();
  await expect(page.getByRole("button", { name: "상품에 반영", exact: true })).toBeVisible(); // no unapplied count
  const name = `${original} 산지직송`;
  await basic.getByLabel("상품명", { exact: true }).fill(name);
  await basic.getByLabel("품종명", { exact: true }).fill("궁천조생 하우스");
  await expect(page.getByRole("button", { name: "상품에 반영 (2)", exact: true })).toBeVisible();
  await expect(basic.getByLabel("상품명 수정됨", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "상품에 반영 (2)", exact: true })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/dev361-unapplied-marks.png` });
  // 임시 저장 keeps the edits private; reopening shows them again from the server draft.
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.getByText(/비공개로 저장했어요/)).toBeVisible();
  expect(await publicName()).toBe(original);
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await expect(page).toHaveURL(/composer=1/);
  await expect(page.getByTestId("product-basic-info").getByLabel("상품명", { exact: true })).toHaveValue(name);
  await expect(page.getByRole("button", { name: "상품에 반영 (2)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "상품에 반영 (2)", exact: true }).click();
  const sheet = page.getByTestId("apply-confirm");
  await expect(sheet.getByTestId("change-group-now").getByLabel(`상품명, ${original}에서 ${name}으로`)).toBeVisible();
  await expect(sheet.getByTestId("change-group-now")).toContainText("품종");
  await sheet.getByRole("button", { name: "반영하기", exact: true }).click();
  await expect(page.getByText("상품에 반영했어요", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "상품에 반영", exact: true })).toBeVisible(); // no unapplied count
  expect(await publicName()).toBe(name);
  clean();
});

test("DEV-361 FEAT-04 C-8: a pending-approval product applies without re-approval", async ({ page }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  await page.setViewportSize({ width: 390, height: 844 });
  legacyPage("p-cheonggyeon");
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  const token = await page.evaluate(() => Object.entries(localStorage).find(([k]) => /token/i.test(k))?.[1]);
  const seed = await (await page.request.get(`${apiUrl}/api/products/mine/p-cheonggyeon`, { headers: { Authorization: `Bearer ${token}` } })).json();
  cheonggyeonBrix ??= [seed.expectedBrix, seed.measuredBrix];
  await page.goto(`${producerUrl}/products/p-cheonggyeon/detail`);
  await expect(page).toHaveURL(/composer=1/);
  const basic = page.getByTestId("product-basic-info");
  await basic.getByLabel("측정 당도 (°Bx)", { exact: true }).fill("12.8");
  await page.getByRole("button", { name: "상품에 반영 (1)", exact: true }).click();
  const sheet = page.getByTestId("apply-confirm");
  await expect(sheet.getByText("승인 대기 중인 상품이에요. 다시 승인받지 않아도 돼요.", { exact: true })).toBeVisible();
  await expect(sheet.getByText("승인되면 보여요", { exact: true })).toBeVisible();
  await expect(sheet.getByText("바뀐 내용은 운영자 심사 화면에 변경 기록으로 남아요", { exact: true })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/dev361-pending-apply.png` });
  await sheet.getByRole("button", { name: "반영하기", exact: true }).click();
  await expect(page.getByText("상품에 반영했어요", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/composer=1/);
  clean();
});

test("DEV-361 FEAT-04 C-11: a closed product opens read-only", async ({ page }) => {
  test.skip(!sourceEnabled, "Requires explicitly enabled local source API");
  await page.setViewportSize({ width: 390, height: 844 });
  legacyPage("p-josaeng");
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-josaeng/detail`);
  await expect(page).toHaveURL(/composer=1/);
  await expect(page.getByText("판매가 끝난 상품이라 고칠 수 없어요.", { exact: true }).first()).toBeVisible();
  const basic = page.getByTestId("product-basic-info");
  for (const label of ["상품명", "원산지", "품종명", "측정 당도 (°Bx)"])
    await expect(basic.getByLabel(label, { exact: true })).not.toBeEditable();
  await expect(page.getByRole("button", { name: /^상품에 반영/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "임시 저장", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "AI 시트 열기" })).toHaveCount(0);
  await page.getByRole("button", { name: "판매 조건 보기", exact: true }).click();
  await expect(page.getByRole("button", { name: "수정 담기" })).toHaveCount(0);
  await page.getByRole("button", { name: "닫기", exact: true }).last().click();
  clean();
});
