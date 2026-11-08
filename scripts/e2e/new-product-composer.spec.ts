import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

// DEV-184 새 상품 한 화면 편집 + 하단 AI 시트
const sourceEnabled = process.env.SOURCE_ANALYSIS_ENABLED === "true";
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
// Exact local mock fixture, also declared by server/app/ai/source_analysis.py.
const mixedSource = [
  "테스트 감귤", "제주산 감귤입니다.", "서늘한 곳에 보관해 주세요.",
  "천혜향 3kg 32,000원", "반품 배송비 5,000원", "고객센터 평일 10시~5시",
  "면역력 증진에 좋아요",
  "청견과 구치노쓰37호에 마코트를 교배한 품종으로 당도가 높고 과즙이 풍부합니다",
  "작년 300상자 완판",
  "우체국 택배로 보내드려요", "1-3일 이내 도착",
].join("\n");
for (const width of [360, 390, 430]) {
  test(`DEV-184 AC-03-1/AC-SRC-11 ${width}px: new product opens one editor and AI sheet fills it`, async ({
    page,
  }) => {
    test.skip(
      !sourceEnabled,
      "Requires explicitly enabled local source API and worker database",
    );
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 850 });
    const clean = monitor(page);
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/products`);
    await page.getByRole("button", { name: "새 상품", exact: true }).click();
    // The editor opens directly; AI is explicitly opened from its captioned control.
    await expect(page).toHaveURL(/composer=1/);
    await expect(page.getByTestId("product-basic-info")).toBeVisible();
    await expect(page.getByLabel("상품명", { exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "상품사진 추가", exact: true }),
    ).toBeVisible();
    // No photo is required to analyse, but a brand-new product has no source yet.
    await expect(
      page.getByRole("button", { name: "AI로 채우기", exact: true }),
    ).toBeDisabled();
    await expect(page.getByText("자료를 먼저 넣어 주세요.", { exact: true })).toBeVisible();
    if (shots && width === 390)
      await page.screenshot({ path: `${shots}/dev184-1-open.png` });
    // 사진이 첨부함 맨 앞
    const boxes = await page
      .locator(
        '[data-testid="product-photo-box"], [data-testid="source-material-box"]',
      )
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    expect(boxes).toEqual(["product-photo-box", "source-material-box"]);

    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "상품사진 추가", exact: true })
      .click();
    await (
      await chooser
    ).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
    await page
      .getByRole("button", { name: "텍스트 추가", exact: true })
      .click();
    await page
      .getByLabel("첨부 내용")
      .fill(width === 390 ? mixedSource : "테스트 감귤\n제주산 감귤입니다.\n서늘한 곳에 보관해 주세요.");
    await page.getByLabel("첨부 내용").blur();
    await expect(
      page.getByRole("button", { name: "텍스트 내용 수정", exact: true }),
    ).toBeVisible();
    // 품종은 기본 정보 칸에서 한 번만 입력
    await page.getByRole("button", { name: "AI 시트 닫기" }).first().click();
    // 손가락·마우스로 접은 뒤에는 포커스 테두리가 남지 않는다(키보드 포커스만 표시)
    await expect(
      page.getByRole("button", { name: "AI 시트 열기" }),
    ).toHaveCSS("outline-style", "none");
    if (shots && width === 390)
      await page.screenshot({ path: `${shots}/dev184-0-collapsed.png` });
    await page.getByLabel("원산지", { exact: true }).fill("제주 서귀포");
    await page.getByRole("button", { name: "AI 시트 열기" }).click();
    await page.getByLabel("과일 품종명", { exact: true }).fill("온주밀감");
    await page.getByLabel("과일 품종명", { exact: true }).blur();
    await expect(page.getByText("상품사진 1장 · 자료 1개")).toBeVisible();
    await page
      .getByRole("button", { name: "AI로 채우기", exact: true })
      .click();

    // 분석 중: 시트가 접히고 상세페이지 자리에 진행 안내
    await expect(page.getByTestId("source-analysis-status")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "다음: 판매·가격", exact: true }),
    ).toBeDisabled();
    if (shots && width === 390)
      await page.screenshot({ path: `${shots}/dev184-2-working.png` });
    work();
    await expect(page.getByTestId("source-analysis-status")).toHaveCount(0, {
      timeout: 15000,
    });
    if (width === 390) {
      const modal = page.getByTestId("excluded-modal");
      await expect(modal).toBeVisible();
      await expect(modal.getByRole("heading")).toHaveText("이 정보들은 상세 페이지에 못 넣어서 빼 뒀어요 🙂");
      await expect(modal.getByText("AI가 자료에서 찾았지만 팜클럽 상세에는 맞지 않는 내용이에요.", { exact: true })).toBeVisible();
      for (const label of ["💰 금액", "📅 기간", "🛡️ 팜클럽 정책", "🚫 건강 효능"]) {
        await expect(modal.getByText(label, { exact: true })).toHaveCount(1);
      }
      await expect(modal.getByText("가격·배송비는 다음 단계(판매·가격)에서 직접 정해 주세요.", { exact: true })).toBeVisible();
      await expect(modal.getByText("교환·환불·문의는 팜클럽이 같은 기준으로 안내해 드려요.", { exact: true })).toBeVisible();
      await expect(modal.getByText("출하 전 취소는 전액 환불, 배송 후 하자는 교환·환불이에요.", { exact: true })).toBeVisible();
      await expect(modal.getByText("건강 효능은 상세 페이지에 넣을 수 없어요.", { exact: true })).toBeVisible();
      await expect(modal.getByTestId("excluded-item-price")).toHaveCount(2);
      await expect(modal.getByTestId("excluded-item-platform")).toHaveText("고객센터 평일 10시~5시");
      await expect(modal.getByText("판매 기간이나 받는 날은 다음 단계(판매·가격)에서 정해요.", { exact: true })).toBeVisible();
      await expect(modal.getByTestId("excluded-item-period")).toHaveText("1-3일 이내 도착");
      await expect(modal.getByTestId("excluded-item-health")).toHaveText("면역력 증진에 좋아요");
      await expect(modal).toBeInViewport({ ratio: 1 });
      // DEV-188 / AC-SRC-8/11: the last quote scrolls into view while the footer stays fixed.
      const confirm = modal.getByRole("button", { name: "확인", exact: true });
      await expect(confirm).toBeInViewport({ ratio: 1 });
      const footerBeforeScroll = await confirm.boundingBox();
      const quotes = modal.locator('[data-testid^="excluded-item-"]');
      await expect(quotes).toHaveCount(5);
      await quotes.last().scrollIntoViewIfNeeded();
      await expect(quotes.last()).toBeInViewport({ ratio: 1 });
      await expect(confirm).toBeInViewport({ ratio: 1 });
      expect(await confirm.boundingBox()).toEqual(footerBeforeScroll);
      const healthQuote = modal.getByText("면역력 증진에 좋아요", { exact: true });
      await expect(healthQuote).toHaveCSS("font-style", "italic");
      await expect(healthQuote).toHaveCSS("-webkit-line-clamp", "2");
      if (shots) await page.screenshot({ path: `${shots}/dev186-1-excluded-modal.png` });
      await modal.getByRole("button", { name: "확인", exact: true }).click();
      await expect(modal).toHaveCount(0);
      await expect(page.getByTestId("excluded-chip")).toHaveText("AI가 뺀 문구 5개");
      await page.getByTestId("excluded-chip").scrollIntoViewIfNeeded();
      await expect(page.getByTestId("excluded-chip")).toBeInViewport();
      if (shots) await page.screenshot({ path: `${shots}/dev186-2-excluded-chip.png` });
      await page.getByTestId("excluded-chip").click();
      await expect(modal).toBeVisible();
      await modal.getByRole("button", { name: "확인", exact: true }).click();
      await page.reload();
      await expect(page.getByTestId("excluded-chip")).toBeVisible();
      await expect(modal).toHaveCount(0);
      await page.getByLabel("원산지", { exact: true }).fill("제주 서귀포");
      await expect(page.getByLabel("배송 안내 내용", { exact: true })).toHaveValue("우체국 택배로 보내드려요");
      await expect(page.getByLabel("맛과 향 내용", { exact: true })).toHaveValue("당도가 높고 과즙이 풍부합니다");
    }
    await expect(page.getByTestId("ai-filled-badge")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "원문 보기", exact: true })).toHaveCount(0);
    if (shots && width === 390) {
      await page.screenshot({ path: `${shots}/dev184-3-filled.png` });
      await page.getByTestId("product-detail-page").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/dev184-3b-detail.png` });
    }
    // 기본값 칸만 AI 값으로 채움(상품명·보관), 가격은 채우지 않음(AC-03-1)
    await expect(page.getByLabel("상품명", { exact: true })).toHaveValue(
      "테스트 감귤",
    );
    await page.getByText("상품정보", { exact: true }).click();
    await expect(page.getByLabel("보관", { exact: true })).toHaveValue(
      "서늘한 곳에 보관해 주세요.",
    );
    await expect(page.getByText(/AI가 채웠어요/)).toHaveCount(0);
    await expect(
      page
        .getByTestId("product-basic-info")
        .getByRole("textbox", { name: /가격/ }),
    ).toHaveCount(0);
    // 저장하지 않은 상세 수정은 AI로 다시 채워도 남는다(AC-SRC-11)
    const summary = page.getByLabel("상품 소개 보충 내용", { exact: true });
    if (width === 390) {
      await summary.fill("면역력 증진 32,000원");
      await expect(page.getByText("금액은 다음 단계(판매·가격)에서 직접 채워 주세요", { exact: true })).toBeVisible();
      await expect(page.getByText("건강 효능 문구는 넣을 수 없어요", { exact: true }).first()).toBeVisible();
    }
    await summary.fill("농부가 직접 고친 한 줄 소개");
    await summary.blur();
    await page.getByRole("button", { name: "AI 시트 열기" }).click();
    await page
      .getByRole("button", { name: "AI로 다시 채우기", exact: true })
      .click();
    await expect(page.getByTestId("source-analysis-status")).toBeVisible();
    work();
    await expect(page.getByTestId("source-analysis-status")).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(summary).toHaveValue("농부가 직접 고친 한 줄 소개");
    // 분석 뒤 기본 정보를 바꿔도(reviewVersion 증가) 임시 저장·적용이 막히지 않는다
    await page.getByLabel("사이즈", { exact: true }).fill("중과");
    await page.getByLabel("사이즈", { exact: true }).blur();
    // 직접 입력한 원산지는 그대로, 가격 칸은 이 화면에 없다
    await expect(page.getByLabel("원산지", { exact: true })).toHaveValue(
      "제주 서귀포",
    );
    await page.getByLabel("상품명", { exact: true }).fill("서귀포 노지 감귤");

    // 임시 저장은 비공개, 다음은 (판매 전 상품이라 확인 없이) 상세를 반영하고 판매·가격으로
    await page.getByRole("button", { name: "임시 저장", exact: true }).click();
    await expect(page.getByText(/비공개로 저장했어요/)).toBeVisible();
    await page
      .getByRole("button", { name: "다음: 판매·가격", exact: true })
      .click();
    await expect(page).toHaveURL(/\/products\/[^/]+\/sell/);
    const token = await page.evaluate(
      () => Object.entries(localStorage).find(([k]) => /token/i.test(k))?.[1],
    );
    const sellId = page.url().match(/products\/([^/]+)\/sell/)![1];
    const mine = await (
      await page.request.get(`${apiUrl}/api/products/mine/${sellId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    expect([mine.name, mine.variety, mine.info.origin]).toEqual([
      "서귀포 노지 감귤",
      "온주밀감",
      "제주 서귀포",
    ]);
    expect(mine.moduleDetail?.modules?.length).toBeGreaterThan(0);
    // 판매 승인 전이라 공개 상세는 없다(적용 ≠ 공개)
    const id = sellId;
    const pub = await page.request.get(`${apiUrl}/api/products/${id}`);
    expect(pub.status()).toBe(404);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    if (width === 390) {
      // Complete sale settings to inspect the real shared buyer preview.
      await page.getByRole("checkbox", { name: "5kg", exact: true }).last().click();
      await page.getByRole("button", { name: /받는 시기/ }).last().click();
      await page.getByRole("dialog").getByRole("button", { name: /^10월 25일 .요일/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: /^10월 28일 .요일/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: "이 기간으로", exact: true }).click();
      await page.getByRole("button", { name: /이 날까지 못 보내면 전액 환불/ }).last().click();
      await page.getByRole("dialog").getByRole("button", { name: /^10월 30일 .요일/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: "이 날로", exact: true }).click();
      await page.getByLabel("5kg 가격", { exact: true }).fill("28000");
      await page.getByLabel("5kg 박스 수", { exact: true }).fill("40");
      await page.getByLabel("판매할 총 물량", { exact: true }).fill("300");
      await page.getByLabel("한 주문 최대", { exact: true }).fill("3");
      await page.getByRole("button", { name: "구매자 화면 보기", exact: true }).click();
      const preview = page.getByTestId("buyer-preview");
      await expect(preview).toBeVisible();
      await expect(preview.getByTestId("excluded-chip")).toHaveCount(0);
      await expect(preview.getByTestId("excluded-modal")).toHaveCount(0);
      await expect(preview.getByText(/32,000|5,000|면역력|효능|고객센터 평일/)).toHaveCount(0);
      await expect(preview.getByText(/당도가 높고 과즙이 풍부합니다/)).toBeVisible();
      // Actual sale price entered in step ② is still rendered normally.
      await expect(preview.getByText(/28,000/)).toBeVisible();
    }
    clean();
  });
}
