// DEV-474 웹·앱 플랫폼 파일 쌍(<이름>.ts(x) ↔ <이름>.native.ts(x))은 확장자가 같아야 한다.
// Metro는 확장자(sourceExts: ts → tsx → …)마다 `.android` → `.native` → 접미사 없음 순으로 찾는다
// (metro-resolver resolveSourceFile). 그래서 웹이 `postcodeSearch.ts`, 앱이 `postcodeSearch.native.tsx`이면
// `.ts` 단계에서 웹 파일이 먼저 잡혀 앱 번들에 웹 구현이 들어갔다(소비자 '우편번호 찾기'가 document 참조로 빈 화면).
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const ROOTS = ["apps/consumer/src", "apps/producer/src", "packages"];
const SKIP = new Set(["node_modules", "dist", ".expo"]);
const walk = (dir) =>
  readdirSync(path.join(root, dir)).flatMap((f) => {
    if (SKIP.has(f)) return [];
    const rel = `${dir}/${f}`;
    return statSync(path.join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });

/** .native 파일마다 짝(같은 이름의 웹 파일)과 확장자가 다른 곳 */
export function mismatchedPairs(files, exists) {
  const out = [];
  for (const f of files) {
    const m = f.match(/^(.*)\.native\.(tsx?)$/);
    if (!m) continue;
    const [, base, ext] = m;
    const other = ext === "ts" ? "tsx" : "ts";
    if (exists(`${base}.${other}`) && !exists(`${base}.${ext}`))
      out.push(`${base}.${other} ↔ ${f} (확장자를 같게)`);
  }
  return out;
}

test("DEV-474 웹·앱 플랫폼 파일 쌍은 확장자가 같다(Metro가 앱 번들에 웹 파일을 넣지 않게)", () => {
  const files = ROOTS.flatMap(walk);
  const exists = (rel) => existsSync(path.join(root, rel));
  assert.deepEqual(mismatchedPairs(files, exists), []);
});

test("DEV-474 검사 자체: 웹 .ts + 앱 .native.tsx는 걸리고, 같은 확장자는 통과한다", () => {
  const set = (xs) => (rel) => xs.includes(rel);
  assert.equal(mismatchedPairs(["a/x.native.tsx"], set(["a/x.ts", "a/x.native.tsx"])).length, 1);
  assert.equal(mismatchedPairs(["a/x.native.ts"], set(["a/x.tsx", "a/x.native.ts"])).length, 1);
  assert.deepEqual(mismatchedPairs(["a/x.native.tsx"], set(["a/x.tsx", "a/x.native.tsx"])), []);
  assert.deepEqual(mismatchedPairs(["a/x.native.ts"], set(["a/x.ts", "a/x.native.ts"])), []);
});
