import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { apiUrl, producerUrl, loginProducer, apiLogin } from "./helpers";

test("AC-SRC-11: failed atomic save preserves input and retries the same payload", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  await loginProducer(page, "강영수");
  const token = await apiLogin(page.request, "u-kang", "producer");
  const headers = { Authorization: `Bearer ${token}` };
  const batch = await (
    await page.request.post(`${apiUrl}/api/source-analysis/batches`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { targets: [{ name: "실패 복원 검증", productId: "p-house" }] },
    })
  ).json();
  await page.request.post(
    `${apiUrl}/api/source-analysis/batches/${batch.id}/sources`,
    {
      headers,
      multipart: {
        batchVersion: batch.version,
        text: "테스트 감귤\n제주산 감귤입니다.\n서늘한 곳에 보관해 주세요.",
        common: "false",
        targetIds: batch.targets[0].id,
      },
    },
  );
  await page.request.post(
    `${apiUrl}/api/source-analysis/batches/${batch.id}/sources`,
    {
      headers,
      multipart: {
        batchVersion: (
          await (
            await page.request.get(
              `${apiUrl}/api/source-analysis/batches/${batch.id}`,
              { headers },
            )
          ).json()
        ).version,
        common: "true",
        originalPhoto: "true",
        file: {
          name: "cover.jpg",
          mimeType: "image/jpeg",
          buffer: (await import("node:fs")).readFileSync(
            "apps/consumer/public/photos/tangerine-box.jpg",
          ),
        },
      },
    },
  );
  const current = await (
    await page.request.get(
      `${apiUrl}/api/source-analysis/batches/${batch.id}`,
      { headers },
    )
  ).json();
  await page.request.post(
    `${apiUrl}/api/source-analysis/batches/${batch.id}/runs`,
    {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { batchVersion: current.version },
    },
  );
  execFileSync(
    path.resolve("server/.venv/bin/python"),
    [
      "-c",
      "from app.source_analysis.worker import run_once\nfor _ in range(100):\n if not run_once(): break",
    ],
    { cwd: path.resolve("server"), env: process.env, timeout: 120000 },
  );
  await page.route(`**/batches/${batch.id}/review`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.sourcePhotoRequests = [
      { sourceId: "fixture", requests: ["추가 원본 사진 요청"] },
    ];
    body.editorFields.find(
      (e: { field: { fieldKey: string } }) => e.field.fieldKey === "hero",
    ).status = "conflict";
    await route.fulfill({ response, json: body });
  });
  await page.goto(
    `${producerUrl}/products/source-analysis?batchId=${batch.id}`,
  );
  await page
    .getByRole("button", { name: "상세페이지 편집", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "상품 소개 표시", exact: true }),
  ).toBeChecked();
  await expect(page.getByTestId("canvas-content-hero")).toHaveCSS(
    "opacity",
    "0.45",
  );
  await expect(
    page.getByRole("button", { name: "+ 항목 추가", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/내용 확인 필요/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /사진 추가 제안/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText("추가 원본 사진 요청", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("한눈에 보기 내용", { exact: true })
    .fill("직접 수정한 내용은 실패해도 남아요.");
  const keys: string[] = [];
  await page.route(`**/batches/${batch.id}/editor`, async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1)
      return route.fulfill({
        status: 503,
        json: { code: "UNAVAILABLE", message: "저장 연결 실패 검증" },
      });
    await route.continue();
  });
  await page.getByRole("button", { name: "비공개 저장", exact: true }).click();
  await expect(
    page.getByText("저장 연결 실패 검증", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("한눈에 보기 내용", { exact: true }),
  ).toHaveValue("직접 수정한 내용은 실패해도 남아요.");
  await page.getByRole("button", { name: "비공개 저장", exact: true }).click();
  await expect(
    page.getByText(
      "비공개 초안을 저장했어요. 상품에는 아직 적용되지 않았어요.",
    ),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.reload();
  await page
    .getByRole("button", { name: "상세페이지 편집", exact: true })
    .click();
  await expect(
    page.getByLabel("한눈에 보기 내용", { exact: true }),
  ).toHaveValue("직접 수정한 내용은 실패해도 남아요.");
});

test("AC-SRC-11: photos without descriptions remain available for manual placement", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  const { readFileSync } = await import("node:fs");
  await loginProducer(page, "강영수");
  const token = await apiLogin(page.request, "u-kang", "producer");
  const headers = { Authorization: `Bearer ${token}` };
  const batch = await (
    await page.request.post(`${apiUrl}/api/source-analysis/batches`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { targets: [{ name: "사진 배치 확인", productId: "p-house" }] },
    })
  ).json();
  const photo = await page.request.post(
    `${apiUrl}/api/source-analysis/batches/${batch.id}/sources`,
    {
      headers,
      multipart: {
        batchVersion: batch.version,
        common: "true",
        originalPhoto: "true",
        file: {
          name: "product.jpg",
          mimeType: "image/jpeg",
          buffer: readFileSync("apps/consumer/public/photos/tangerine-box.jpg"),
        },
      },
    },
  );
  expect(photo.ok()).toBeTruthy();
  const current = await (
    await page.request.get(
      `${apiUrl}/api/source-analysis/batches/${batch.id}`,
      { headers },
    )
  ).json();
  await page.request.post(
    `${apiUrl}/api/source-analysis/batches/${batch.id}/runs`,
    {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { batchVersion: current.version },
    },
  );
  execFileSync(
    path.resolve("server/.venv/bin/python"),
    [
      "-c",
      "from app.source_analysis.worker import run_once\nfor _ in range(100):\n if not run_once():break",
    ],
    { cwd: path.resolve("server"), env: process.env, timeout: 120000 },
  );
  await page.goto(
    `${producerUrl}/products/source-analysis?batchId=${batch.id}`,
  );
  await page
    .getByRole("button", { name: "상세페이지 편집", exact: true })
    .click();
  await expect(page.getByText(/아직 배치되지 않은 사진/)).toBeVisible();
  await page
    .getByRole("button", { name: "상품 소개 사진 추가", exact: true })
    .click();
  await page
    .getByRole("button", { name: "상품사진 1 추가", exact: true })
    .click();
  await expect(
    page.getByTestId("source-photo-frame").getByRole("img"),
  ).toBeVisible();
});

