import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { loginProducer, openFreshComposer, producerUrl } from "./helpers";

function prepareSources() {
  const cwd = path.resolve("server");
  execFileSync(path.join(cwd, ".venv/bin/python"), [
    "-c",
    "from app.source_analysis.worker import run_once\nfor _ in range(100):\n if not run_once(): break",
  ], { cwd, env: process.env, timeout: 120000, stdio: "pipe" });
}

async function composer(page: import("./fixtures").Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  // DEV-452: '새 상품' opens the combined setup page; the composer under test edits a fresh draft.
  await openFreshComposer(page);
  await expect(page).toHaveURL(/composer=1/);
  await expect(page.getByRole("button", { name: "AI 시트 닫기", exact: true })).toHaveCount(0);
}

test("AC-03-1 HE-32: first text can start analysis without leaving the input", async ({ page }) => {
  await composer(page);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  const start = page.getByRole("button", { name: "AI로 채우기", exact: true });
  await expect(start).toBeDisabled();
  await page.getByLabel("과일 품종명", { exact: true }).fill("온주밀감");
  await page.getByLabel("과일 품종명", { exact: true }).blur();
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  const input = page.getByLabel("첨부 내용");
  await input.fill("   ");
  await expect(start).toBeDisabled();
  await input.fill("제주 감귤입니다. 서늘한 곳에 보관해 주세요.");
  await expect(input).toBeFocused();
  await expect(start).toBeEnabled();
  const started = page.waitForResponse(r => r.request().method() === "POST" && /\/runs$/.test(new URL(r.url()).pathname));
  await start.click();
  expect((await started).ok()).toBeTruthy();
  await expect(page.getByTestId("source-analysis-status")).toBeVisible();
});

test("AC-SRC-11 HE-33: a failed next action stays visible beside its button", async ({ page }) => {
  test.setTimeout(150000);
  await composer(page);
  await page.getByLabel("상품명", { exact: true }).fill("다음 단계 복구 감귤");
  await page.getByLabel("품종명", { exact: true }).fill("온주밀감");
  const chooser = page.waitForEvent("filechooser");
  const uploaded = page.waitForResponse(response =>
    response.request().method() === "POST" && /\/sources$/.test(new URL(response.url()).pathname));
  await page.getByTestId("hero-placeholder").click();
  await (await chooser).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
  expect((await uploaded).ok()).toBeTruthy();
  // Upload preparation is a real worker operation, independent of AI analysis.
  prepareSources();
  await page.reload();
  await expect(page.getByTestId("hero-photo")).toBeVisible();
  await page.getByLabel("상품명", { exact: true }).fill("다음 단계 복구 감귤");
  await page.getByLabel("품종명", { exact: true }).fill("온주밀감");
  await page.route("**/api/source-analysis/batches/*/drafts", async route => {
    if (route.request().method() === "GET") await route.fulfill({ status: 503, json: { code: "UNAVAILABLE", message: "다음 단계 연결 실패 검증" } });
    else await route.continue();
  });
  // A real saved product goes through the normal next flow up to its controlled read failure.
  const next = page.getByRole("button", { name: "다음: 판매·가격", exact: true });
  await next.click();
  const error = page.getByRole("alert").filter({ hasText: "다음 단계 연결 실패 검증" });
  await expect(error).toHaveCount(1);
  await expect(error).toBeInViewport();
  await expect(next).toBeInViewport();
  const e = await error.boundingBox(), b = await next.boundingBox();
  expect(e!.y + e!.height).toBeLessThanOrEqual(b!.y);
  expect(b!.y - e!.y - e!.height).toBeLessThan(120);
});


test("AC-SRC-11 HE-32: failed first-text save preserves input and sends no analysis", async ({ page }) => {
  await composer(page);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  await page.getByLabel("과일 품종명", { exact: true }).fill("온주밀감");
  await page.getByLabel("과일 품종명", { exact: true }).blur();
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  const input = page.getByLabel("첨부 내용");
  const body = "저장 실패해도 남아야 하는 제주 감귤 자료";
  await input.fill(body);
  let analysisCalls = 0;
  page.on("request", r => {
    if (r.method() === "POST" && /\/runs$/.test(new URL(r.url()).pathname)) analysisCalls++;
  });
  await page.route("**/api/source-analysis/batches/*/sources", async route => {
    if (route.request().method() === "POST") await route.fulfill({ status: 503, json: { code: "UNAVAILABLE", message: "텍스트 저장 실패 검증" } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "AI로 채우기", exact: true }).click();
  await expect(page.getByText(/텍스트 저장 실패 검증/).last()).toBeVisible();
  await expect(input).toHaveValue(body);
  expect(analysisCalls).toBe(0);
  await page.unroute("**/api/source-analysis/batches/*/sources");
  const started = page.waitForResponse(r => r.request().method() === "POST" && /\/runs$/.test(new URL(r.url()).pathname));
  await page.getByRole("button", { name: "AI로 채우기", exact: true }).click();
  expect((await started).ok()).toBeTruthy();
});


// DEV-361 PR C (C-18): the 2-tab workspace is gone. Reopening the batch by its old `?batchId=` address
// (no composer=1) opens the same composer, which still starts from its first focused text.
test("AC-03-1 HE-32 DEV-361: a batch reopened without composer=1 starts from its first focused text too", async ({ page }) => {
  await composer(page);
  const batchId = new URL(page.url()).searchParams.get("batchId");
  expect(batchId).toBeTruthy();
  await page.goto(`${producerUrl}/products/source-analysis?batchId=${batchId}`);
  await expect(page.getByTestId("product-basic-info")).toBeVisible();
  await expect(page.getByText(/이 자료 작업은 더 이상 이 화면에서 열 수 없어요/)).toHaveCount(0);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  await page.getByLabel("과일 품종명", { exact: true }).fill("온주밀감");
  await page.getByLabel("과일 품종명", { exact: true }).blur();
  const start = page.getByRole("button", { name: "AI로 채우기", exact: true });
  await expect(start).toBeDisabled();
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  const input = page.getByLabel("첨부 내용");
  await input.fill("제주 감귤입니다. 서늘한 곳에 보관해 주세요.");
  await expect(input).toBeFocused();
  await expect(start).toBeEnabled();
  const started = page.waitForResponse(r => r.request().method() === "POST" && /\/runs$/.test(new URL(r.url()).pathname));
  await start.click();
  expect((await started).ok()).toBeTruthy();
  await expect(page.getByTestId("source-analysis-status")).toBeVisible();
});
