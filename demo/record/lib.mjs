// Iteration 1 demo recorder helpers (Playwright). Records one browser context to video,
// draws a visible cursor and a step caption beside the 480px app column.
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

export const consumerUrl = process.env.FARMCLUB_CONSUMER_URL ?? "http://localhost:8081";
export const producerUrl = process.env.FARMCLUB_PRODUCER_URL ?? "http://localhost:8082";
export const apiUrl = process.env.FARMCLUB_API_URL ?? "http://localhost:8000";
const SIZE = { width: 1280, height: 800 };

// Runs in every page: cursor dot, click ripple, caption panel (state kept in sessionStorage)
const overlay = () => {
  const css = `
    #dc-cursor{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
      background:rgba(201,79,12,.35);border:2px solid #C94F0C;pointer-events:none;transition:transform .08s}
    #dc-cursor.down{transform:scale(.7);background:rgba(201,79,12,.6)}
    .dc-ripple{position:fixed;z-index:2147483646;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;
      border:2px solid #C94F0C;pointer-events:none;animation:dc-r .5s ease-out forwards}
    @keyframes dc-r{from{opacity:.9;transform:scale(.4)}to{opacity:0;transform:scale(1.4)}}
    #dc-cap{position:fixed;z-index:2147483645;left:28px;top:40px;width:330px;pointer-events:none;
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
  if (document.body) mount();
  else addEventListener("DOMContentLoaded", mount);
};

export async function startRecording(name, appLabel) {
  const dir = path.resolve("demo/.raw", name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir, size: SIZE }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await context.addInitScript(overlay);
  const page = await context.newPage();
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
      await context.close();
      await browser.close();
      const raw = readdirSync(dir).find((f) => f.endsWith(".webm"));
      renameSync(path.join(dir, raw), outFile);
      return outFile;
    },
  };
  return h;
}
