import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { apiUrl, producerUrl, apiLogin, loginProducer, monitor } from "./helpers";

// DEV-452 (PM 11/26–27): combined setup → generated page → review in sheets. Invented text material,
// fixed extraction response, real local worker/DB/app. No provider calls.
const intro = "서귀포 바닷가 언덕에서 키운 한라봉입니다.";
const taste = "껍질이 얇고 과즙이 많아 칼 없이도 쉽게 까집니다.";
const option = "가정용 3kg (9~12과) 32,000원";
const dated = "작년 평균 당도는 13~14브릭스였습니다.";
const storage = "받으신 뒤에는 서늘한 곳에 두세요.";
const material = [intro, taste, option, dated, storage].join("\n");
function work() {
  const cwd = path.resolve("server");
  execFileSync(path.join(cwd, ".venv/bin/python"), ["-c", `
from app.source_analysis import worker
from app.ai.source_analysis import ExtractionResponse
from app.source_analysis.schemas import Extraction
mapping = {${JSON.stringify(intro)}:'summary',${JSON.stringify(taste)}:'taste',${JSON.stringify(option)}:'historicalSales',${JSON.stringify(dated)}:'farmStory',${JSON.stringify(storage)}:'storage'}
def reply(mode, model, chunk, targets, images, **kwargs):
 assert mode == 'mock'
 rows=[]
 for page in chunk['pages']:
  for span in page['spans']:
   text=span['text']
   if text in mapping:
    rows.append(dict(targetId=targets[0]['id'],fieldKey=mapping[text],value=text,historical=mapping[text]=='historicalSales',evidence=[dict(sourceId=chunk['sourceId'],sourceRevision=chunk['sourceRevision'],page=page['number'],spanIds=[span['id']],quote=text)]))
 return ExtractionResponse(Extraction(candidates=rows,photo_requests=[]),{'mock':True},None)
worker.extract=reply
for _ in range(100):
 if not worker.run_once(): break
`], { cwd, env: process.env, timeout: 120000, stdio: "pipe" });
}

test.describe.configure({ mode: "serial" });

