// Iteration 1 demo recorder helpers (Playwright). Records one browser context to video,
// draws a visible cursor and a step caption beside the 480px app column.
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { chromium } from "playwright";

export const consumerUrl = process.env.FARMCLUB_CONSUMER_URL ?? "http://localhost:8081";
export const producerUrl = process.env.FARMCLUB_PRODUCER_URL ?? "http://localhost:8082";
export const apiUrl = process.env.FARMCLUB_API_URL ?? "http://localhost:8000";
const SIZE = { width: 1280, height: 800 };

// Runs in every page: cursor dot, click ripple, caption panel (state kept in sessionStorage)
const overlay = (capPos) => {
  const css = `
    #dc-cursor{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
      background:rgba(201,79,12,.35);border:2px solid #C94F0C;pointer-events:none;transition:transform .08s}
    #dc-cursor.down{transform:scale(.7);background:rgba(201,79,12,.6)}
    .dc-ripple{position:fixed;z-index:2147483646;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;
      border:2px solid #C94F0C;pointer-events:none;animation:dc-r .5s ease-out forwards}
    @keyframes dc-r{from{opacity:.9;transform:scale(.4)}to{opacity:0;transform:scale(1.4)}}
    #dc-cap{position:fixed;z-index:2147483645;left:${capPos?.left ?? 28}px;top:${capPos?.top ?? 40}px;width:${capPos?.width ?? 330}px;pointer-events:none;${capPos?.card ? "background:rgba(255,255,255,.97);border:1px solid #E8E8E6;border-radius:16px;padding:20px 24px;box-shadow:0 8px 24px rgba(0,0,0,.08);" : ""}
      font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo",sans-serif;color:#111}
    #dc-cap .app{font-size:15px;font-weight:600;color:#C94F0C;margin-bottom:12px}
    #dc-cap .step{font-size:13px;font-weight:600;color:#6B6B6B;margin-bottom:6px}
    #dc-cap .t{font-size:26px;font-weight:700;letter-spacing:-.02em;line-height:1.25;margin-bottom:10px}
    #dc-cap .d{font-size:16px;line-height:1.55;color:#333;white-space:pre-line}
    #dc-cap .id{margin-top:12px;font-size:13px;color:#6B6B6B}`;
  const mount = () => {
    if (document.getElementById("dc-cursor")) return;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    const c = document.createElement("div");
    c.id = "dc-cursor";
    c.style.left = "-40px";
    document.body.appendChild(c);
    const cap = document.createElement("div");
    cap.id = "dc-cap";
    document.body.appendChild(cap);
    window.__dcCap = (v) => {
      sessionStorage.setItem("dc-cap", JSON.stringify(v));
      cap.style.display = v ? "" : "none";
      cap.innerHTML = v ? `<div class="app">${v.app}</div><div class="step">${v.step}</div><div class="t">${v.title}</div><div class="d">${v.desc ?? ""}</div>${v.ids ? `<div class="id">${v.ids}</div>` : ""}` : "";
    };
    try {
      window.__dcCap(JSON.parse(sessionStorage.getItem("dc-cap") ?? "null"));
    } catch {}
    const pos = JSON.parse(sessionStorage.getItem("dc-pos") ?? "null");
    if (pos) Object.assign(c.style, { left: pos[0] + "px", top: pos[1] + "px" });
    addEventListener("mousemove", (e) => {
      c.style.left = e.clientX + "px";
      c.style.top = e.clientY + "px";
      sessionStorage.setItem("dc-pos", JSON.stringify([e.clientX, e.clientY]));
    }, true);
    addEventListener("mousedown", (e) => {
      c.classList.add("down");
      const r = document.createElement("div");
      r.className = "dc-ripple";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 600);
    }, true);
    addEventListener("mouseup", () => c.classList.remove("down"), true);
  };
  // 카카오 로그인·동의 화면: 계정 정보(이메일·이름)가 영상에 남지 않게 가린다. 단추는 그대로 눌린다
  if (/(^|\.)kakao\.com$/.test(location.hostname)) {
    const veil = () => {
      if (document.getElementById("dc-veil")) return;
      const v = document.createElement("div");
      v.id = "dc-veil";
      v.style.cssText = "position:fixed;inset:0;z-index:2147483640;background:#FEE500;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;pointer-events:none;font-family:-apple-system,sans-serif;color:#191919";
      v.innerHTML = '<div style="font-size:28px;font-weight:700">카카오 로그인</div><div style="font-size:16px">계정 정보는 영상에서 가렸어요</div>';
      document.documentElement.appendChild(v);
    };
    if (document.body) veil();
    else addEventListener("DOMContentLoaded", veil);
  }
  if (document.body) mount();
  else addEventListener("DOMContentLoaded", mount);
};

