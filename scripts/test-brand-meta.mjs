// DEV-358: 앱 아이콘·파비콘·기본 공유 카드·메타가 DEV-311 브랜드 통합안과 맞는지, 지금 있던 메타·아이콘 연결이 빠지지 않았는지 본다.
// 보드: docs/design/proposals/dev-311-brand-integrated.html(아이콘 · 카톡 공유 카드 · 토큰 표). 그림은 scripts/generate-brand-icons.mjs가 만든다.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const file = (p) => path.join(root, p);
const read = (p) => readFileSync(file(p), "utf8");

// <meta name|property="k" content="v"> 와 <title> 을 읽는다(속성 순서는 이 저장소의 index.html 그대로).
function head(html) {
  const meta = {};
  for (const m of html.matchAll(/<meta\s+(?:name|property)="([^"]+)"\s+content="([^"]*)"/g)) meta[m[1]] = m[2];
  const links = [...html.matchAll(/<link\s+rel="([^"]+)"(?:\s+type="[^"]*")?(?:\s+sizes="([^"]*)")?\s+href="([^"]+)"/g)].map((m) => ({
    rel: m[1],
    sizes: m[2],
    href: m[3],
  }));
  return { title: html.match(/<title>([^<]*)<\/title>/)?.[1], meta, links };
}

// PNG: 크기(IHDR)와 왼쪽 위 첫 픽셀. 첫 줄 첫 픽셀은 어떤 필터(None·Sub·Up·Average·Paeth)여도 왼쪽·위가 0이라 원래 값과 같다.
function png(p) {
  const buf = readFileSync(file(p));
  assert.equal(buf.subarray(1, 4).toString("latin1"), "PNG", `${p} PNG 아님`);
  let offset = 8;
  let width, height, colorType, bitDepth;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("latin1");
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") [width, height, bitDepth, colorType] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9]];
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  assert.equal(bitDepth, 8, `${p} 8비트`);
  assert.ok(colorType === 2 || colorType === 6, `${p} RGB·RGBA (color type ${colorType})`);
  const raw = inflateSync(Buffer.concat(idat));
  const [r, g, b] = raw.subarray(1, 4);
  const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  return { width, height, corner: hex };
}

// PNG 전체 픽셀(RGBA로 맞춤). 마스크를 씌우는 아이콘이 안전 영역 안인지 보려고 쓴다.
function decodePng(p) {
  const buf = readFileSync(file(p));
  let offset = 8;
  let width, height, colorType;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("latin1");
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") [width, height, colorType] = [data.readUInt32BE(0), data.readUInt32BE(4), data[9]];
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2];
      out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

// 그림(ink)이 차지하는 범위: 중심에서 가장 먼 점의 거리와 상자, 둘 다 한 변 대비 비율.
function inkExtent({ width, height, data }, isInk) {
  let r = 0, n = 0;
  const box = [1, 1, 0, 0];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (!isInk(data[o], data[o + 1], data[o + 2], data[o + 3])) continue;
      n++;
      r = Math.max(r, Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2) / width);
      box[0] = Math.min(box[0], x / width); box[1] = Math.min(box[1], y / height);
      box[2] = Math.max(box[2], (x + 1) / width); box[3] = Math.max(box[3], (y + 1) / height);
    }
  return { r, n, box };
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// Android 적응형: 108dp 중 지름 66dp 원 안만 늘 보인다. PWA maskable: 반지름 40% 안전 원.
const ANDROID_SAFE_R = 33 / 108;
const MASKABLE_SAFE_R = 0.4;
// PM 11/18: 마스크를 씌우는 아이콘의 심볼 높이(scripts/generate-brand-icons.mjs SAFE_K).
const SAFE_K = 0.59;