test("AC-SRC-11: inline photo description survives failure and flushes before analysis", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  const { readFileSync } = await import("node:fs");
  await loginProducer(page, "강영수");
  const token = await apiLogin(page.request, "u-kang", "producer");
  const headers = { Authorization: `Bearer ${token}` };
  const batch = await (
    await page.request.post(`${apiUrl}/api/source-analysis/batches`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { targets: [{ name: "사진 설명 저장", productId: "p-house" }] },
    })
  ).json();
  const photo = await (
    await page.request.post(
      `${apiUrl}/api/source-analysis/batches/${batch.id}/sources`,
      {
        headers,
        multipart: {
          batchVersion: batch.version,
          common: "true",
          originalPhoto: "true",
          file: {
            name: "hidden-filename.jpg",
            mimeType: "image/jpeg",
            buffer: readFileSync(
              "apps/consumer/public/photos/tangerine-box.jpg",
            ),
          },
        },
      },
    )
  ).json();
  await page.goto(
    `${producerUrl}/products/source-analysis?batchId=${batch.id}`,
  );
  let rejected = false;
  await page.route(`**/sources/${photo.id}/details`, async (route) => {
    if (route.request().method() === "PUT" && !rejected) {
      rejected = true;
      return route.fulfill({
        status: 503,
        json: { code: "UNAVAILABLE", message: "설명 저장 실패 검증" },
      });
    }
    await route.continue();
  });
  const description = page.getByLabel("사진 한 줄 설명", { exact: true });
  await description.fill("포장 사진");
  await description.blur();
  await expect(
    page
      .getByTestId("product-photo-box")
      .getByText("설명을 저장하지 못했어요. 입력은 그대로 남아 있어요."),
  ).toBeVisible();
  await expect(description).toHaveValue("포장 사진");
  await page
    .getByRole("button", { name: "설명 저장 다시 시도", exact: true })
    .click();
  await expect
    .poll(async () => {
      const latest = await (
        await page.request.get(
          `${apiUrl}/api/source-analysis/batches/${batch.id}`,
          { headers },
        )
      ).json();
      return latest.sources[0].description;
    })
    .toBe("포장 사진");
  await expect(
    page.getByText("설명을 저장하지 못했어요. 입력은 그대로 남아 있어요."),
  ).toHaveCount(0);
  await description.fill("배송 박스 포장");
  await page
    .getByRole("button", { name: "자료 준비·분석 시작", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "분석 중이에요", exact: true }),
  ).toBeDisabled();
  const latest = await (
    await page.request.get(
      `${apiUrl}/api/source-analysis/batches/${batch.id}`,
      { headers },
    )
  ).json();
  expect(latest.sources[0].description).toBe("배송 박스 포장");
  const runs = await (
    await page.request.get(
      `${apiUrl}/api/source-analysis/batches/${batch.id}/runs`,
      { headers },
    )
  ).json();
  expect(runs.items).toHaveLength(1);
  expect(runs.items[0].inputs[0].description).toBe(
    latest.sources[0].description,
  );
  await expect(page.getByTestId("product-photo-box")).not.toContainText(
    "hidden-filename.jpg",
  );
});