test("DEV-452 AC-SRC-1/5/10/11: required setup, generated page, check sheet and section edit", async ({ page, request }) => {
  test.setTimeout(240_000);
  const clean = monitor(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/new`);
  await expect(page).toHaveURL(/product-setup\?id=/);
  const pid = new URL(page.url()).searchParams.get("id")!;

  // 1. Required items block generation; nothing is generated.
  await page.getByRole("button", { name: "이 정보로 페이지 만들기", exact: true }).click();
  await expect(page.getByText(/필수 항목 \d+개를 채워 주세요/)).toBeVisible();
  await expect(page.getByTestId("invalid-field-hint")).toBeVisible();
  await expect(page).toHaveURL(/product-setup/);

  // 2. Material and current sale settings (API), then generate from the page.
  const headers = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
  const opened = await request.post(`${apiUrl}/api/source-analysis/product-workspaces`, {
    headers: { ...headers, "Idempotency-Key": `open-${pid}` },
    data: { productId: pid },
  });
  expect(opened.ok()).toBeTruthy();
  const workspace = await opened.json();
  const batch = await (await request.get(`${apiUrl}/api/source-analysis/batches/${workspace.batchId}`, { headers })).json();
  const upload = await request.post(`${apiUrl}/api/source-analysis/batches/${batch.id}/sources`, {
    headers,
    multipart: { batchVersion: String(batch.version), common: "true", file: { name: "farm.txt", mimeType: "text/plain", buffer: Buffer.from(material) } },
  });
  expect(upload.ok()).toBeTruthy();
  const saved = await request.post(`${apiUrl}/api/source-analysis/product-workspaces/${pid}/setup`, {
    headers: { ...headers, "Idempotency-Key": `setup-${pid}` },
    data: {
      version: workspace.version,
      inputs: {
        productName: "", productHint: "한라봉", origin: "제주 서귀포", requestedKg: 200,
        terms: {
          options: [{ optionId: "opt-3", label: "3kg", weightKg: 3 }],
          rows: [{ key: "one", startsAt: "2026-10-07", endsAt: "2026-11-09", options: { "opt-3": { price: 35000 } } }],
          shippingFeeType: "FREE", shippingFee: null, remoteAreaFee: 3000,
          deliveryWindow: { start: "2026-11-10", end: "2026-11-20" }, maxDelayUntil: "2026-11-30",
        },
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "이 정보로 페이지 만들기", exact: true }).click();
  await expect(page).toHaveURL(/composer=1.*from=setup|from=setup.*composer=1/);
  await expect(page.getByTestId("source-run-bar")).toBeVisible();
  work();
  await page.reload();

  // 3. The generated page: input wins (price), size and count kept, check bar on top.
  await expect(page.getByTestId("check-bar")).toBeVisible({ timeout: 30_000 });
  // PM 11/27 rule b: a variant line (가정용) the sale options do not name stays off the page and
  // is shown for reference in 정보 고치기 together with its old price.
  await expect(page.getByTestId("buyer-preview").getByText(/가정용 3kg/)).toHaveCount(0);
  await page.getByRole("button", { name: "✎ 정보 고치기", exact: true }).click();
  await expect(page.getByTestId("fact-doc-price")).toContainText(option);
  await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("35,000원").first()).toBeVisible();
  const bar = page.getByTestId("check-bar");
  const before = Number((await bar.innerText()).match(/확인할 것 (\d+)개/)?.[1] ?? 0);
  expect(before).toBeGreaterThan(0);

  // 4. One-at-a-time check sheet saves an answer and the count drops.
  await page.getByRole("button", { name: "하나씩 확인하기", exact: true }).click();
  await expect(page.getByText(/^확인 1 \/ \d+$/)).toBeVisible();
  await page.getByRole("button", { name: "괜찮아요", exact: true }).click();
  await expect(page.getByText(new RegExp(`^확인 1 \\/ ${before - 1}$`)).or(page.getByText("확인할 것을 모두 마쳤어요."))).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });
  await expect(bar).toContainText(before - 1 ? `확인할 것 ${before - 1}개` : "확인할 것을 모두 마쳤어요");

  // 5. Editing one section keeps every other section.
  const sections = async () => page.locator('[data-testid^="source-section-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  const was = await sections();
  await page.getByTestId("source-section-taste").getByRole("button", { name: "✎ 고치기", exact: true }).click();
  const box = page.getByRole("dialog").locator("textarea").first();
  await box.fill(`${await box.inputValue()} 새콤함은 적어요.`);
  await page.getByRole("button", { name: "저장하고 닫기", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });
  const pageText = () => page.getByTestId("buyer-preview").getByText(/새콤함은 적어요\./);
  await expect(pageText()).toBeVisible();
  await page.reload();
  await expect(pageText()).toBeVisible({ timeout: 30_000 });
  expect(await sections()).toEqual(was);

  // 5b. A section the page does not have yet can be added (opens ready to type).
  await page.getByTestId("add-section-row").getByRole("button", { name: "크기 참고 추가", exact: true }).click();
  await expect(page.getByText("크기 참고 추가", { exact: true })).toBeVisible();
  await page.getByRole("dialog").locator("textarea").first().fill("지름 7~8cm 정도예요.");
  await page.getByRole("button", { name: "저장하고 닫기", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId("buyer-preview").getByText("지름 7~8cm 정도예요.")).toBeVisible();

  // 6. Buyer preview has no editing controls.
  await page.getByRole("button", { name: "미리보기", exact: true }).click();
  await expect(page.getByRole("button", { name: "✎ 고치기", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("check-bar")).toHaveCount(0);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByTestId("check-bar")).toBeVisible();

  // 7. Answer every check; a missing product photo is a visible blocker; then the request goes out.
  const checkButton = page.getByRole("button", { name: "하나씩 확인하기", exact: true });
  if (await checkButton.isVisible()) {
    await checkButton.click();
    for (let i = 0; i < 20; i++) {
      if (await page.getByText("확인할 것을 모두 마쳤어요.").isVisible()) break;
      const ok = page.getByRole("button", { name: "괜찮아요", exact: true });
      if (await ok.isVisible()) await ok.click();
      else await page.getByRole("dialog").getByRole("button", { name: "빼기", exact: true }).click();
      await page.waitForTimeout(1500);
    }
    await page.getByRole("button", { name: "닫기", exact: true }).last().click();
  }
  await expect(page.getByTestId("photo-missing")).toBeVisible();
  await expect(bar).toContainText("확인할 것 1개");
  await page.getByRole("button", { name: /^판매 시작 요청/ }).click();
  await expect(page.getByText(/상품 사진이 없어요\. 위 ‘상품 사진 추가’/).filter({ visible: true })).toBeVisible();
  const latest = await (await request.get(`${apiUrl}/api/source-analysis/batches/${batch.id}`, { headers })).json();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAAI0lEQVR4nGP4z8BAFcQwatCoQaMGjRo0atCoQaMGjRpEPgAAk9YB/bVuKrkAAAAASUVORK5CYII=", "base64");
  const photo = await request.post(`${apiUrl}/api/source-analysis/batches/${batch.id}/sources`, {
    headers,
    multipart: { batchVersion: String(latest.version), common: "true", originalPhoto: "true", file: { name: "fruit.png", mimeType: "image/png", buffer: png } },
  });
  expect(photo.ok(), await photo.text()).toBeTruthy();
  await page.reload();
  await expect(bar).toContainText("확인할 것을 모두 마쳤어요", { timeout: 30_000 });
  await page.getByRole("button", { name: "판매 시작 요청", exact: true }).click();
  await expect(page).toHaveURL(/\/products(\?|$)/, { timeout: 30_000 });
  const product = await (await request.get(`${apiUrl}/api/products/mine/${pid}`, { headers })).json();
  expect(product.status).toBe("PENDING_APPROVAL");
  clean();
});
