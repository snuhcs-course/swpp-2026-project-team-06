import { test, expect, type Page } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { producerUrl, loginProducer, monitor } from "./helpers";

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

/** The file part of a multipart upload body (content type + bytes). */
function filePart(body: Buffer, contentType: string) {
  const boundary = "--" + /boundary=(.+)$/.exec(contentType)![1];
  for (const part of body.toString("latin1").split(boundary)) {
    if (!/filename=/.test(part)) continue;
    const head = part.slice(0, part.indexOf("\r\n\r\n"));
    const data = part.slice(head.length + 4, part.lastIndexOf("\r\n"));
    return { type: /Content-Type: (\S+)/i.exec(head)?.[1], bytes: Buffer.from(data, "latin1") };
  }
  throw new Error("no file part");
}

/** Width/height from a JPEG's SOF marker. */
function jpegSize(bytes: Buffer) {
  expect(bytes.subarray(0, 2).toString("hex")).toBe("ffd8");
  let i = 2;
  while (i < bytes.length) {
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  throw new Error("no SOF marker");
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
// Photo adding shows its own progress (not the '수정본 저장' button).
test("AC-SRC-11 DEV-341: product page editor isolates a failed photo and retries only it", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  test.setTimeout(120_000);
  // The deliberately failed photo request is the only expected console error.
  const clean = monitor(page, [/Failed to load resource: the server responded with a status of 404/]);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await expect(page.getByTestId("page-save-state")).toBeVisible();
  const loaded = () => blobPhotos(page);
  const before = await loaded();

  // Slow the uploads down a little so the progress label on the add button is observable.
  await page.route("**/product-workspaces/p-house/photos", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "사진 추가", exact: true }).click();
  await (await chooser).setFiles([
    "apps/consumer/public/photos/tangerine-box.jpg",
    "apps/consumer/public/photos/basket.jpg",
  ]);
  await expect(page.getByRole("button", { name: /^사진 올리는 중 [01]\/2$/ })).toBeVisible();
  // The save button is not the one showing upload progress.
  await expect(page.getByRole("button", { name: "수정본 저장", exact: true })).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.getByRole("button", { name: "사진 추가", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(loaded).toBe(before + 2);
  await page.unroute("**/product-workspaces/p-house/photos");
  await page.getByRole("button", { name: "수정본 저장", exact: true }).click();
  await expect(page.getByTestId("page-save-state")).toHaveText("저장됨 · 아직 소비자에게 안 보여요");

  // Reopen with the first new photo failing: the rest stay visible.
  let failing: string | null = null;
  await page.route("**/product-workspaces/p-house/photos/*", async (route) => {
    const id = route.request().url().split("/").pop()!.split("?")[0];
    if (route.request().method() === "GET" && (failing ??= id) === id)
      return route.fulfill({ status: 404, json: { code: "NOT_FOUND", message: "x", details: {} } });
    return route.continue();
  });
  await page.reload();
  const alert = page.getByTestId("photo-load-failed");
  await expect(alert).toContainText("사진 1장을 불러오지 못했어요");
  await expect.poll(loaded).toBe(before + 1);
  // Retry fetches only the failed photo.
  await page.unroute("**/product-workspaces/p-house/photos/*");
  const retried: string[] = [];
  page.on("request", (r) => {
    if (/\/product-workspaces\/p-house\/photos\/[^/]+$/.test(new URL(r.url()).pathname) && r.method() === "GET")
      retried.push(new URL(r.url()).pathname.split("/").pop()!);
  });
  await alert.getByRole("button", { name: "사진 다시 불러오기", exact: true }).click();
  await expect(alert).toHaveCount(0);
  await expect.poll(loaded).toBe(before + 2);
  expect(retried).toEqual([failing]);
  // Other edits do not refetch photos (only a URI list change does).
  const count = retried.length;
  await page.getByRole("button", { name: "설명 추가", exact: true }).click();
  await page.waitForTimeout(500);
  expect(retried.length).toBe(count);
  clean();
});

test("AC-SRC-11 DEV-341: product page uploads are shrunk to a 1600px JPEG, transparent PNG on white", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  test.setTimeout(120_000);
  const clean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/detail`);
  await expect(page.getByTestId("page-save-state")).toBeVisible();
  // Make a phone-size JPEG and a small transparent PNG in the browser (no binary fixtures in git).
  const [big, alpha] = await page.evaluate(async () => {
    const make = (w: number, h: number, type: string, draw: (c: CanvasRenderingContext2D) => void) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      draw(canvas.getContext("2d")!);
      return canvas.toDataURL(type, 0.9).split(",")[1];
    };
    return [
      make(2400, 1800, "image/jpeg", (c) => {
        const g = c.createLinearGradient(0, 0, 2400, 1800);
        g.addColorStop(0, "#f80");
        g.addColorStop(1, "#060");
        c.fillStyle = g;
        c.fillRect(0, 0, 2400, 1800);
      }),
      make(300, 200, "image/png", (c) => {
        c.fillStyle = "rgba(255, 128, 0, 1)";
        c.fillRect(100, 50, 100, 100); // the rest stays fully transparent
      }),
    ];
  });
  const uploads: { type?: string; bytes: Buffer }[] = [];
  await page.route("**/product-workspaces/p-house/photos", async (route) => {
    const request = route.request();
    if (request.method() === "POST")
      uploads.push(filePart(request.postDataBuffer()!, (await request.allHeaders())["content-type"]));
    await route.continue();
  });
  const before = await stableBlobPhotos(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "사진 추가", exact: true }).click();
  await (await chooser).setFiles([
    { name: "phone.jpg", mimeType: "image/jpeg", buffer: Buffer.from(big, "base64") },
    { name: "logo.png", mimeType: "image/png", buffer: Buffer.from(alpha, "base64") },
  ]);
  await expect.poll(() => blobPhotos(page)).toBe(before + 2);
  expect(uploads).toHaveLength(2);
  for (const upload of uploads) expect(upload.type).toBe("image/jpeg");
  const sizes = uploads.map((u) => jpegSize(u.bytes)).sort((a, b) => b.width - a.width);
  expect(sizes).toEqual([
    { width: 1600, height: 1200 },
    { width: 300, height: 200 },
  ]);
  // The transparent corner of the PNG became white, not black.
  const png = uploads.find((u) => jpegSize(u.bytes).width === 300)!;
  const corner = await page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    return [...context.getImageData(5, 5, 1, 1).data.slice(0, 3)];
  }, png.bytes.toString("base64"));
  for (const channel of corner) expect(channel).toBeGreaterThan(240);
  clean();
});

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