test("AC-SRC-11: basic information saves, validates, survives failures and fills the editor", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  const token = await apiLogin(page.request, "u-kang", "producer");
  const headers = { Authorization: `Bearer ${token}` };
  const batch = await (
    await page.request.post(`${apiUrl}/api/source-analysis/batches`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { targets: [{ name: "기본 정보 테스트" }] },
    })
  ).json();
  await page.request.post(
    `${apiUrl}/api/source-analysis/batches/${batch.id}/sources`,
    {
      headers,
      multipart: {
        batchVersion: batch.version,
        text: "테스트 감귤\n제주산 감귤입니다.\n서늘한 곳에 보관해 주세요.",
        common: "false",
        targetIds: batch.targets[0].id,
      },
    },
  );
  await page.request.post(
    `${apiUrl}/api/source-analysis/batches/${batch.id}/sources`,
    {
      headers,
      multipart: {
        batchVersion: (
          await (
            await page.request.get(
              `${apiUrl}/api/source-analysis/batches/${batch.id}`,
              { headers },
            )
          ).json()
        ).version,
        common: "true",
        originalPhoto: "true",
        file: {
          name: "cover.jpg",
          mimeType: "image/jpeg",
          buffer: (await import("node:fs")).readFileSync(
            "apps/consumer/public/photos/tangerine-box.jpg",
          ),
        },
      },
    },
  );
  await page.goto(
    `${producerUrl}/products/source-analysis?batchId=${batch.id}`,
  );
  const variety = page.getByLabel("과일 품종명", { exact: true });
  const size = page.getByLabel("사이즈", { exact: true });
  const brix = page.getByLabel("예상 당도 (°Bx)", { exact: true });
  const start = page.getByRole("button", {
    name: "자료 준비·분석 시작",
    exact: true,
  });
  await start.click();
  await expect(page.getByTestId("source-basic-info")).toContainText(
    "과일 품종명을 입력해 주세요.",
  );
  await variety.fill("온주밀감");
  await size.fill("중과, 지름 6~7cm");
  await brix.fill("101");
  await brix.blur();
  await expect(page.getByTestId("source-basic-info")).toContainText("0~100");
  let reject = true;
  await page.route(`**/batches/${batch.id}/basic-info`, async (route) => {
    if (reject)
      return route.fulfill({
        status: 503,
        json: { code: "UNAVAILABLE", message: "기본 정보 저장 실패 검증" },
      });
    await route.continue();
  });
  await brix.fill("12.5");
  await brix.blur();
  await expect(page.getByTestId("source-basic-info")).toContainText(
    "기본 정보 저장 실패 검증",
  );
  await expect(brix).toHaveValue("12.5");
  reject = false;
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/basic-info") && r.status() === 200,
  );
  await brix.focus();
  await brix.blur();
  await saved;
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(
              `${apiUrl}/api/source-analysis/batches/${batch.id}`,
              { headers },
            )
          ).json()
        ).targets[0].basicInfo.expectedBrix,
    )
    .toBe(12.5);
  await page.reload();
  await expect(variety).toHaveValue("온주밀감");
  await expect(size).toHaveValue("중과, 지름 6~7cm");
  await expect(brix).toHaveValue("12.5");
  await page.screenshot({ path: ".artifacts/basic-info-390.png" });
  await brix.fill("13.2");
  const started = page.waitForResponse(
    (r) =>
      r.url().endsWith("/runs") &&
      r.request().method() === "POST" &&
      r.status() === 202,
  );
  await start.click();
  await started;
  await expect(variety).not.toBeEditable();
  await expect(brix).not.toBeEditable();
  execFileSync(
    path.resolve("server/.venv/bin/python"),
    [
      "-c",
      "from app.source_analysis.worker import run_once\nfor _ in range(100):\n if not run_once(): break",
    ],
    { cwd: path.resolve("server"), env: process.env, timeout: 120000 },
  );
  const edit = page.getByRole("button", {
    name: "상세페이지 편집",
    exact: true,
  });
  await expect(edit).toBeEnabled();
  await edit.click();
  await expect(
    page.getByText(/내용을 비워놓은 부분은 구매자에게 표시되지 않아요\./),
  ).toBeVisible();
  await expect(page.getByLabel("규격 내용", { exact: true })).toHaveValue(
    "품종: 온주밀감\n사이즈: 중과, 지름 6~7cm",
  );
  await expect(page.getByLabel("품질 확인 내용", { exact: true })).toHaveValue(
    "예상 당도: 13.2 °Bx",
  );
});

