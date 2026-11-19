import { test, expect, type Page } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { producerUrl, loginProducer, monitor } from "./helpers";

// DEV-361 PR C: removed "AC-SRC-11 DEV-341: product page editor isolates a failed photo and retries only it" (deleted
// ProductPageEditor; covered by "AC-SRC-11 DEV-341: composer editor keeps other photos when one preview fails and retries only it").
// DEV-361 PR C: removed "AC-SRC-11 DEV-341: product page uploads are shrunk to a 1600px JPEG, transparent PNG on white"
// (that client-side shrink ran only in ProductPageEditor's own photo upload; the composer uploads through the batch, no equivalent).
const blobPhotos = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLImageElement>("img[src^='blob:']")].filter(
        (i) => i.complete && i.naturalWidth > 0,
      ).length,
  );

/** The loaded photo count once it has stopped changing (three equal readings in a row). */
async function stableBlobPhotos(page: Page) {
  let last = -1,
    same = 0;
  for (let i = 0; i < 100 && same < 3; i++) {
    const now = await blobPhotos(page);
    same = now === last ? same + 1 : 1;
    last = now;
    await page.waitForTimeout(200);
  }
  expect(same, "photo count did not settle").toBeGreaterThanOrEqual(3);
  return last;
}

function work() {
  const cwd = path.resolve("server");
  execFileSync(
    path.join(cwd, ".venv/bin/python"),
    ["-c", "from app.source_analysis.worker import run_once\nfor _ in range(100):\n if not run_once(): break"],
    { cwd, env: process.env, timeout: 120000, stdio: "pipe" },
  );
}

// DEV-341: one photo that fails to load must not blank the others, and only that photo is retried.
test("AC-SRC-11 DEV-341: composer editor keeps other photos when one preview fails and retries only it", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  test.setTimeout(180_000);
  const clean = monitor(page, [/Failed to load resource: the server responded with a status of 404/]);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  const photos: string[] = [];
  page.on("response", async (r) => {
    if (r.request().method() === "POST" && /\/batches\/[^/]+\/sources$/.test(new URL(r.url()).pathname) && r.ok()) {
      const asset = await r.json();
      if (asset.originalPhoto) photos.push(asset.id);
    }
  });
  await page.goto(`${producerUrl}/products`);
  await page.getByRole("button", { name: "새 상품", exact: true }).click();
  await expect(page).toHaveURL(/composer=1/);
  await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "상품사진 추가", exact: true }).click();
  await (await chooser).setFiles([
    "apps/consumer/public/photos/tangerine-box.jpg",
    "apps/consumer/public/photos/greenhouse.jpg",
  ]);
  await expect(page.getByText(/상품사진 2장/).first()).toBeVisible();
  // Descriptions place each photo in its own module (mock placement: 포장 → package, 농장 → farm).
  const describe = async (index: number, text: string) => {
    const saved = page.waitForResponse((r) => /\/details$/.test(r.url()) && r.request().method() === "PUT");
    await page.getByLabel("사진 한 줄 설명", { exact: true }).nth(index).fill(text);
    await page.getByLabel("사진 한 줄 설명", { exact: true }).nth(index).blur();
    expect((await saved).ok()).toBeTruthy();
  };
  await describe(0, "배송 박스 포장");
  await describe(1, "농장 과수원 풍경");
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  await page.getByLabel("첨부 내용").fill("테스트 감귤\n제주산 감귤입니다.");
  await page.getByLabel("첨부 내용").blur();
  await expect(page.getByRole("button", { name: "텍스트 내용 수정", exact: true })).toBeVisible();
  await page.getByLabel("과일 품종명", { exact: true }).fill("온주밀감");
  await page.getByLabel("과일 품종명", { exact: true }).blur();
  await expect(page.getByText("상품사진 2장 · 자료 1개")).toBeVisible();
  await page.getByRole("button", { name: "AI로 채우기", exact: true }).click();
  await expect(page.getByTestId("source-analysis-status")).toBeVisible();
  work();
  await expect(page.getByTestId("source-analysis-status")).toHaveCount(0, { timeout: 30_000 });
  const confirm = page.getByTestId("excluded-modal").getByRole("button", { name: "확인", exact: true });
  if (await confirm.count()) await confirm.click();
  expect(photos).toHaveLength(2);
  await expect.poll(() => blobPhotos(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  const healthy = await stableBlobPhotos(page);

  // Reopen with the second photo's display preview failing.
  const failing = photos[1];
  await page.route("**/api/source-analysis/batches/**", (route) =>
    route.request().url().includes(`/sources/${failing}/pages/1/image?variant=display`)
      ? route.fulfill({ status: 404, json: { code: "NOT_FOUND", message: "x", details: {} } })
      : route.continue(),
  );
  await page.reload();
  const alert = page.getByTestId("photo-load-failed");
  await expect(alert).toContainText("사진 1장을 불러오지 못했어요");
  const confirmAgain = page.getByTestId("excluded-modal").getByRole("button", { name: "확인", exact: true });
  if (await confirmAgain.count()) await confirmAgain.click();
  // Only the failed photo's display copy is missing; the cover and the other photo stay visible.
  await expect.poll(() => blobPhotos(page)).toBe(healthy - 1);
  await page.unroute("**/api/source-analysis/batches/**");
  const retried: string[] = [];
  page.on("request", (r) => {
    if (/\/pages\/1\/image/.test(r.url())) retried.push(r.url());
  });
  await alert.getByRole("button", { name: "사진 다시 불러오기", exact: true }).click();
  await expect(alert).toHaveCount(0);
  await expect.poll(() => blobPhotos(page)).toBe(healthy);
  expect(retried).toHaveLength(1);
  expect(retried[0]).toContain(`/sources/${failing}/pages/1/image?variant=display`);
  clean();
});

