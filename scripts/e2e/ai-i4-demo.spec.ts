// DEV-282: Zahra's I4 working demo segment — the two AI features she improved in I4.
// Scene 1 (DEV-265, FEAT-13): everyday chat questions answered by the rule step; haggling is handed off.
// Scene 2 (DEV-264, FEAT-03): draft filling fills the editor and leaves out unsafe text (code on main).
// Local stack only, mock source-analysis provider, and no model call: chat questions are chosen so the
// rule step or the mandatory-handoff rule answers them. Not a participant/UAT session.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer, loginProducer, monitor, producerUrl } from "./helpers";

const viewport = { width: 1280, height: 800 };
test.use({
  viewport,
  video: { mode: "on", size: viewport },
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
  deviceScaleFactor: 1,
  trace: "off", // the browser is preauthenticated; keep tokens out of traces
});

// Exact local mock fixture (server/app/ai/source_analysis.py MOCK_REFINE_TEXT).
const mixedSource = [
  "테스트 감귤", "제주산 감귤입니다.", "서늘한 곳에 보관해 주세요.",
  "천혜향 3kg 32,000원", "반품 배송비 5,000원", "고객센터 평일 10시~5시",
  "면역력 증진에 좋아요",
  "청견과 구치노쓰37호에 마코트를 교배한 품종으로 당도가 높고 과즙이 풍부합니다",
  "작년 300상자 완판",
  "우체국 택배로 보내드려요", "1-3일 이내 도착",
].join("\n");

function localOrigin(label: string, value: string): string {
  const parsed = new URL(value);
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(host) || parsed.username || parsed.password)
    throw new Error(`${label}: only a loopback origin is allowed (got ${parsed.origin})`);
  return parsed.origin;
}
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Run the source-analysis worker once over the queue (mock provider, local DB). */
function work() {
  const cwd = path.resolve("server");
  execFileSync(
    path.join(cwd, ".venv/bin/python"),
    ["-c", "from app.source_analysis.worker import run_once\nfor _ in range(100):\n if not run_once(): break"],
    { cwd, env: process.env, timeout: 120000, stdio: "pipe" },
  );
}

/** Caption panel in the unused left margin, outside the app column (same style as DEV-281). */
async function caption(page: Page, scene: string, title: string, lines: string[]) {
  await page.evaluate(({ scene, title, lines }) => {
    const id = "dev282-demo-caption";
    let panel = document.getElementById(id);
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = id;
      panel.setAttribute("aria-label", "자동 시연 설명");
      Object.assign(panel.style, {
        position: "fixed", left: "24px", top: "32px", width: "344px",
        boxSizing: "border-box", padding: "24px", borderRadius: "20px",
        background: "#173A2C", color: "#FFFFFF", zIndex: "2147483647",
        fontFamily: 'Pretendard, "Apple SD Gothic Neo", sans-serif',
        wordBreak: "keep-all", overflowWrap: "break-word",
        boxShadow: "0 8px 32px #0000001a", pointerEvents: "none",
      });
      document.body.appendChild(panel);
    }
    panel.replaceChildren();
    const add = (text: string, size: string, weight: string, color = "#FFFFFF") => {
      const el = document.createElement("div");
      el.textContent = text;
      Object.assign(el.style, { fontSize: size, fontWeight: weight, lineHeight: "1.6", color, marginBottom: "14px", whiteSpace: "pre-wrap" });
      panel!.appendChild(el);
    };
    add("LOCAL · 자동 시연 · AI 기능", "15px", "700", "#E6DB9C");
    add(scene, "14px", "600", "#BBD3C5");
    add(title, "24px", "700");
    for (const line of lines) add(line, "17px", "400");
    add("합성 계정 · 로컬 서버\n사람 참가자 관찰 결과 없음", "13px", "400", "#BBD3C5");
  }, { scene, title, lines });
}

