// DEV-287: render app/PWA assets from the approved artwork without redrawing the logo.
// DEV-358: DEV-311 브랜드 통합안 — 아이콘은 승인 심볼(logo-icon.png) 높이 86%, 바탕 크림 #FFF4E8(소비자)·올리브 #56652A(생산자).
//   소비자 기본 공유 카드(og.jpg 1200×630)도 여기서 그린다(크림 바탕 + 승인 조합형 + 계단 표식, 보드 `dev-311-brand-integrated.html` #og-int).
//   Android 적응형 아이콘(전경·바탕·단색)과 PWA maskable은 PM 11/18 결정으로 같은 심볼을 안전 영역 비율(SAFE_K)로, 바탕은 앱별 색.
//   스플래시와 생산자 공유 카드는 DEV-287 방식 그대로 둔다(apps/consumer/tasks/DEV-358.md).
// Run after `npx playwright install chromium`: node scripts/generate-brand-icons.mjs
// 공유 카드 글꼴은 앱과 같은 Pretendard 가변 웹폰트(CDN)라 네트워크가 필요하다.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const root = new URL("../", import.meta.url);
const png = async (file) => `data:image/png;base64,${(await readFile(new URL(file, root))).toString("base64")}`;
const original = await png("packages/ui/assets/brand/logo-paper-glow-clean.png");
const symbol = await png("packages/ui/assets/brand/logo-icon.png");
// DEV-287 방식: 두 줄 조합형을 폭 64%로, 흰 바탕(지금은 스플래시만).
const legacy = { src: original, fit: "width", k: 0.64, bg: "#ffffff" };
// DEV-311 통합안 결정 1·5: 심볼 높이 86%, 크림 바탕 · 생산자 올리브.
const BRAND_BG = { consumer: "#FFF4E8", producer: "#56652A" };
// PM 11/18: Android 적응형 층·PWA maskable은 심볼 높이 59%. 기준은 Android 안전 영역(108dp 중 지름 66dp 원 = 중심에서 한 변의 30.56%).
// logo-icon.png 알파(≥2) 끝은 중심에서 원본 한 변의 50.98%라 62%면 31.6%로 넘고, 59%면 30.08%로 들어간다(PWA 안전 원 40%도 안).
// 알파 1(0.4%) 먼지 145픽셀만 더 멀리(56.0%) 있다. 검사는 scripts/test-brand-meta.mjs.
const SAFE_K = 0.59;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const grayscale = await page.evaluate(async src => {
    const image = new Image(); image.src = src; await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d"); ctx.filter = "grayscale(1)";
    ctx.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, original);
  await writeFile(new URL("packages/ui/assets/brand/logo-grayscale.png", root), Buffer.from(grayscale, "base64"));
  for (const app of ["consumer", "producer"]) {
    const brand = { src: symbol, fit: "height", k: 0.86, bg: BRAND_BG[app] };
    // 마스크를 씌우는 아이콘(Android 적응형, PWA maskable): 같은 심볼·같은 바탕, 비율만 안전 영역에 맞춘다.
    const safe = { ...brand, k: SAFE_K };
    const targets = [
      ["assets/icon.png", 1024, brand], ["assets/favicon.png", 48, brand], ["assets/splash-icon.png", 512, legacy],
      ["assets/android-icon-foreground.png", 1024, safe, false, true],
      ["assets/android-icon-background.png", 1024, safe, false, false, true],
      ["assets/android-icon-monochrome.png", 1024, safe, true, true],
      ["public/icons/icon-192.png", 192, brand], ["public/icons/icon-512.png", 512, brand],
      ["public/icons/icon-maskable-512.png", 512, safe],
      ["public/icons/apple-touch-icon.png", 180, brand],
      ...[16, 32, 48].map(size => [`public/icons/favicon-${size}.png`, size, brand]),
    ];
    for (const [file, size, recipe, monochrome = false, transparent = false, backgroundOnly = false] of targets) {
      const data = await page.evaluate(async ({ recipe, size, monochrome, transparent, backgroundOnly }) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!transparent) { ctx.fillStyle = recipe.bg; ctx.fillRect(0, 0, size, size); }
        if (!backgroundOnly) {
          const image = new Image();
          image.src = recipe.src;
          await image.decode();
          ctx.imageSmoothingQuality = "high";
          if (monochrome) ctx.filter = "grayscale(1)";
          // Keep the original aspect ratio; the recipe fixes either the width or the height.
          let width, height;
          if (recipe.fit === "width") { width = size * recipe.k; height = width * image.naturalHeight / image.naturalWidth; }
          else { height = size * recipe.k; width = height * image.naturalWidth / image.naturalHeight; }
          ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        }
        return canvas.toDataURL("image/png").split(",")[1];
      }, { recipe, size, monochrome, transparent, backgroundOnly });
      await writeFile(new URL(`apps/${app}/${file}`, root), Buffer.from(data, "base64"));
    }
  }

  // 소비자 기본 공유 카드(사이트 공통 정적 카드 한 장, 결정 6: 상품별 동적 카드는 후속). 숫자(팬·예약·가격)는 넣지 않는다.
  // 계단 표식은 S3 알약 기둥(viewBox 14×10, 기둥 폭 3, x 0.5/5.5/10.5, 높이 5/7.5/10, 반경 1.5, 지금 100%·뒤 28%) = packages/ui StairMark.
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
    <style>html,body{margin:0}.og{width:1200px;height:630px;position:relative;overflow:hidden;background:#FFF4E8;color:#111;
      font-family:"Pretendard Variable",Pretendard,sans-serif;-webkit-font-smoothing:antialiased}</style></head><body>
    <div class="og">
      <img src="${original}" alt="" style="position:absolute;left:56px;top:150px;width:460px">
      <div style="position:absolute;left:580px;top:150px;right:64px">
        <div style="font-size:64px;font-weight:800;letter-spacing:-0.02em;line-height:84px">좋아하는 농가를<br>수확 전에 예약해요</div>
        <div style="display:flex;align-items:center;gap:22px;margin-top:40px">
          <svg viewBox="0 0 14 10" style="width:84px;height:60px;color:#111"><rect x="0.5" y="5" width="3" height="5" rx="1.5" fill="currentColor"/><rect x="5.5" y="2.5" width="3" height="7.5" rx="1.5" fill="currentColor" fill-opacity=".28"/><rect x="10.5" y="0" width="3" height="10" rx="1.5" fill="currentColor" fill-opacity=".28"/></svg>
          <div style="font-size:38px;line-height:52px;color:#6B6B6B">일찍 예약할수록 싸요</div>
        </div>
      </div>
    </div></body></html>`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
    if (!document.fonts.check('800 64px "Pretendard Variable"', "좋아하는")) throw new Error("Pretendard를 불러오지 못했어요(네트워크 확인)");
  });
  const og = await page.locator(".og").screenshot({ type: "jpeg", quality: 90 });
  await writeFile(new URL("apps/consumer/public/og.jpg", root), og);
} finally { await browser.close(); }