test("AC-SRC-11 DEV-341: sales preview shows the other photos when one fails", async ({ page }) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  const python = (code: string) =>
    execFileSync(path.resolve("server/.venv/bin/python"), ["-c", code], {
      cwd: path.resolve("server"),
      env: process.env,
    }).toString();
  // Remember p-house as it is, so later specs see the same product after this test.
  const original = python(`
import json
from tests import migrations_models
from app.core.db import get_sessionmaker
from app.catalog.models import Product
with get_sessionmaker()() as db:
    p = db.get(Product, "p-house")
    print(json.dumps({"photos": p.photos, "module_detail": p.module_detail}))
`).trim();
  const ids = execFileSync(
    path.resolve("server/.venv/bin/python"),
    [
      "-c",
      `
from pathlib import Path
from tests import migrations_models
from app.core.db import get_sessionmaker
from app.catalog.models import Product
from app.source_analysis.models import PublicPhoto, ProductWorkspace
from app.source_analysis.photos import public_photo
from app.source_analysis.storage import Storage
names = ["tangerine-box.jpg", "basket.jpg", "harvest-hand.jpg"]
with get_sessionmaker()() as db:
    rows = [PublicPhoto(product_id="p-house", storage_key=Storage().put(public_photo(Path("../apps/consumer/public/photos/" + n).read_bytes()))) for n in names]
    db.add_all(rows)
    db.flush()
    uris = [f"/api/source-media/{r.id}" for r in rows]
    p = db.get(Product, "p-house")
    p.photos = [uris[0], *p.photos]
    p.module_detail = {"schemaVersion": 1, "modules": [{"id": "taste", "texts": [{"fieldKey": "taste", "value": "달고 상큼해요"}], "photos": [{"uri": uris[1], "alt": "바구니"}, {"uri": uris[2], "alt": "수확"}]}]}
    p.version += 1
    row = db.get(ProductWorkspace, "p-house")
    if row: db.delete(row)
    db.commit()
    print(" ".join(r.id for r in rows))
`,
    ],
    { cwd: path.resolve("server"), env: process.env },
  )
    .toString()
    .trim()
    .split(/\s+/);
  // Everything after the seed runs inside try, so p-house is always put back (also before a CI retry).
  let failure: unknown = null;
  try {
    const clean = monitor(page, [/Failed to load resource: the server responded with a status of 404/]);
    await loginProducer(page, "강영수");
    await page.route("**/product-workspaces/p-house/photos/*", (route) =>
      route.request().url().includes(ids[1])
        ? route.fulfill({ status: 404, json: { code: "NOT_FOUND", message: "x", details: {} } })
        : route.continue(),
    );
    await page.goto(`${producerUrl}/products/p-house/sell`);
    await expect(page.getByTestId("sales-editor")).toBeVisible();
    // Cover and the second module photo show; only the failed one keeps the placeholder.
    await expect.poll(() => blobPhotos(page)).toBe(2);
    clean();
  } catch (e) {
    failure = e;
    throw e;
  } finally {
    try {
      python(`
import json
from tests import migrations_models
from app.core.db import get_sessionmaker
from app.catalog.models import Product
from app.source_analysis.models import PublicPhoto
saved = json.loads(${JSON.stringify(original)})
with get_sessionmaker()() as db:
    p = db.get(Product, "p-house")
    p.photos, p.module_detail = saved["photos"], saved["module_detail"]
    p.version += 1
    for photo_id in ${JSON.stringify(ids)}:
        db.delete(db.get(PublicPhoto, photo_id))
    db.commit()
`);
    } catch (restoreError) {
      // A failed restore must not hide the test's own failure; it fails the test only when it passed.
      if (!failure) throw restoreError;
      console.warn(`p-house restore failed after a test failure: ${restoreError}`);
    }
  }
});