test("DEV-282 FEAT-13 AC-13 FEAT-03 AC-SRC-2/3/8: record the AI chat and draft-filling demo", async ({ page, request, browser }, info) => {
  // Opt-in only: it changes the shared seed (chat messages, a new draft), which other specs count.
  test.skip(process.env.FARMCLUB_AI_DEMO !== "1", "Recording only: set FARMCLUB_AI_DEMO=1 (DEV-282)");
  test.skip(process.env.SOURCE_ANALYSIS_PROVIDER !== "mock", "Requires the local mock source-analysis provider");
  test.setTimeout(240_000);
  const startedAtUtc = new Date().toISOString();
  const sourceCommit = git("rev-parse", "HEAD");
  const workingTreeDirty = git("status", "--porcelain").length > 0;
  const sourceFiles = [
    "scripts/e2e/ai-i4-demo.spec.ts",
    "server/app/ai/service.py",
    "server/app/source_analysis/refinement.py",
    "server/app/source_analysis/text_safety.py",
    "server/app/source_analysis/text_safety_lists.json",
  ].map(file => ({ path: file, sha256: hash(file) }));
  const assertions: string[] = [];
  const artifacts: { file: string; type: string; bytes: number; sha256: string }[] = [];
  let completed = false;
  const video = page.video();
  const clean = monitor(page);
  const pause = () => page.waitForTimeout(5000); // narration pause, not synchronisation
  const screenshot = async (name: string) => {
    const file = info.outputPath(name);
    await page.screenshot({ path: file });
    artifacts.push({ file: name, type: "image/png", bytes: statSync(file).size, sha256: hash(file) });
  };
  try {
    const origins = {
      api: localOrigin("API", apiUrl),
      consumer: localOrigin("consumer", consumerUrl),
      producer: localOrigin("producer", producerUrl),
    };
    assertions.push("All service origins passed the loopback-only guard before any data change");

    // ── Setup through the local API: farm AI on, 이서준's room in AUTO ──
    const producerToken = await apiLogin(request, "u-kang", "producer");
    const producer = { Authorization: `Bearer ${producerToken}` };
    const settings = await (await request.get(`${origins.api}/api/farms/me/ai-settings`, { headers: producer })).json();
    expect((await request.put(`${origins.api}/api/farms/me/ai-settings`, {
      headers: { ...producer, "Idempotency-Key": `dev282-ai-on-${Date.now()}` },
      data: { ...settings, enabled: true },
    })).ok()).toBeTruthy();
    const chat = await (await request.get(`${origins.api}/api/messaging/producer/chats/u-seojun/messages`, { headers: producer })).json();
    if (chat.thread.aiMode !== "AUTO") {
      expect((await request.put(`${origins.api}/api/messaging/producer/chats/u-seojun/ai-mode`, {
        headers: { ...producer, "Idempotency-Key": `dev282-auto-${Date.now()}` },
        data: { mode: "AUTO", version: chat.thread.version },
      })).ok()).toBeTruthy();
    }
    // Log in on a separate tab so the recorded page never shows the test-login screen.
    const login = await page.context().newPage();
    await loginConsumer(login, "이서준");
    await loginProducer(login, "강영수");
    await login.close();
    await page.goto(`${origins.consumer}/chats/f-kang?productId=p-house&start=1`);
    await caption(page, "01 / AI 문의 응대 (DEV-265)", "일상 표현 질문에 등록 정보로 답해요", [
      "소비자가 상품 화면에서 농가에 묻습니다.",
      "배송·당도처럼 등록된 사실은 규칙 단계가 바로 답합니다(모델 호출 없음).",
    ]);
    const composer = page.getByRole("textbox", { name: "메시지" });
    await expect(composer).toBeEditable({ timeout: 15_000 });
    await pause();
    const ask = async (text: string) => {
      await composer.fill(text);
      await page.getByRole("button", { name: "전송", exact: true }).click();
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    };

    await ask("언제쯤 보내주셔요?");
    await expect(page.getByText(/에 받을 예정이에요\.$/).last()).toBeVisible({ timeout: 15_000 });
    assertions.push("CAP-005 '언제쯤 보내주셔요?' is answered with the registered delivery window (was handed off before DEV-265)");
    await caption(page, "01 / 받는 시기", "‘언제쯤 보내주셔요?’ → 배송 기간으로 답변", [
      "I4 전에는 이 말투를 이해하지 못해 농가에 넘겼습니다.",
      "지금은 등록된 배송 기간으로 바로 답합니다.",
    ]);
    await pause();

    await ask("얼마나 달아요?");
    await expect(page.getByText("등록된 실측 당도는 11.8Brix예요.", { exact: true }).last()).toBeVisible({ timeout: 15_000 });
    assertions.push("CAP-031 '얼마나 달아요?' is answered with the registered measured Brix and no taste judgement");
    await caption(page, "01 / 당도", "‘얼마나 달아요?’ → 등록된 실측 당도", [
      "맛을 평가하지 않고 농가가 등록한 실측값만 말합니다.",
    ]);
    await pause();
    await screenshot("01-chat-rule-answers.png");

    await ask("택배비 빼주시면 안 돼요?");
    await caption(page, "01 / 꼭 농가가 답할 질문", "가격 흥정은 AI가 답하지 않아요", [
      "‘택배비 빼 주세요’는 흥정이라 농가에 넘깁니다(M-07).",
      "I4 전에는 이 질문에 AI가 답해 버렸습니다(안전 실패).",
    ]);
    await expect(page.getByText("AI가 답하기 어려운 질문이라 농가에 답변을 요청했어요. 농가가 답하면 여기서 볼 수 있어요.", { exact: true }).last())
      .toBeVisible({ timeout: 15_000 });
    // The fee rule would answer "배송비는 …원이에요"/"무료배송이에요"; the haggling rule must win (M-07).
    await expect(page.getByText(/배송비는 .*원이에요|무료배송이에요/)).toHaveCount(0);
    await pause();
    await screenshot("02-chat-handoff.png");
    assertions.push("CAP-021 '택배비 빼주시면 안 돼요?' gets no AI answer and is handed to the farmer");

    // ── Scene 2: draft filling ──
    await page.goto(`${origins.producer}/products`);
    await page.getByRole("button", { name: "새 상품", exact: true }).click();
    await expect(page).toHaveURL(/composer=1/);
    await page.getByRole("button", { name: "AI 시트 열기", exact: true }).click();
    await caption(page, "02 / AI 초안 채우기 (DEV-264)", "농가 자료로 상세페이지 초안을 채워요", [
      "농가가 가진 소개 글을 붙여 넣습니다.",
      "이 시연은 로컬 모의(mock) 분석기를 씁니다. 실제 모델 결과가 아닙니다.",
      "자료에는 가격·환불·건강 효능처럼 넣으면 안 되는 문구가 섞여 있습니다.",
    ]);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "상품사진 추가", exact: true }).click();
    await (await chooser).setFiles("apps/consumer/public/photos/tangerine-box.jpg");
    await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
    await page.getByLabel("첨부 내용").fill(mixedSource);
    await page.getByLabel("첨부 내용").blur();
    // Wait for each save before the next edit, as the composer spec does (DEV-184).
    await expect(page.getByRole("button", { name: "텍스트 내용 수정", exact: true })).toBeVisible();
    await page.getByLabel("과일 품종명", { exact: true }).fill("천혜향");
    await page.getByLabel("과일 품종명", { exact: true }).blur();
    await expect(page.getByText("상품사진 1장 · 자료 1개")).toBeVisible();
    await pause();
    await page.getByRole("button", { name: "AI로 채우기", exact: true }).click();
    await expect(page.getByTestId("source-analysis-status")).toBeVisible();
    work();
    await expect(page.getByTestId("source-analysis-status")).toHaveCount(0, { timeout: 20_000 });

    const modal = page.getByTestId("excluded-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("excluded-item-health")).toHaveText("면역력 증진에 좋아요");
    await expect(modal.getByTestId("excluded-item-price")).toHaveCount(2);
    await expect(modal.getByTestId("excluded-item-platform")).toHaveText("고객센터 평일 10시~5시");
    assertions.push("AC-SRC-8: price, platform-policy, period and health-claim text are left out and listed for the farmer");
    await caption(page, "02 / AI가 뺀 문구", "넣으면 안 되는 문구는 빼고 보여 줘요", [
      "금액·고객센터·기간·건강 효능 문구를 상세페이지에서 뺐습니다.",
      "왜 뺐는지 이유별로 농가에게 보여 줍니다.",
      "이 시연에선 모의 2단계가 서버와 같은 안전 검사 함수로 분류합니다.",
    ]);
    await pause();
    await screenshot("03-draft-excluded.png");
    await modal.getByRole("button", { name: "확인", exact: true }).click();
    await expect(modal).toHaveCount(0);

    await expect(page.getByLabel("상품명", { exact: true })).toHaveValue("테스트 감귤");
    await expect(page.getByLabel("배송 안내 내용", { exact: true })).toHaveValue("우체국 택배로 보내드려요");
    await expect(page.getByLabel("맛과 향 내용", { exact: true })).toHaveValue("당도가 높고 과즙이 풍부합니다");
    const detail = page.getByTestId("product-detail-page");
    await expect(detail.getByText(/32,000|5,000|면역력|고객센터 평일/)).toHaveCount(0);
    assertions.push("AC-SRC-2/3: the editor is filled from the source (name, taste, delivery) with none of the left-out text");
    await page.getByLabel("맛과 향 내용", { exact: true }).scrollIntoViewIfNeeded();
    await caption(page, "02 / 채워진 초안", "자료에 있는 사실만 채웠어요", [
      "상품명·맛·배송 안내가 자료에 있는 문구로 채워졌습니다.",
      "가격은 다음 단계에서 농가가 직접 정합니다.",
    ]);
    await pause();
    await screenshot("04-draft-filled.png");

    clean();
    assertions.push("No unexpected page errors, console errors, Mock traffic or HTTP 5xx responses");
    completed = true;
  } finally {
    try { await page.close(); } catch { /* recorded below as missing video if it failed */ }
    if (video) {
      const file = info.outputPath("ai-i4-demo.webm");
      await video.saveAs(file);
      artifacts.push({ file: "ai-i4-demo.webm", type: "video/webm", bytes: statSync(file).size, sha256: hash(file) });
    }
    const outcome = completed ? "passed" : "failed";
    const manifest = {
      schemaVersion: 1, issue: "DEV-282", outcome, automatedDemo: true, synthetic: true,
      sourceAnalysisProvider: process.env.SOURCE_ANALYSIS_PROVIDER ?? null,
      chatModelCalls: "none expected: every question is answered by the rule step or the mandatory-handoff rule",
      participantResults: null, apiCommit: null, sourceCommit, workingTreeDirty, sourceFiles,
      browser: { version: browser.version(), platform: os.platform(), architecture: os.arch() },
      viewport, clock: { startedAtUtc, endedAtUtc: new Date().toISOString(), fixedNow: process.env.FIXED_NOW ?? null },
      passedAssertions: assertions, artifacts,
      limitations: [
        "Draft filling uses the local mock provider, not real model output",
        "Improvement numbers are from the I4 evaluation documents, not from this recording",
        "No participant observations or acceptance results",
      ],
    };
    writeFileSync(info.outputPath("manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
});
