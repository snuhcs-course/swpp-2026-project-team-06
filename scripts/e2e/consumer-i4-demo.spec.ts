// DEV-281: a local, synthetic, automated demonstration of DEV-318 recovery.
// This records observed assertions; it does not create participant/UAT results.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, producerUrl, monitor } from "./helpers";

const viewport = { width: 1280, height: 800 };
test.use({
  viewport,
  video: { mode: "on", size: viewport },
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
  deviceScaleFactor: 1,
  // The browser is preauthenticated. Do not retain its token in a trace.
  trace: "off",
});

function localOrigin(label: string, value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error(`${label}: a valid local HTTP(S) URL is required`); }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(host) ||
      !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${label}: only a loopback HTTP(S) origin without credentials is allowed`);
  }
  return parsed.origin;
}
function utc(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return null;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
}
function hash(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
function git(...args: string[]) {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function mediaMetadata(file: string): Record<string, unknown> {
  try {
    const raw = execFileSync("ffprobe", [
      "-v", "error", "-select_streams", "v:0", "-show_entries",
      "stream=codec_name,width,height:format=duration", "-of", "json", file,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const data = JSON.parse(raw);
    const stream = data.streams?.[0];
    return {
      probed: true,
      codec: typeof stream?.codec_name === "string" ? stream.codec_name : null,
      width: typeof stream?.width === "number" ? stream.width : null,
      height: typeof stream?.height === "number" ? stream.height : null,
      durationSeconds: Number.isFinite(Number(data.format?.duration)) ? Number(data.format.duration) : null,
    };
  } catch {
    return { probed: false, reason: "ffprobe unavailable or could not read the recording" };
  }
}

/** A caption panel in the unused left margin, separate from the 480px app. */
async function caption(page: Page, scene: string, title: string, lines: string[]) {
  await page.evaluate(({ scene, title, lines }) => {
    const id = "dev281-demo-caption";
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
        boxShadow: "0 8px 32px #0000001a", pointerEvents: "none",
      });
      document.body.appendChild(panel);
    }
    panel.replaceChildren();
    const add = (text: string, size: string, weight: string, color = "#FFFFFF") => {
      const element = document.createElement("div");
      element.textContent = text;
      Object.assign(element.style, { fontSize: size, fontWeight: weight, lineHeight: "1.65", color, marginBottom: "16px", whiteSpace: "pre-wrap" });
      panel!.appendChild(element);
    };
    add("LOCAL · 자동 시연", "15px", "700", "#E6DB9C");
    add("실제 입금 없음", "21px", "700", "#FFE9B5");
    add(scene, "14px", "600", "#BBD3C5");
    add(title, "24px", "700");
    for (const line of lines) add(line, "17px", "400");
    add("합성 계정 · 합성 주문\n사람 참가자 관찰 결과 없음", "13px", "400", "#BBD3C5");
  }, { scene, title, lines });
}

test("DEV-281 AC-09-9/10 AC-10-9 AC-33-5: record the local consumer recovery demo", async ({ page, request, browser }, info) => {
  test.setTimeout(180_000);
  const startedAtUtc = new Date().toISOString();
  const startedMs = Date.now();
  const sourceCommit = git("rev-parse", "HEAD");
  const workingTreeDirty = git("status", "--porcelain", "--untracked-files=normal").length > 0;
  const sourceFiles = [
    "scripts/e2e/consumer-i4-demo.spec.ts",
    "apps/consumer/src/lib/orderText.ts",
    "apps/consumer/src/lib/useOrderDetail.ts",
    "apps/consumer/src/app/(tabs)/orders/[orderId]/index.tsx",
    "apps/consumer/src/app/(tabs)/orders/[orderId]/inquiry.tsx",
    "package-lock.json",
  ].map(file => ({ path: file, sha256: hash(path.join(process.cwd(), file)) }));
  const assertions: string[] = [];
  const artifacts: { file: string; type: string; bytes: number; sha256: string }[] = [];
  const injections: { kind: string; method: string; endpoint: string; httpStatus: number; count: number }[] = [];
  let origins: { api: string; consumer: string; producer: string } | null = null;
  let serverTimeUtc: string | null = null;
  let completed = false;
  let videoMetadata: Record<string, unknown> | null = null;
  const evidenceErrors: string[] = [];
  const video = page.video();
  // Only the explicit HTTP400 below is expected; all other browser failures count.
  const clean = monitor(page, [/Failed to load resource.*400/]);
  const screenshot = async (name: string) => {
    const file = info.outputPath(name);
    await page.screenshot({ path: file });
    artifacts.push({ file: name, type: "image/png", bytes: statSync(file).size, sha256: hash(file) });
    await info.attach(name, { path: file, contentType: "image/png" });
  };
  try {
    // All three endpoints are checked before login or any data-changing request.
    origins = {
      api: localOrigin("API", apiUrl),
      consumer: localOrigin("consumer", consumerUrl),
      producer: localOrigin("producer", producerUrl),
    };
    assertions.push("All configured service origins passed the loopback-only guard before mutation");
    const consumerToken = await apiLogin(request, "u-minji", "consumer");
    const consumer = { Authorization: `Bearer ${consumerToken}` };
    const producer = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
    const post = async (endpoint: string, headers: { Authorization: string }, data: object = {}) => {
      const response = await request.post(`${origins!.api}${endpoint}`, {
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() }, data,
      });
      // Do not echo response bodies or authentication values into evidence.
      expect(response.ok(), `Synthetic fixture API failed (HTTP ${response.status()})`).toBeTruthy();
      serverTimeUtc = utc(response.headers()["x-server-time"]) ?? serverTimeUtc;
      return response;
    };
    const created = await post("/api/orders", consumer, {
      productId: "p-house", optionId: "opt-5", quantity: 1,
      recipientName: "DEV281 합성 구매자", recipientPhone: "010-1234-5678",
      postalCode: "63584", address: "제주특별자치도 서귀포시 통합로 1", addressDetail: "101호",
      consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
      consentVersion: "dev281-demo",
    });
    const { orderId } = await created.json() as { orderId: string };
    const orderEndpoint = `/api/orders/${orderId}`;
    await post(`${orderEndpoint}/deposit`, consumer);
    await post(`${orderEndpoint}/deposit-reported`, consumer);
    const previousIssue = "자동 시연용 이전 미승인 사유";
    await post(`${orderEndpoint}/reject-deposit`, producer, { reason: previousIssue, cancel: false });
    // Configure storage before the very first page navigation: no test login UI.
    await page.addInitScript(({ token, origin }) => {
      if (location.origin === origin) localStorage.setItem("farmclub-consumer:token", token);
    }, { token: consumerToken, origin: origins.consumer });
    await page.goto(`${origins.consumer}/orders/${orderId}`);
    const warning = page.getByText("농가가 입금을 확인하지 못했어요", { exact: true });
    await expect(warning).toBeVisible();
    assertions.push("AC-09-9: the synthetic rejected deposit shows its previous warning before re-reporting");
    await caption(page, "01 / 입금 재알림", "확인한 뒤 다시 알려요", [
      "테스트 API로 미승인 상태를 준비했습니다.",
      "소비자가 앱의 ‘입금을 마쳤어요’를 눌러 다시 알립니다.",
    ]);
    await page.waitForTimeout(2000); // Narration pause, not synchronization.
    await page.getByRole("button", { name: "입금을 마쳤어요", exact: true }).click();
    const pending = page.getByRole("heading", { name: "입금 확인 중", exact: true });
    await pending.scrollIntoViewIfNeeded();
    await expect(pending).toBeVisible();
    await expect(warning).toHaveCount(0);
    await expect(page.getByText(previousIssue, { exact: false })).toHaveCount(0);
    await expect(page.getByText(/까지 입금해 주세요/)).toHaveCount(0);
    const reportedResponse = await request.get(`${origins.api}${orderEndpoint}`, { headers: consumer });
    expect(reportedResponse.ok()).toBeTruthy();
    const reported = await reportedResponse.json();
    expect(reported.depositIssue).toBe(previousIssue);
    expect(reported.depositReportedAt).toBeTruthy();
    assertions.push("AC-09-10: re-reporting shows pending confirmation without the historical rejection or another deposit prompt; the real API retains the historical issue");
    await caption(page, "01 / 확인한 결과", "현재는 농가가 확인할 차례", [
      "다시 알린 뒤 지난 미승인 안내가 사라졌습니다.",
      "이전 사유는 서버 이력에 남고, 화면은 현재 상태를 보여 줍니다.",
    ]);
    await page.waitForTimeout(2000);
    await screenshot("01-deposit-reported.png");

    await caption(page, "02 / 열린 주문 상세", "농가 승인 후 자동 반영", [
      "다음 농가 승인 동작은 테스트 API로 모의 수행합니다.",
      "실제 입금·통장 검증은 없습니다. 소비자 화면은 새로 고치지 않습니다.",
    ]);
    await page.waitForTimeout(2000);
    await post(`${orderEndpoint}/confirm-deposit`, producer);
    const reserved = page.getByRole("heading", { name: "예약 완료", exact: true });
    await expect(reserved).toBeVisible({ timeout: 12_000 });
    await expect(page).toHaveURL(`${origins.consumer}/orders/${orderId}`);
    assertions.push("AC-10-9: the same open order detail reflects producer confirmation within 12 seconds without navigation or manual refresh");
    await caption(page, "02 / 확인한 결과", "같은 화면에서 상태 갱신", [
      "자동 조회로 예약 완료 상태가 반영됐습니다.",
      "승인은 로컬 테스트 API로 수행한 모의 동작입니다.",
    ]);
    await page.waitForTimeout(2000);
    await screenshot("02-reserved-live-refresh.png");

    let inquiryReads = 0;
    await page.route(`${origins.api}${orderEndpoint}`, async route => {
      if (route.request().method() !== "GET" || !new URL(page.url()).pathname.endsWith("/inquiry"))
        return route.continue();
      inquiryReads++;
      if (inquiryReads === 1) {
        injections.push({ kind: "controlled read failure", method: "GET", endpoint: "/api/orders/{synthetic-order-id}", httpStatus: 400, count: 1 });
        return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({
          code: "INVALID_REQUEST", message: "데모용: 의도적으로 만든 일시 조회 실패", details: {},
        }) });
      }
      return route.continue();
    });
    await caption(page, "03 / 문의 오류 복구", "조회 실패를 한 번 주입", [
      "다음 오류는 자동 시연이 의도적으로 만든 HTTP 400입니다.",
      "유형·내용·사진을 작성하고 다시 시도해 보겠습니다.",
    ]);
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "상품 문제 문의 · 사진 첨부", exact: true }).click();
    const retry = page.getByRole("button", { name: "다시 시도", exact: true });
    await expect(retry).toBeVisible();
    await expect(page.getByText("주문 불러오는 중…", { exact: true })).toHaveCount(0);
    assertions.push("AC-33-5: exactly one controlled HTTP400 produces an explicit inquiry error and retry instead of a loading label");
    const description = page.getByRole("textbox", { name: "어떤 점이 불편하셨나요?", exact: true });
    const draft = "자동 시연용 문의입니다. 실제 상품 수령이나 품질 판단이 아닌 입력 보존 동작을 확인합니다.";
    await description.fill(draft);
    await page.getByRole("tab", { name: "맛", exact: true }).click();
    await page.getByLabel("비공개 사진 첨부", { exact: true }).setInputFiles(
      path.join(process.cwd(), "packages/ui/assets/source/icons/send.png"),
    );
    const photo = page.getByRole("img", { name: "비공개 문의 사진", exact: true });
    await expect(photo).toBeVisible();
    const send = page.getByRole("button", { name: "농가에 문의 보내기", exact: true });
    await expect(send).toBeDisabled();
    await caption(page, "03 / 실패 상태에서 작성", "입력은 그대로 두고 재시도", [
      "조회 오류는 의도적으로 한 번만 만들었습니다.",
      "첨부는 저장소의 공개 아이콘입니다. 실제 상품 사진이 아닙니다.",
      "유형·내용·사진을 작성한 상태로 다시 시도합니다.",
    ]);
    await retry.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    await screenshot("03-inquiry-error-draft.png");
    await retry.click();
    await expect(send).toBeEnabled();
    expect(inquiryReads).toBe(2);
    await expect(retry).toHaveCount(0);
    await expect(description).toHaveValue(draft);
    await expect(page.getByRole("tab", { name: "맛", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(photo).toBeVisible();
    assertions.push("AC-33-5: successful retry preserves the description, TASTE selection and uploaded photo and enables sending");
    await caption(page, "03 / 재시도 성공", "유형·내용·사진 보존", [
      "실제 로컬 서버에서 주문 정보를 다시 읽었습니다.",
      "작성 내용과 첨부를 유지한 채 문의를 보낼 수 있습니다.",
    ]);
    await description.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    await screenshot("04-inquiry-restored.png");
    const submitted = page.waitForResponse(response => response.request().method() === "POST" &&
      new URL(response.url()).pathname === `${orderEndpoint}/inquiries`);
    await send.click();
    const submission = await submitted;
    expect(submission.ok()).toBeTruthy();
    expect(submission.request().postDataJSON()).toMatchObject({ type: "TASTE", text: draft });
    expect(submission.request().postDataJSON().attachmentIds).toHaveLength(1);
    await expect(page).toHaveURL(new RegExp(`/chats/f-kang\\?orderId=${orderId}`));
    const persisted = await request.get(`${origins.api}${orderEndpoint}/inquiries`, { headers: consumer });
    expect(persisted.ok()).toBeTruthy();
    expect((await persisted.json()).items).toHaveLength(1);
    await expect(page.getByText(draft, { exact: true })).toBeVisible();
    assertions.push("AC-33-1/5: the real backend persists exactly one inquiry with the retained type, description and one photo, then the consumer sees it in the farm chat");
    await caption(page, "03 / 문의 접수 확인", "로컬 서버에 한 번 접수", [
      "보존된 유형·내용·사진으로 실제 로컬 API를 호출했습니다.",
      "해당 합성 주문의 문의가 한 건 저장된 것을 확인했습니다.",
      "자동 시연이며 사람의 UAT 결과는 아직 없습니다.",
    ]);
    await page.waitForTimeout(2000);
    await screenshot("05-inquiry-sent.png");
    clean();
    assertions.push("Browser monitoring found no unexpected page errors, console errors, Mock traffic or HTTP5xx responses");
    completed = true;
  } finally {
    try { await page.close(); }
    catch { evidenceErrors.push("Could not close the recording page cleanly"); }
    if (video) {
      try {
        const file = info.outputPath("consumer-i4-demo.webm");
        await video.saveAs(file);
        artifacts.push({ file: "consumer-i4-demo.webm", type: "video/webm", bytes: statSync(file).size, sha256: hash(file) });
        videoMetadata = { configuredSize: viewport, ...mediaMetadata(file) };
        await info.attach("consumer-i4-demo-video", { path: file, contentType: "video/webm" });
      } catch { evidenceErrors.push("Could not finalize or attach the demo video"); }
    } else { evidenceErrors.push("No video recording was available"); }
    const endedAtUtc = new Date().toISOString();
    const outcome = completed && evidenceErrors.length === 0 ? "passed" : "failed";
    const readme = [
      "# I4 consumer recovery — recorded local evidence", "",
      `Outcome: **${outcome}**. Automated checks completed: ${assertions.length}.`, "",
      "LOCAL / 자동 시연 / 실제 입금 없음. This is a synthetic automated demonstration, not a participant acceptance session. No participant observations, success rates, SUS scores or interviews were collected.", "",
      "The video uses the actual consumer UI and local backend. Fixture API calls prepare a rejected synthetic deposit and simulate producer confirmation. The inquiry order read deliberately returns HTTP400 exactly once; retry, attachment upload and inquiry submission use the real local API. The attachment is a repository icon, not a received-product photograph.", "",
      `Source commit: ${sourceCommit}; working tree dirty at start: ${workingTreeDirty}. Exact file hashes, browser, clock and artifact hashes are in manifest.json. The API commit is unverified (null).`, "",
      "The left caption panel is recording-only annotation in the unused desktop margin. It does not replace app content. Authentication is prepared before the first navigation; test login screens are absent. Trace recording is disabled.", "",
      "## Assertions actually completed", "", ...assertions.map(assertion => `- ${assertion}`), "",
      "## Files", "", ...artifacts.map(artifact => `- ${artifact.file} (${artifact.type}, SHA-256 ${artifact.sha256})`), "",
      "## Reproduce", "",
      "From an installed repository with a disposable local PostgreSQL database, run the existing integration runner:", "",
      "```sh", "node scripts/run-integration.mjs scripts/e2e/consumer-i4-demo.spec.ts", "```", "",
      "Use the repository's documented local database setup and integration environment. The runner resets its database. The spec rejects service URLs outside localhost, 127.0.0.1 and [::1] before mutation. Never use production URLs or data.", "",
      "Official I4 format and DEV-244 oracle/contract decisions remain separate review items. A passed automated demo does not establish participant acceptance or real payment processing.", "",
      ...(evidenceErrors.length ? ["## Evidence finalization limitations", "", ...evidenceErrors.map(error => `- ${error}`), ""] : []),
    ].join("\n");
    const readmePath = info.outputPath("README.md");
    writeFileSync(readmePath, readme);
    artifacts.push({ file: "README.md", type: "text/markdown", bytes: statSync(readmePath).size, sha256: hash(readmePath) });
    const manifest = {
      schemaVersion: 1, issue: "DEV-281", outcome,
      synthetic: true, automatedDemo: true, actualMoneyTransferred: false,
      participantResults: null, apiCommit: null,
      sourceCommit, workingTreeDirty, sourceStateCapturedAtUtc: startedAtUtc, sourceFiles,
      browser: { version: browser.version(), platform: os.platform(), architecture: os.arch() },
      viewport, locale: "ko-KR", timezone: "Asia/Seoul",
      clock: { startedAtUtc, endedAtUtc, elapsedMilliseconds: Date.parse(endedAtUtc) - startedMs, fixedNowUtc: utc(process.env.FIXED_NOW), observedServerTimeUtc: serverTimeUtc },
      localServiceOrigins: origins, authentication: "Preauthenticated synthetic account; token omitted; trace disabled",
      simulations: ["Synthetic order/deposit/report/rejection prepared through local fixture API", "Producer confirmation simulated by local API; no bank transaction"],
      injections, passedAssertions: assertions, evidenceErrors,
      video: videoMetadata, artifacts,
      limitations: ["No participant observations or acceptance results", "API commit not independently verified", "No actual bank transfer or payment verification", "DEV-244 oracle and DEV-260 official format remain separate review items"],
    };
    const manifestPath = info.outputPath("manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    try {
      await info.attach("consumer-i4-demo-manifest", { path: manifestPath, contentType: "application/json" });
      await info.attach("consumer-i4-demo-readme", { path: readmePath, contentType: "text/markdown" });
    } catch {
      // An evidence attachment failure must never leave a successful manifest.
      manifest.outcome = "failed";
      evidenceErrors.push("Could not attach the manifest or README");
      writeFileSync(readmePath, readme.replace(`Outcome: **${outcome}**`, "Outcome: **failed**"));
      const recordedReadme = artifacts.find(artifact => artifact.file === "README.md")!;
      recordedReadme.bytes = statSync(readmePath).size;
      recordedReadme.sha256 = hash(readmePath);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      throw new Error("Demo evidence attachment failed; see sanitized manifest");
    }
    if (completed && evidenceErrors.length) throw new Error("Demo evidence finalization failed; see sanitized manifest");
  }
});
