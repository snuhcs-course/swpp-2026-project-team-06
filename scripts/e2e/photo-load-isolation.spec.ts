import { test, expect } from "./fixtures";
import { producerUrl, loginProducer, monitor } from "./helpers";

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
  const loaded = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLImageElement>("img[src^='blob:']")].filter(
          (i) => i.complete && i.naturalWidth > 0,
        ).length,
    );
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
