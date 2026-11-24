// DEV-474 플랫폼 파일(<이름>.native|android|ios|web.<확장자>)은 그 플랫폼 번들에 실제로 들어가야 한다.
// Metro는 sourceExts 순서(ts → tsx → mjs → js → jsx → json → …)마다 `.<플랫폼>` → `.native`(웹 제외) → 접미사 없음
// 순으로 찾는다(metro-resolver resolveSourceFile·resolveSourceFileForAllExts, 웹은 preferNativePlatform이 false).
// 그래서 웹이 `postcodeSearch.ts`, 앱이 `postcodeSearch.native.tsx`이면 `ts` 단계에서 웹 파일이 먼저 잡혀
// 앱 번들에 웹 구현이 들어갔다(소비자 '우편번호 찾기'가 document 참조로 빈 화면).
// 이 검사는 확장자 문자열을 비교하지 않고 Metro 순서를 그대로 흉내 내어 플랫폼마다 잡히는 파일을 계산한다.
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const ROOTS = ["apps/consumer/src", "apps/producer/src", "packages"];
const SKIP = new Set(["node_modules", "dist", ".expo"]);
/** Expo 57 기본 sourceExts(아래 테스트가 실제 metro 설정과 같은지 확인한다) */
export const SOURCE_EXTS = ["ts", "tsx", "mjs", "js", "jsx", "json", "cjs", "scss", "sass", "css"];
const PLATFORMS = ["android", "ios", "web"];
const SUFFIX = /^(.*?)(?:\.(native|android|ios|web))?\.([a-z]+)$/;

const walk = (dir) =>
  readdirSync(path.join(root, dir)).flatMap((f) => {
    if (SKIP.has(f)) return [];
    const rel = `${dir}/${f}`;
    return statSync(path.join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });

/** Metro처럼 `base`(확장자 없는 경로)를 platform에서 해석한 파일. 없으면 null */
export function resolveLikeMetro(base, platform, exists, exts = SOURCE_EXTS) {
  for (const ext of exts)
    for (const suffix of [`.${platform}`, platform === "web" ? null : ".native", ""]) {
      if (suffix === null) continue;
      const file = `${base}${suffix}.${ext}`;
      if (exists(file)) return file;
    }
  return null;
}

/** 플랫폼 전용 파일이 있는데 그 플랫폼이 더 덜 구체적인 파일을 잡는 곳 */
export function misresolved(files, exts = SOURCE_EXTS) {
  const set = new Set(files);
  const exists = (f) => set.has(f);
  const bases = new Map();
  for (const f of files) {
    const m = f.match(SUFFIX);
    if (!m || !exts.includes(m[3]) || f.endsWith(".d.ts")) continue;
    const [, base, tag] = m;
    if (!bases.has(base)) bases.set(base, new Set());
    bases.get(base).add(tag ?? "");
  }
  const out = [];
  for (const [base, tags] of bases) {
    if (![...tags].some(Boolean)) continue; // 플랫폼 파일이 없는 보통 모듈
    for (const platform of PLATFORMS) {
      // 그 플랫폼이 잡아야 할 가장 구체적인 파일 종류
      const want = tags.has(platform) ? platform : platform !== "web" && tags.has("native") ? "native" : "";
      if (!want) continue;
      const got = resolveLikeMetro(base, platform, exists, exts);
      const gotTag = got?.match(SUFFIX)?.[2] ?? "";
      if (gotTag !== want)
        out.push(`${platform}: ${base}.${want}.* 대신 ${got ?? "(없음)"}을 잡는다`);
    }
  }
  return out;
}

test("DEV-474 플랫폼 파일은 그 플랫폼 번들에 들어간다(Metro 해석 순서 기준)", () => {
  assert.deepEqual(misresolved(ROOTS.flatMap(walk)), []);
});

test("DEV-474 검사 자체: Metro 순서로 엉뚱한 파일이 잡히는 짝은 걸린다", () => {
  const bad = (files) => misresolved(files.map((f) => `a/${f}`));
  // 이번 원인: 웹 .ts가 앱 .native.tsx보다 먼저 잡힘
  assert.deepEqual(bad(["x.ts", "x.native.tsx"]), [
    "android: a/x.native.* 대신 a/x.ts을 잡는다",
    "ios: a/x.native.* 대신 a/x.ts을 잡는다",
  ]);
  assert.equal(bad(["x.ts", "x.android.tsx"]).length, 1, ".android도 같다");
  assert.equal(bad(["x.ts", "x.ios.tsx"]).length, 1, ".ios도 같다");
  assert.deepEqual(bad(["x.ts", "x.web.tsx"]), ["web: a/x.web.* 대신 a/x.ts을 잡는다"]);
  assert.equal(bad(["x.ts", "x.tsx", "x.native.tsx"]).length, 2, "ts·tsx가 같이 있으면 ts가 먼저");
  assert.equal(bad(["x.ts", "x.native.js"]).length, 2, "js 짝");
  assert.equal(bad(["x.js", "x.native.jsx"]).length, 2, "jsx 짝");
  assert.equal(bad(["x.native.ts", "x.android.tsx"]).length, 1, ".native.ts가 .android.tsx보다 먼저");
  // 통과하는 짝
  assert.deepEqual(bad(["x.ts", "x.native.ts"]), []);
  assert.deepEqual(bad(["x.tsx", "x.native.tsx"]), []);
  assert.deepEqual(bad(["x.js", "x.native.tsx"]), [], "tsx가 js보다 먼저라 앱은 .native.tsx");
  assert.deepEqual(bad(["x.ts", "x.web.ts", "x.native.ts"]), []);
  assert.deepEqual(bad(["x.ts", "x.tsx"]), [], "플랫폼 파일이 없으면 보지 않는다");
  assert.equal(resolveLikeMetro("a/x", "web", (f) => ["a/x.tsx", "a/x.native.tsx"].includes(f)), "a/x.tsx", "웹은 .native를 보지 않는다");
});

test("DEV-474 검사가 쓰는 sourceExts가 앱 metro 설정과 같다", () => {
  for (const app of ["consumer", "producer"]) {
    const dir = path.join(root, "apps", app);
    const require = createRequire(path.join(dir, "package.json"));
    const { getDefaultConfig } = require("expo/metro-config");
    assert.deepEqual(getDefaultConfig(dir).resolver.sourceExts, SOURCE_EXTS, app);
  }
});
