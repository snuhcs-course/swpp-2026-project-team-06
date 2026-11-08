import type { SourceField } from "@farmclub/api";
import { test, expect, type Page } from "./fixtures";
import { apiLogin, apiUrl, loginProducer, producerUrl } from "./helpers";

// Contract tests deliberately create their own editor, never reuse manual products,
// and prevent every paid analysis request from reaching a provider.
async function freshEditor(page: Page) {
  await page.route("**/api/source-analysis/batches/*/runs**", async (route) => {
    if (route.request().method() !== "GET")
      return route.fulfill({ status: 503, json: { code: "TEST_NO_AI", message: "테스트에서는 AI를 실행하지 않아요." } });
    await route.continue();
  });
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products`);
  await page.getByRole("button", { name: "새 상품", exact: true }).click();
  await expect(page).toHaveURL(/batchId=.+composer=1/);
  await expect(page.getByLabel("상품명", { exact: true })).toBeVisible();
  return page.url();
}

const openAi = (page: Page) => page.getByRole("button", { name: "AI 시트 열기", exact: true });
const closeAi = (page: Page) => page.getByRole("button", { name: "AI 시트 닫기", exact: true });
const back = (page: Page) => page.getByRole("button", { name: "뒤로", exact: true }).last();

test("AC-03-1/AC-SRC-11: editor starts closed, captions are visible and variety shares both directions", async ({ page }) => {
  await freshEditor(page);
  await expect(closeAi(page)).toHaveCount(0);
  await expect(openAi(page)).toHaveText("AI 초안");
  await expect(page.getByRole("button", { name: "구매자 화면 보기", exact: true })).toHaveText("미리보기");
  const variety = page.getByLabel("품종명", { exact: true });
  await variety.fill("천혜향");
  await openAi(page).click();
  const sheetVariety = page.getByLabel("과일 품종명", { exact: true });
  await expect(sheetVariety).toHaveValue("천혜향");
  await sheetVariety.fill("온주밀감");
  await closeAi(page).click();
  await expect(variety).toHaveValue("온주밀감");
  await variety.fill("레드향");
  await openAi(page).click();
  await expect(sheetVariety).toHaveValue("레드향");
});

test("AC-SRC-11: Back saves name and variety without photo and acknowledges only successful storage", async ({ page }) => {
  const editorUrl = await freshEditor(page);
  const name = `뒤로 저장 ${Date.now()}`;
  await page.getByLabel("상품명", { exact: true }).fill(name);
  await page.getByLabel("품종명", { exact: true }).fill("온주밀감");
  await back(page).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByText("임시 저장됐어요", { exact: true })).toBeVisible();
  await page.goto(editorUrl);
  await expect(page.getByLabel("상품명", { exact: true })).toHaveValue(name);
  await expect(page.getByLabel("품종명", { exact: true })).toHaveValue("온주밀감");
  await page.getByLabel("상품명", { exact: true }).fill(`${name} 수정`);
  await page.getByLabel("품종명", { exact: true }).fill("천혜향");
  let rejectedWrites = 0;
  await page.route("**/api/source-analysis/batches/**", async (route) => {
    if (["PUT", "PATCH", "POST"].includes(route.request().method())) {
      rejectedWrites++;
      return route.fulfill({ status: 503, json: { code: "UNAVAILABLE", message: "임시 저장 연결 실패" } });
    }
    await route.continue();
  });
  await back(page).click();
  await expect.poll(() => rejectedWrites).toBeGreaterThan(0);
  await expect(page).toHaveURL(editorUrl);
  await expect(page.getByText("임시 저장됐어요", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("상품명", { exact: true })).toHaveValue(`${name} 수정`);
  await expect(page.getByLabel("품종명", { exact: true })).toHaveValue("천혜향");
});

test("AC-SRC-11: leaving locks editable values until the pending draft save finishes", async ({ page }) => {
  const editorUrl = await freshEditor(page);
  const name = page.getByLabel("상품명", { exact: true });
  const variety = page.getByLabel("품종명", { exact: true });
  await name.fill("저장 대기 초안");
  await variety.fill("온주밀감");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let started = false;
  await page.route("**/api/source-analysis/batches/**", async (route) => {
    if (["PATCH", "PUT", "POST"].includes(route.request().method())) {
      started = true;
      await pending;
      return route.fulfill({ status: 503, json: { code: "UNAVAILABLE", message: "지연된 저장 실패" } });
    }
    await route.continue();
  });
  try {
    await back(page).click();
    await expect.poll(() => started).toBe(true);
    await expect(name).not.toBeEditable();
    await expect(variety).not.toBeEditable();
    await expect(page).toHaveURL(editorUrl);
  } finally {
    release();
  }
  await expect(name).toBeEditable();
  await expect(variety).toBeEditable();
  await expect(name).toHaveValue("저장 대기 초안");
  await expect(variety).toHaveValue("온주밀감");
  await expect(page).toHaveURL(editorUrl);
});

test("AC-SRC-9/11: no-photo draft saves but Next cannot leave, cancelled cover chooser preserves state", async ({ page }) => {
  const editorUrl = await freshEditor(page);
  await page.getByLabel("상품명", { exact: true }).fill("사진 없는 수동 초안");
  await page.getByLabel("품종명", { exact: true }).fill("온주밀감");
  let runs = 0;
  page.on("request", (request) => {
    if (/\/runs(?:\/|$|\?)/.test(request.url()) && request.method() === "POST") runs++;
  });
  let chooserCount = 0;
  page.on("filechooser", () => chooserCount++);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("hero-placeholder").click();
  const picker = await chooser;
  expect(picker.isMultiple()).toBe(false);
  await picker.setFiles([]); // Native cancellation is represented by an empty selection.
  await expect(closeAi(page)).toHaveCount(0);
  await expect(page.getByTestId("hero-placeholder")).toBeVisible();
  await expect(page.getByLabel("상품명", { exact: true })).toHaveValue("사진 없는 수동 초안");
  expect(chooserCount).toBe(1);
  expect(runs).toBe(0);
  await page.getByRole("button", { name: "다음: 판매·가격", exact: true }).click();
  await expect(page).toHaveURL(editorUrl);
  await expect(page.getByRole("alert").getByText(/대표.*사진/)).toBeVisible();
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.getByText(/비공개로 저장했어요|임시 저장됐어요/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("상품명", { exact: true })).toHaveValue("사진 없는 수동 초안");
  await expect(page.getByLabel("품종명", { exact: true })).toHaveValue("온주밀감");
  expect(runs).toBe(0);
});

test("AC-SRC-11: one measured Brix field updates and clearing survives preview, save and reload", async ({ page }) => {
  await freshEditor(page);
  await page.getByLabel("상품명", { exact: true }).fill("당도 수동 초안");
  await page.getByLabel("품종명", { exact: true }).fill("온주밀감");
  const brix = page.getByLabel("측정 당도 (°Bx)", { exact: true });
  await expect(brix).toHaveCount(1);
  await brix.fill("12.5");
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.getByText(/비공개로 저장했어요|임시 저장됐어요/)).toBeVisible();
  await page.reload();
  await expect(brix).toHaveValue("12.5");
  await brix.fill("14.2");
  await page.getByRole("button", { name: "구매자 화면 보기", exact: true }).click();
  await expect(page.getByRole("button", { name: "편집하기", exact: true })).toBeVisible();
  await expect(page.getByText("14.2 Brix", { exact: true })).toBeVisible();
  await expect(page.getByText(/12\.5.*Brix/)).toHaveCount(0);
  await page.getByRole("button", { name: "편집하기", exact: true }).click();
  await expect(brix).toHaveValue("14.2");
  await brix.fill("");
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.getByText(/비공개로 저장했어요|임시 저장됐어요/)).toBeVisible();
  await page.reload();
  await expect(brix).toHaveCount(1);
  await expect(brix).toHaveValue("");
  await page.getByRole("button", { name: "구매자 화면 보기", exact: true }).click();
  await expect(page.getByRole("button", { name: "편집하기", exact: true })).toBeVisible();
  await expect(page.getByText(/(?:12\.5|14\.2).*Brix/)).toHaveCount(0);
});

test("AC-SRC-11: introduction can be removed and two empty additions retain independent membership", async ({ page }) => {
  const editorUrl = await freshEditor(page);
  const batchId = new URL(editorUrl).searchParams.get("batchId")!;
  const token = await apiLogin(page.request, "u-kang", "producer");
  const response = await page.request.get(`${apiUrl}/api/source-analysis/batches/${batchId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  const batch = await response.json();
  const target = batch.targets[0];
  const field: SourceField = { targetId: target.id, fieldKey: "taste", value: "달고 상큼해요",
    state: "UNREVIEWED", provenance: "PRODUCER", candidateIds: [], photoAssetIds: [], illustrationId: null };
  const review = { reviewVersion: batch.reviewVersion, targets: [target], candidates: [], fields: [], conflicts: [],
    sourcePhotoRequests: [], editorFields: [{ status: "ready", field }] };
  await page.route(`**/api/source-analysis/batches/${batchId}/review`, async (route) => {
    await route.fulfill({ json: review });
  });
  await page.route(`**/api/source-analysis/batches/${batchId}/runs`, async (route) => {
    if (route.request().method() !== "GET")
      return route.fulfill({ status: 503, json: { code: "TEST_NO_AI" } });
    await route.fulfill({ json: { items: [{ id: "fixture-completed-run", mode: "mock", model: "mock",
      status: "SUCCEEDED", completed: 1, total: 1, inputs: [], items: [] }] } });
  });
  await page.reload();
  await page.getByRole("button", { name: "상품 소개 추가", exact: true }).click();
  const introduction = page.getByLabel("상품 소개 내용", { exact: true });
  await introduction.fill("농부가 직접 소개하는 감귤이에요.");
  await introduction.focus();
  await page.getByRole("button", { name: "상품 소개 제외", exact: true }).click();
  await expect(introduction).toHaveCount(0);
  await expect(page.getByRole("button", { name: "상품 소개 추가", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "품질 확인 추가", exact: true }).click();
  await page.getByRole("button", { name: "농가 이야기 추가", exact: true }).click();
  const quality = page.getByLabel("품질 확인 내용", { exact: true });
  const farm = page.getByLabel("농가 이야기 내용", { exact: true });
  await expect(quality).toHaveValue("");
  await expect(farm).toHaveValue("");
  await quality.focus();
  await farm.focus();
  await page.getByRole("button", { name: "구매자 화면 보기", exact: true }).click();
  await page.getByRole("button", { name: "편집하기", exact: true }).click();
  await expect(quality).toBeVisible();
  await expect(farm).toBeVisible();
  await quality.focus();
  await page.getByRole("button", { name: "품질 확인 제외", exact: true }).click();
  await expect(quality).toHaveCount(0);
  await expect(farm).toHaveValue("");
  await expect(page.getByRole("button", { name: "품질 확인 추가", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "농가 이야기 추가", exact: true })).toHaveCount(0);
});
