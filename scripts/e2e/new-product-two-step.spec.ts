import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

// DEV-184 v2: 새 상품 두 장 — ① 구매자 모양 채우기 ② 판매·가격 → 미리보기 → 판매 시작 요청
const sourceEnabled = process.env.SOURCE_ANALYSIS_ENABLED === "true";
const adminToken = process.env.FARMCLUB_ADMIN_TOKEN;
const shots = process.env.FARMCLUB_INTEGRATION_ARTIFACTS;
function work() {
  const cwd = path.resolve("server");
  execFileSync(
    path.join(cwd, ".venv/bin/python"),
    [
      "-c",
      "from app.source_analysis.worker import run_once\nfor _ in range(100):\n if not run_once(): break",
    ],
    { cwd, env: process.env, timeout: 120000, stdio: "pipe" },
  );
}
for (const width of [360, 390, 430]) {
  test(`DEV-184 AC-03-1/AC-04-1/AC-05-1 ${width}px: two screens from new product to sale request`, async ({
    page,
  }) => {
    test.skip(
      !sourceEnabled,
      "Requires explicitly enabled local source API and worker database",
    );
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: 850 });
    const clean = monitor(page);
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/products`);
    await page.getByRole("button", { name: "새 상품", exact: true }).click();
    await expect(page).toHaveURL(/composer=1/);

    // ① 빈 칸은 점선 네모(채우라는 표시), 가격 칸은 없다
    await page.getByRole("button", { name: "사진·자료 접기" }).first().click();
    await expect(page.getByTestId("hero-placeholder")).toBeVisible();
    await expect(page.getByLabel("상품명", { exact: true })).toHaveCSS(
      "border-top-style",
      "dashed",
    );
    await expect(page.getByText("가격·받는 시기는 다음 단계에서 정해요")).toBeVisible();
    if (shots && width === 390)
      await page.screenshot({ path: `${shots}/v2-1-empty.png` });

    await page.getByLabel("과일 품종명", { exact: true }).fill("온주밀감");
    await page.getByLabel("과일 품종명", { exact: true }).blur();
    await page.getByLabel("원산지", { exact: true }).fill("제주 서귀포");
    await page.getByRole("button", { name: "사진·자료 펼치기" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "상품사진 추가", exact: true }).click();
    await (await chooser).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
    await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
    await page
      .getByLabel("첨부 내용")
      .fill("테스트 감귤\n제주산 감귤입니다.\n서늘한 곳에 보관해 주세요.");
    await page.getByLabel("첨부 내용").blur();
    await expect(
      page.getByRole("button", { name: "텍스트 내용 수정", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "AI로 채우기", exact: true }).click();
    await expect(page.getByTestId("source-analysis-status")).toBeVisible();
    work();
    await expect(page.getByTestId("source-analysis-status")).toHaveCount(0, {
      timeout: 15000,
    });
    // 채워진 칸은 점선이 사라지고 ✨ 표시
    const name = page.getByLabel("상품명", { exact: true });
    await expect(name).toHaveValue("테스트 감귤");
    await expect(name).not.toHaveCSS("border-top-style", "dashed");
    await expect(page.getByTestId("ai-filled-badge").first()).toBeVisible();
    await name.fill("서귀포 노지 감귤");
    if (shots && width === 390)
      await page.screenshot({ path: `${shots}/v2-2-filled.png` });

    await page.getByRole("button", { name: "다음: 판매·가격", exact: true }).click();
    await expect(page).toHaveURL(/\/products\/[^/]+\/sell/);
    const productId = page.url().match(/products\/([^/]+)\/sell/)![1];
    // ② → 뒤로 → '다음'을 다시 눌러도 같은 초안을 또 반영하지 않는다(사진이 늘지 않음)
    const token = await page.evaluate(
      () => Object.entries(localStorage).find(([k]) => /token/i.test(k))?.[1],
    );
    const photos = async () =>
      (
        await (
          await page.request.get(`${apiUrl}/api/products/mine/${productId}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).json()
      ).photos.length as number;
    const before = await photos();
    expect(before).toBeGreaterThan(0);
    await page.goBack();
    await expect(page).toHaveURL(/composer=1/);
    // 새로고침해도(화면 기억이 사라져도) 세션 저장소의 반영 기록으로 같은 초안임을 알아본다
    await page.reload();
    await expect(page.getByTestId("product-detail-page")).toBeVisible();
    await page.getByRole("button", { name: "다음: 판매·가격", exact: true }).click();
    await expect(page).toHaveURL(/\/products\/[^/]+\/sell/);
    expect(await photos()).toBe(before);
    // 대표사진만 바꾸고 다시 '다음'을 누르면(새 초안) 바뀐 사진이 상품에 반영된다
    const cover = async () =>
      (
        await (
          await page.request.get(`${apiUrl}/api/products/mine/${productId}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).json()
      ).photos[0] as string;
    const oldCover = await cover();
    await page.goBack();
    await expect(page).toHaveURL(/composer=1/);
    await page.getByRole("button", { name: "사진·자료 펼치기" }).click();
    const more = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "상품사진 추가", exact: true }).click();
    await (await more).setFiles("apps/consumer/public/photos/branch.jpg");
    const tiles = page.getByTestId("product-photo-box").getByTestId("attachment-tile");
    await expect(tiles).toHaveCount(2);
    await tiles.last().getByRole("button", { name: "대표로 지정", exact: true }).click();
    await expect(
      tiles.last().getByRole("button", { name: "대표사진", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "사진·자료 접기" }).first().click();
    await page.getByRole("button", { name: "다음: 판매·가격", exact: true }).click();
    await expect(page).toHaveURL(/\/products\/[^/]+\/sell/);
    expect(await cover()).not.toBe(oldCover);

    // ② 판매·가격: 한 화면에서 옵션·받는 시기·가격·배송·물량
    const sell = page; // 스택 위의 보이는 화면만 다룬다
    await sell.getByRole("checkbox", { name: "5kg" }).last().click();
    await sell.getByRole("button", { name: /받는 시기/ }).last().click();
    // DateSheet: 시작일 → 끝날(FIXED_NOW 10/07 기준, 기본 예약 기간 다음 날부터 고를 수 있음)
    await sell.getByRole("dialog").getByRole("button", { name: /^10월 25일 .요일/ }).click();
    await sell.getByRole("dialog").getByRole("button", { name: /^10월 28일 .요일/ }).click();
    await sell.getByRole("dialog").getByRole("button", { name: "이 기간으로", exact: true }).click();
    await sell
      .getByRole("button", { name: /이 날까지 못 보내면 전액 환불/ })
      .last()
      .click();
    await sell.getByRole("dialog").getByRole("button", { name: /^10월 30일 .요일/ }).click();
    await sell.getByRole("dialog").getByRole("button", { name: "이 날로", exact: true }).click();
    await sell.getByLabel("5kg 가격", { exact: true }).last().fill("32000");
    await sell.getByLabel("5kg 박스 수", { exact: true }).last().fill("40");
    // 얼리버드 기간: 앞 기간이 더 비싸면 막힌다(R-18)
    await sell
      .getByRole("button", { name: "＋ 얼리버드 기간 추가", exact: true })
      .click();
    await expect(sell.getByTestId("price-period")).toHaveCount(2);
    await sell.getByLabel("5kg 가격", { exact: true }).first().fill("35000");
    await sell.getByLabel("5kg 박스 수", { exact: true }).first().fill("10");
    await sell.getByLabel("판매할 총 물량", { exact: true }).fill("300");
    await sell.getByLabel("한 주문 최대", { exact: true }).fill("3");
    await sell.getByRole("button", { name: "미리보기", exact: true }).click();
    await expect(sell.getByText(/뒤 기간 가격이 앞 기간보다 비싸야/)).toBeVisible();
    await sell.getByLabel("5kg 가격", { exact: true }).first().fill("29000");
    if (shots && width === 390)
      await page.screenshot({ path: `${shots}/v2-3-sell.png` });
    await sell.getByRole("button", { name: "미리보기", exact: true }).click();

    // 미리보기: 점선 칸 없이 구매자 화면, 가격 표시
    const preview = page.getByTestId("buyer-preview");
    await expect(preview).toBeVisible();
    // 상품명과 상세 맨 위 제목이 같은 이름으로 맞춰진다
    await expect(preview.getByText("서귀포 노지 감귤").first()).toBeVisible();
    await expect(preview.getByText("테스트 감귤")).toHaveCount(0);
    await expect(preview.getByText(/29,000/)).toBeVisible();
    await expect(preview.locator("input, textarea")).toHaveCount(0);
    if (shots && width === 390)
      await page.screenshot({ path: `${shots}/v2-4-preview.png` });

    // 승인 전에는 공개되지 않는다
    expect((await page.request.get(`${apiUrl}/api/products/${productId}`)).status()).toBe(404);
    await page.getByRole("button", { name: "판매 시작 요청", exact: true }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByText(/판매 시작을 요청했어요/)).toBeVisible();

    if (adminToken) {
      const mine = await page.request.get(`${apiUrl}/api/products/mine/${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pendingRequest = (await mine.json()).pendingCapacityRequest;
      expect(pendingRequest.requestedTotalGrams).toBe(300000);
      const approved = await page.request.post(
        `${apiUrl}/admin/products/${productId}/capacity-requests/${pendingRequest.requestId}/approve`,
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Idempotency-Key": `e2e-dev184-${productId}`,
          },
          data: { version: pendingRequest.version },
        },
      );
      expect(approved.ok()).toBeTruthy();
      const pub = await page.request.get(`${apiUrl}/api/products/${productId}`);
      expect(pub.status()).toBe(200);
      const body = await pub.json();
      expect(body.name).toBe("서귀포 노지 감귤");
      expect(body.moduleDetail?.modules?.length).toBeGreaterThan(0);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    clean();
  });
}
