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
      // maskable은 안전 원(80%) 안이어야 해서 통합안 86% 그림을 쓰지 않는다(판단 필요로 남김, 지금 그림 유지)
      if (icon.purpose === "maskable") assert.notEqual(icon.src, "/icons/icon-512.png", "maskable은 따로 둔 그림");
      else assert.equal(img.corner, bg, `${p} 바탕`);
    }
    assert.ok(manifest.icons.some((i) => i.purpose === "any" && i.sizes === "512x512"));
    assert.ok(manifest.icons.some((i) => i.purpose === "maskable"));
    const { expo } = JSON.parse(read(`apps/${app}/app.json`));
    for (const p of [expo.icon, expo.web.favicon]) assert.equal(png(`apps/${app}/${p.replace(/^\.\//, "")}`).corner, bg, `${p} 바탕`);
  });
}

test("DEV-358 소비자 manifest background_color는 크림 #FFF4E8(보드 토큰 표)", () => {
  assert.equal(JSON.parse(read("apps/consumer/public/manifest.webmanifest")).background_color, "#FFF4E8");
});