// JPEG: SOF0/SOF2 마커에서 크기.
function jpegSize(p) {
  const buf = readFileSync(file(p));
  assert.equal(buf.readUInt16BE(0), 0xffd8, `${p} JPEG 아님`);
  let offset = 2;
  while (offset < buf.length) {
    const marker = buf.readUInt16BE(offset);
    const length = buf.readUInt16BE(offset + 2);
    if (marker === 0xffc0 || marker === 0xffc2) return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  throw new Error(`${p} 크기를 찾지 못했어요`);
}

const APPS = {
  consumer: { host: "https://farmclub.kr", bg: "#FFF4E8" },
  producer: { host: "https://farm.farmclub.kr", bg: "#56652A" },
};

test("DEV-358 소비자 메타 제목·설명은 통합안 문구(보드 ‘카톡 공유 카드’ 3)", () => {
  const { title, meta } = head(read("apps/consumer/public/index.html"));
  const t = "farmclub · 좋아하는 농가를 수확 전에 예약해요";
  const d = "농가가 기간마다 가격을 정하고, 지금 예약하면 지금 가격으로 받아요.";
  assert.equal(title, t);
  assert.equal(meta["og:title"], t);
  assert.equal(meta.description, d);
  assert.equal(meta["og:description"], d);
  // 결정 1: 이름을 글자로 쓸 때는 ‘farmclub’ 하나(옛 ‘farmclub.’ 워드마크 표기 없음)
  assert.doesNotMatch(`${title} ${meta["og:title"]} ${meta["og:site_name"]}`, /farmclub\./);
});

for (const [app, { host, bg }] of Object.entries(APPS)) {
  test(`DEV-358 ${app} index.html: 있던 메타·아이콘 연결이 그대로 있다(더하기만)`, () => {
    const { title, meta, links } = head(read(`apps/${app}/public/index.html`));
    assert.ok(title?.startsWith("farmclub"), title);
    for (const key of ["description", "og:type", "og:site_name", "og:title", "og:description", "twitter:card", "theme-color", "apple-mobile-web-app-title"])
      assert.ok(meta[key], `${key} 있음`);
    assert.equal(meta["og:site_name"], "farmclub");
    assert.equal(meta["og:image"], `${host}/og.jpg`);
    assert.equal(meta["og:url"], `${host}/`);
    assert.equal(meta["og:image:width"], "1200");
    assert.equal(meta["og:image:height"], "630");
    assert.equal(meta["twitter:card"], "summary_large_image");
    const icons = links.filter((l) => l.rel === "icon").map((l) => l.sizes).sort();
    assert.deepEqual(icons, ["16x16", "32x32", "48x48"]);
    assert.ok(links.some((l) => l.rel === "apple-touch-icon" && l.sizes === "180x180"));
    assert.ok(links.some((l) => l.rel === "manifest" && l.href === "/manifest.webmanifest"));
  });

  test(`DEV-358 ${app} 공유 카드 og.jpg는 메타와 같은 1200×630`, () => {
    assert.deepEqual(jpegSize(`apps/${app}/public/og.jpg`), { width: 1200, height: 630 });
  });

  test(`DEV-358 ${app} 아이콘·파비콘: 선언한 크기와 실제 크기가 같고 바탕이 통합안 색(${bg})`, () => {
    const { links } = head(read(`apps/${app}/public/index.html`));
    for (const l of links.filter((l) => l.sizes)) {
      const p = `apps/${app}/public${l.href}`;
      assert.ok(existsSync(file(p)), `${p} 있음`);
      const [w, h] = l.sizes.split("x").map(Number);
      const img = png(p);
      assert.deepEqual([img.width, img.height], [w, h], p);
      assert.equal(img.corner, bg, `${p} 바탕`);
    }
    const manifest = JSON.parse(read(`apps/${app}/public/manifest.webmanifest`));
    for (const icon of manifest.icons) {
      const p = `apps/${app}/public${icon.src}`;
      assert.ok(existsSync(file(p)), `${p} 있음`);
      const [w, h] = icon.sizes.split("x").map(Number);
      const img = png(p);
      assert.deepEqual([img.width, img.height], [w, h], p);
      // maskable은 안전 원(반지름 40%) 안이어야 해서 `any`(86%)와 다른 파일이다. 바탕은 같은 앱별 색(PM 11/18).
      if (icon.purpose === "maskable") assert.notEqual(icon.src, "/icons/icon-512.png", "maskable은 따로 둔 그림");
      assert.equal(img.corner, bg, `${p} 바탕`);
    }
    assert.ok(manifest.icons.some((i) => i.purpose === "any" && i.sizes === "512x512"));
    assert.ok(manifest.icons.some((i) => i.purpose === "maskable"));
    const { expo } = JSON.parse(read(`apps/${app}/app.json`));
    for (const p of [expo.icon, expo.web.favicon]) assert.equal(png(`apps/${app}/${p.replace(/^\.\//, "")}`).corner, bg, `${p} 바탕`);
  });

  test(`DEV-358 ${app} 마스크를 씌우는 아이콘(Android 적응형·PWA maskable): 같은 심볼 ${SAFE_K * 100}%, 바탕 ${bg}, 안전 영역 안`, () => {
    const { expo } = JSON.parse(read(`apps/${app}/app.json`));
    const adaptive = expo.android.adaptiveIcon;
    // app.json은 바탕색만 바꾼다(PM 11/18). 층 파일 경로는 그대로.
    assert.deepEqual(adaptive, {
      backgroundColor: bg,
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    });
    const layer = (k) => decodePng(`apps/${app}/${adaptive[k].replace(/^\.\//, "")}`);
    const [br, bgG, bb] = rgb(bg);

    // 바탕 층: 1024 한 장이 전부 앱 바탕색(Expo는 backgroundImage가 있으면 그 그림을 바탕으로 쓴다)
    const back = layer("backgroundImage");
    assert.deepEqual([back.width, back.height], [1024, 1024]);
    for (let o = 0; o < back.data.length; o += 4)
      assert.deepEqual([...back.data.subarray(o, o + 4)], [br, bgG, bb, 255], `바탕 층 픽셀 ${o / 4}`);

    // 전경·단색 층: 투명 바탕 위 심볼, 보이는 알파(≥8)가 전부 Android 안전 원 안
    const source = inkExtent(decodePng("packages/ui/assets/brand/logo-icon.png"), (r, g, b, a) => a >= 8);
    const extents = {};
    for (const k of ["foregroundImage", "monochromeImage"]) {
      const img = layer(k);
      assert.deepEqual([img.width, img.height], [1024, 1024], k);
      assert.equal(img.data[3], 0, `${k} 왼쪽 위 투명`);
      const ink = inkExtent(img, (r, g, b, a) => a >= 8);
      assert.ok(ink.n > 0, `${k} 그림 있음`);
      assert.ok(ink.r <= ANDROID_SAFE_R, `${k} 그림 끝 ${(ink.r * 100).toFixed(2)}% > 안전 원 ${(ANDROID_SAFE_R * 100).toFixed(2)}%`);
      // 심볼 높이 = SAFE_K × 원본(원본 알파 상자 높이로 환산)
      const k_ = (ink.box[3] - ink.box[1]) / (source.box[3] - source.box[1]);
      assert.ok(Math.abs(k_ - SAFE_K) < 0.01, `${k} 심볼 비율 ${k_.toFixed(3)}`);
      extents[k] = ink;
    }
    // 단색 층은 전경과 같은 모양·자리
    extents.foregroundImage.box.forEach((v, i) => assert.ok(Math.abs(v - extents.monochromeImage.box[i]) < 0.003, `단색 층 상자 ${i}`));

    // PWA maskable: 불투명 앱 바탕색, 바탕과 다른 픽셀(그림)이 전부 안전 원(40%) 안, 전경 층과 같은 비율·자리
    const manifest = JSON.parse(read(`apps/${app}/public/manifest.webmanifest`));
    const maskable = manifest.icons.find((i) => i.purpose === "maskable");
    const m = decodePng(`apps/${app}/public${maskable.src}`);
    assert.deepEqual([m.width, m.height], [512, 512]);
    for (let o = 3; o < m.data.length; o += 4) assert.equal(m.data[o], 255, `maskable 불투명 ${o >> 2}`);
    const ink = inkExtent(m, (r, g, b) => Math.max(Math.abs(r - br), Math.abs(g - bgG), Math.abs(b - bb)) > 24);
    assert.ok(ink.n > 0, "maskable 그림 있음");
    assert.ok(ink.r <= MASKABLE_SAFE_R, `maskable 그림 끝 ${(ink.r * 100).toFixed(2)}% > 40%`);
    assert.ok(ink.r <= ANDROID_SAFE_R, `maskable도 Android와 같은 비율(그림 끝 ${(ink.r * 100).toFixed(2)}%)`);
    ink.box.forEach((v, i) => assert.ok(Math.abs(v - extents.foregroundImage.box[i]) < 0.01, `maskable 상자 ${i}: ${v} vs 전경 ${extents.foregroundImage.box[i]}`));
  });
}

test("DEV-358 소비자 manifest background_color는 크림 #FFF4E8(보드 토큰 표)", () => {
  assert.equal(JSON.parse(read("apps/consumer/public/manifest.webmanifest")).background_color, "#FFF4E8");
});

test("DEV-358 생산자 manifest background_color는 올리브 #56652A(PM 11/18)", () => {
  assert.equal(JSON.parse(read("apps/producer/public/manifest.webmanifest")).background_color, "#56652A");
});
