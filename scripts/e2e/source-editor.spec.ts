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
  await page
    .getByTestId("source-cover")
    .getByRole("button", { name: "+ 항목 추가", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "상품 소개 추가", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "상품 소개 내용 확인", exact: true })
    .click();
  await expect(page.getByText(/내용 확인 필요/)).toBeVisible();
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
    .getByTestId("source-cover")
    .getByRole("button", { name: "+ 항목 추가", exact: true })
    .click();
  await page
    .getByRole("button", { name: "상품 소개 추가", exact: true })
    .click();
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