test("AC-SRC-11: text edits stay inside cards and representative selection survives reload and deletion", async ({
  page,
}) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/new`);
  const materials = page.getByTestId("source-material-box");
  const photos = page.getByTestId("product-photo-box");
  const start = page.getByRole("button", {
    name: "자료 준비·분석 시작",
    exact: true,
  });
  await expect(page.getByLabel("과일 품종명")).toHaveAttribute(
    "placeholder",
    "예: 온주밀감",
  );
  await page.getByLabel("과일 품종명").fill("온주밀감");
  await page.getByLabel("과일 품종명").blur();
  await expect(start).toBeDisabled();
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  await expect(materials.getByLabel("첨부 내용")).toBeFocused();
  await expect(
    page.getByRole("button", { name: "내용 저장", exact: true }),
  ).toHaveCount(0);
  let fail = true;
  await page.route("**/batches/*/sources", async (route) => {
    if (fail && route.request().method() === "POST")
      return route.fulfill({
        status: 503,
        json: { code: "UNAVAILABLE", message: "텍스트 저장 실패 검증" },
      });
    await route.continue();
  });
  await materials
    .getByLabel("첨부 내용")
    .fill("테스트 감귤\n제주산 감귤입니다.\n서늘한 곳에 보관해 주세요.");
  await materials.getByLabel("첨부 내용").blur();
  await expect(materials.getByTestId("attachment-tile")).toContainText(
    "텍스트 저장 실패 검증",
  );
  await expect(materials.getByLabel("첨부 내용")).toHaveValue(/테스트 감귤/);
  fail = false;
  await materials.getByLabel("첨부 내용").focus();
  await materials.getByLabel("첨부 내용").blur();
  await expect(materials.getByLabel("첨부 내용")).toHaveCount(0);
  await materials.getByRole("button", { name: "텍스트 내용 수정" }).click();
  await expect(materials.getByLabel("첨부 내용")).toBeFocused();
  await materials.getByLabel("첨부 내용").blur();
  await expect(materials.getByLabel("첨부 내용")).toHaveCount(0);
  for (const file of ["tangerine-box.jpg", "branch.jpg"]) {
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "상품사진 추가", exact: true })
      .click();
    await (await chooser).setFiles(`apps/consumer/public/photos/${file}`);
    await expect(
      photos.getByRole("button", { name: "대표사진", exact: true }),
    ).toHaveCount(1);
  }
  const cards = photos.getByTestId("attachment-tile");
  await expect(cards).toHaveCount(2);
  await expect(
    cards.first().getByRole("button", { name: "대표사진", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await cards
    .last()
    .getByRole("button", { name: "대표로 지정", exact: true })
    .click();
  await expect(
    cards.last().getByRole("button", { name: "대표사진", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    cards.last().getByRole("button", { name: "대표사진", exact: true }),
  ).toBeVisible();
  const star = await cards
    .last()
    .getByRole("button", { name: "대표사진", exact: true })
    .boundingBox();
  const remove = await cards
    .last()
    .getByRole("button", { name: "상품사진 삭제" })
    .boundingBox();
  expect(star!.x + star!.width).toBeLessThanOrEqual(remove!.x + 1);
  await cards.last().getByRole("button", { name: "상품사진 삭제" }).click();
  await expect(cards).toHaveCount(1);
  await expect(
    cards.first().getByRole("button", { name: "대표사진", exact: true }),
  ).toBeVisible();
  await cards.first().getByRole("button", { name: "상품사진 삭제" }).click();
  await expect(cards).toHaveCount(0);
  await expect(start).toBeDisabled();
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  await expect(materials.getByLabel("첨부 내용")).toBeFocused();
  await materials.getByLabel("첨부 내용").fill("삭제할 미저장 카드");
  await materials
    .getByTestId("attachment-tile")
    .filter({ has: page.getByLabel("첨부 내용") })
    .getByRole("button", { name: "자료 삭제" })
    .click();
  await expect(materials.getByTestId("attachment-tile")).toHaveCount(1);
  await page.reload();
  await expect(materials.getByTestId("attachment-tile")).toHaveCount(1);
});