/** capPos: 캡션 위치 {left, top, width}(넓은 화면용). 기본은 앱 기둥 왼쪽 여백 */
export async function startRecording(name, appLabel, capPos) {
  const dir = path.resolve("demo/.raw", name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // DEMO_PROFILE이 있으면 저장되는 프로필로 창을 띄운다(운영 녹화: 카카오·관리자 로그인 상태를 미리 만들어 둠)
  // DEMO_HQ=1: Playwright 녹화(VP8 약 1Mbit)를 쓰지 않고, 2배 밀도로 그린 화면을 CDP screencast로 받아 H.264(crf 18)로 묶는다
  const hq = process.env.DEMO_HQ === "1";
  const opts = { viewport: SIZE, locale: "ko-KR", timezoneId: "Asia/Seoul", ...(hq ? { deviceScaleFactor: 2 } : { recordVideo: { dir, size: SIZE } }) };
  const profile = process.env.DEMO_PROFILE;
  const browser = profile ? null : await chromium.launch({ headless: !hq }); // 헤드리스는 screencast를 1배로만 보낸다
  const context = profile ? await chromium.launchPersistentContext(profile, { ...opts, headless: false }) : await browser.newContext(opts);
  await context.addInitScript(overlay, capPos ?? null);
  const page = context.pages()[0] ?? (await context.newPage());
  const frames = [];
  let cdp = null;
  if (hq) {
    cdp = await context.newCDPSession(page);
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      const f = path.join(dir, `f${String(frames.length).padStart(6, "0")}.jpg`);
      writeFileSync(f, Buffer.from(data, "base64"));
      frames.push({ f, t: metadata.timestamp });
      cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: SIZE.width * 2, maxHeight: SIZE.height * 2, everyNthFrame: 1 });
  }
  let n = 0;
  const pace = Number(process.env.DEMO_PACE ?? 1);
  const wait = (ms) => page.waitForTimeout(ms * pace);
  const h = {
    page,
    wait,
    /** Step caption on the left */
    async cap(title, desc = "", ids = "") {
      n += 1;
      await page.evaluate((v) => window.__dcCap?.(v), { app: appLabel, step: `STEP ${n}`, title, desc, ids }).catch(() => {});
      await wait(1400);
    },
    async go(url) {
      await page.goto(url);
      await page.waitForLoadState("networkidle").catch(() => {});
      await wait(900);
    },
    /** Move the visible cursor to the element, then click */
    async tap(locator, { after = 900 } = {}) {
      await locator.waitFor({ state: "visible", timeout: 15000 });
      await locator.scrollIntoViewIfNeeded();
      const b = await locator.boundingBox();
      if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
      await wait(250);
      await locator.click();
      await wait(after);
    },
    /** Click then type at a readable speed */
    async type(locator, text, { after = 500 } = {}) {
      await h.tap(locator, { after: 200 });
      await locator.fill("");
      await locator.pressSequentially(text, { delay: 45 });
      await wait(after);
    },
    /** Scroll the app column */
    async scroll(dy, { steps = 8 } = {}) {
      await page.mouse.move(640, 420, { steps: 10 });
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, dy / steps);
        await page.waitForTimeout(60);
      }
      await wait(700);
    },
    async finish(outFile) {
      await page.evaluate(() => window.__dcCap?.(null)).catch(() => {});
      await wait(600);
      if (hq) {
        const end = Date.now() / 1000;
        await cdp.send("Page.stopScreencast").catch(() => {});
        await context.close();
        await browser?.close();
        // 화면이 바뀔 때만 프레임이 오므로, 각 프레임을 다음 프레임 시각까지 보여 주는 concat 목록을 만든다
        const list = frames.map((x, i) => `file '${x.f}'\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? end) - x.t).toFixed(4)}`);
        list.push(`file '${frames.at(-1).f}'`);
        writeFileSync(path.join(dir, "frames.txt"), list.join("\n"));
        const mp4 = outFile.replace(/\.webm$/, ".mp4");
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "frames.txt"), "-vf", "scale=2560:1600:flags=lanczos,fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", mp4]);
        return mp4;
      }
      await context.close();
      await browser?.close();
      const raw = readdirSync(dir).find((f) => f.endsWith(".webm"));
      renameSync(path.join(dir, raw), outFile);
      return outFile;
    },
  };
  return h;
}
